import { catalogOf } from "./catalog";
import { autoLayout, makeEdge, makeNode } from "./graph";
import type { Graph, SysNode, SystemModel } from "./types";

export function seedModel(): SystemModel {
  const user = makeNode("user", "Users");
  const fe = makeNode("frontend", "Frontend");
  const be = makeNode("backend", "Backend API");
  const db = makeNode("postgres", "PostgreSQL", { purpose: "Primary transactional DB" });
  return {
    name: "Ticketing System",
    requirements: [],
    root: autoLayout({
      nodes: [user, fe, be, db],
      edges: [makeEdge(user.id, fe.id), makeEdge(fe.id, be.id, { protocol: "REST" }), makeEdge(be.id, db.id, { protocol: "SQL", latency: "5 ms" })],
    }),
  };
}

const cat = (n: SysNode) => catalogOf(n.kind).category;
const isApp = (n: SysNode) => ["backend", "service", "auth"].includes(n.kind);
const isDb = (n: SysNode) => ["postgres", "mysql", "mongodb"].includes(n.kind) && n.purpose !== "Read replica";

function insertBetween(g: Graph, from: (n: SysNode) => boolean, to: (n: SysNode) => boolean, mk: () => SysNode, edgeExtra = {}): Graph {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const matching = g.edges.filter((e) => from(byId.get(e.source)!) && to(byId.get(e.target)!));
  if (!matching.length) return g;
  const mid = mk();
  const keep = g.edges.filter((e) => !matching.includes(e));
  const srcs = [...new Set(matching.map((e) => e.source))];
  const tgts = [...new Set(matching.map((e) => e.target))];
  return {
    nodes: [...g.nodes, mid],
    edges: [
      ...keep,
      ...srcs.map((s) => makeEdge(s, mid.id, { protocol: matching[0].protocol })),
      ...tgts.map((t) => makeEdge(mid.id, t, { protocol: matching[0].protocol, pattern: matching[0].pattern, latency: matching[0].latency, ...edgeExtra })),
    ],
  };
}

function cloneNode(g: Graph, pred: (n: SysNode) => boolean, rename: (n: string) => string): Graph {
  const orig = g.nodes.find(pred);
  if (!orig) return g;
  const copy = makeNode(orig.kind, rename(orig.name), { fields: { ...orig.fields }, purpose: orig.purpose });
  const edges = g.edges.flatMap((e) => {
    if (e.target === orig.id) return [makeEdge(e.source, copy.id, { protocol: e.protocol, pattern: e.pattern })];
    if (e.source === orig.id) return [makeEdge(copy.id, e.target, { protocol: e.protocol, pattern: e.pattern })];
    return [];
  });
  return { nodes: [...g.nodes, copy], edges: [...g.edges, ...edges] };
}

const has = (g: Graph, kind: string) => g.nodes.some((n) => n.kind === kind);

export interface Requirement {
  id: string;
  title: string;
  prompt: string;
  why: string;
  tradeoff: string;
  apply: (g: Graph) => Graph;
}

export const REQUIREMENTS: Requirement[] = [
  {
    id: "10k",
    title: "10,000 concurrent users",
    prompt: "Traffic grew 100x. One frontend instance is saturating.",
    why: "A load balancer spreads requests across multiple frontend instances and removes the single-instance bottleneck.",
    tradeoff: "The LB itself becomes a critical hop; you now need health checks and stateless instances.",
    apply: (g) => {
      g = insertBetween(g, (n) => n.kind === "user", (n) => n.kind === "frontend", () => makeNode("lb", "Load Balancer"));
      g = cloneNode(g, (n) => n.kind === "frontend", (s) => `${s} #2`);
      const u = g.nodes.find((n) => n.kind === "user");
      if (u) u.fields = { ...u.fields, Concurrent: "10,000" };
      return g;
    },
  },
  {
    id: "auth",
    title: "Users must stay logged in",
    prompt: "Agents and customers need sessions and role-based access.",
    why: "A dedicated Auth Service issues JWTs and refresh tokens so every request is verified before reaching business logic.",
    tradeoff: "Auth is now on the hot path: if it fails, nobody can log in.",
    apply: (g) =>
      has(g, "auth")
        ? g
        : insertBetween(g, (n) => n.kind === "frontend", (n) => n.kind === "backend", () => makeNode("auth", "Auth Service"), { auth: "JWT" }),
  },
  {
    id: "1m",
    title: "Support 1 million users",
    prompt: "Global audience, read-heavy ticket lists, bursts during incidents.",
    why: "CDN/WAF absorbs static and malicious traffic, a second API server scales horizontally and Redis takes reads off the database.",
    tradeoff: "Cache invalidation and stale reads become real problems. Redis is a new failure mode.",
    apply: (g) => {
      if (!has(g, "cdn")) g = insertBetween(g, (n) => n.kind === "user", (n) => n.kind === "lb" || n.kind === "frontend", () => makeNode("cdn", "CDN / WAF"));
      g = g.nodes.filter((n) => n.kind === "backend").length < 2 ? cloneNode(g, (n) => n.kind === "backend", (s) => `${s} #2`) : g;
      if (!has(g, "redis")) g = insertBetween(g, isApp, isDb, () => makeNode("redis", "Redis", { purpose: "Cache" }), { protocol: "SQL", latency: "5 ms" });
      const u = g.nodes.find((n) => n.kind === "user");
      if (u) u.fields = { ...u.fields, Concurrent: "1,000,000" };
      return g;
    },
  },
  {
    id: "async",
    title: "Ticket creation must be asynchronous",
    prompt: "Ticket creation fans out to SLA timers, search indexing and routing. Requests time out.",
    why: "A queue decouples accepting a ticket from processing it. A worker consumes jobs at its own pace.",
    tradeoff: "Eventual consistency: a ticket may not appear instantly. You need idempotency and a DLQ.",
    apply: (g) => {
      if (g.nodes.some((n) => n.name === "Ticket Worker")) return g;
      const q = g.nodes.find((n) => n.kind === "queue") ?? makeNode("queue", "Message Queue", { purpose: "Async jobs" });
      const w = makeNode("worker", "Ticket Worker");
      const db = g.nodes.find(isDb);
      const apps = g.nodes.filter((n) => n.kind === "backend");
      const nodes = g.nodes.includes(q) ? [...g.nodes, w] : [...g.nodes, q, w];
      return {
        nodes,
        edges: [
          ...g.edges,
          ...apps.map((a) => makeEdge(a.id, q.id, { protocol: "AMQP", pattern: "Async", latency: "2 ms" })),
          makeEdge(q.id, w.id, { protocol: "AMQP", pattern: "Async" }),
          ...(db ? [makeEdge(w.id, db.id, { protocol: "SQL", latency: "5 ms" })] : []),
        ],
      };
    },
  },
  {
    id: "dr",
    title: "Survive a database failure",
    prompt: "A single primary went down for 40 minutes last quarter.",
    why: "A streaming read replica can be promoted on failover and serves read traffic in the meantime.",
    tradeoff: "Replication lag; writes still need the primary until promotion completes.",
    apply: (g) => {
      if (g.nodes.some((n) => n.purpose === "Read replica")) return g;
      const db = g.nodes.find(isDb);
      if (!db) return g;
      const rep = makeNode(db.kind, `${db.name} Replica`, { purpose: "Read replica", fields: { ...db.fields } });
      const readers = g.edges.filter((e) => e.target === db.id).map((e) => makeEdge(e.source, rep.id, { protocol: "SQL (read)", latency: "6 ms" }));
      return { nodes: [...g.nodes, rep], edges: [...g.edges, makeEdge(db.id, rep.id, { protocol: "WAL", pattern: "Replication", latency: "~200 ms lag" }), ...readers] };
    },
  },
  {
    id: "notify",
    title: "Email notifications",
    prompt: "Customers must be emailed when ticket status changes.",
    why: "A Notification Service consumes events from a queue so email slowness never blocks ticket updates.",
    tradeoff: "Duplicate emails on retry unless the consumer is idempotent.",
    apply: (g) => {
      if (g.nodes.some((n) => n.name === "Notification Service")) return g;
      const ns = makeNode("service", "Notification Service");
      const em = makeNode("email", "Email Provider");
      const q = g.nodes.find((n) => n.kind === "queue") ?? makeNode("queue", "Message Queue", { purpose: "Notifications" });
      const apps = g.nodes.filter((n) => n.kind === "backend");
      const nodes = [...g.nodes, ...(g.nodes.includes(q) ? [] : [q]), ns, em];
      const exists = (s: string, t: string) => g.edges.some((e) => e.source === s && e.target === t);
      return {
        nodes,
        edges: [
          ...g.edges,
          ...apps.filter((a) => !exists(a.id, q.id)).map((a) => makeEdge(a.id, q.id, { protocol: "AMQP", pattern: "Async" })),
          makeEdge(q.id, ns.id, { protocol: "AMQP", pattern: "Async" }),
          makeEdge(ns.id, em.id, { protocol: "SMTP/API", latency: "300 ms" }),
        ],
      };
    },
  },
  {
    id: "observe",
    title: "On-call needs visibility",
    prompt: "Incidents take hours to diagnose.",
    why: "Logs, metrics and traces from every service give on-call a timeline of what failed and where.",
    tradeoff: "Telemetry cost grows with traffic; sample traces.",
    apply: (g) => {
      if (has(g, "metrics")) return g;
      const m = makeNode("metrics", "Metrics");
      const l = makeNode("logs", "Logs");
      const t = makeNode("tracing", "Tracing");
      const a = makeNode("alerting", "Alerting");
      const svcs = g.nodes.filter((n) => cat(n) === "app" && n.kind !== "frontend");
      return {
        nodes: [...g.nodes, m, l, t, a],
        edges: [
          ...g.edges,
          ...svcs.flatMap((s) => [makeEdge(s.id, m.id, { protocol: "OTLP", pattern: "Telemetry" }), makeEdge(s.id, l.id, { protocol: "OTLP", pattern: "Telemetry" }), makeEdge(s.id, t.id, { protocol: "OTLP", pattern: "Telemetry" })]),
          makeEdge(m.id, a.id, { protocol: "rules", pattern: "Telemetry" }),
        ],
      };
    },
  },
  {
    id: "global",
    title: "Deploy globally",
    prompt: "EU customers see 400 ms latency and need data residency.",
    why: "Latency-based DNS routes users to the closest region; each region runs the stack.",
    tradeoff: "Cross-region data consistency and doubled infrastructure cost.",
    apply: (g) => {
      if (has(g, "dns")) return g;
      g = insertBetween(g, (n) => n.kind === "user", () => true, () => makeNode("dns", "Global DNS"));
      g.nodes.forEach((n) => {
        if (catalogOf(n.kind).domain === "infra") n.fields = { ...n.fields, Region: "us-east-1, eu-west-1" };
      });
      return g;
    },
  },
];

export interface Insight {
  level: "risk" | "warn" | "ok";
  text: string;
}

export function review(g: Graph): Insight[] {
  const out: Insight[] = [];
  const dbs = g.nodes.filter(isDb);
  if (dbs.length && !g.nodes.some((n) => n.purpose === "Read replica")) out.push({ level: "risk", text: `${dbs[0].name} is a single point of failure.` });
  const apps = g.nodes.filter((n) => n.kind === "backend");
  if (apps.length === 1) out.push({ level: "warn", text: `${apps[0].name} runs as one instance. Adding servers will help only until the database saturates.` });
  if (!g.nodes.some((n) => ["gateway", "waf", "cdn"].includes(n.kind))) out.push({ level: "warn", text: "No rate limiting in front of the API." });
  if (!has(g, "auth")) out.push({ level: "risk", text: "No authentication layer: every endpoint is public." });
  if (!g.nodes.some((n) => catalogOf(n.kind).category === "messaging") && apps.length) out.push({ level: "warn", text: "All work is synchronous; slow side-effects block users." });
  if (!g.nodes.some((n) => catalogOf(n.kind).category === "observability")) out.push({ level: "warn", text: "No observability. You won't see failures before users do." });
  const redis = g.nodes.find((n) => n.kind === "redis");
  if (redis) out.push({ level: "warn", text: `${redis.name} (${redis.purpose ?? "cache"}) adds a failure mode — make sure callers fall back to the DB.` });
  const fanIn = g.nodes.map((n) => ({ n, c: g.edges.filter((e) => e.target === n.id).length })).sort((a, b) => b.c - a.c)[0];
  if (fanIn && fanIn.c >= 3) out.push({ level: "warn", text: `${fanIn.n.name} has ${fanIn.c} dependents — high blast radius.` });
  if (!out.length) out.push({ level: "ok", text: "No obvious structural issues found." });
  return out;
}
