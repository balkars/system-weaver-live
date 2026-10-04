import { catalogOf } from "./catalog";
import { autoLayout, makeEdge, makeNode } from "./graph";
import type { Graph, SysNode } from "./types";

/** Load simulation: users → req/s → per-node utilisation → metrics → fixes. */

export const SIZES = ["S", "M", "L", "XL"] as const;
const SIZE_MULT: Record<string, number> = { S: 1, M: 2, L: 4, XL: 8 };
const SIZE_COST: Record<string, number> = { S: 40, M: 80, L: 160, XL: 320 };
const SIZE_LABEL: Record<string, string> = { S: "2 vCPU", M: "4 vCPU", L: "8 vCPU", XL: "16 vCPU" };

const REQ_PER_USER = 0.2; // each concurrent user ≈ 1 request / 5 s

const BASE_CAP: Record<string, number> = {
  frontend: 1500, backend: 500, service: 500, worker: 400, auth: 1500,
  postgres: 800, mysql: 800, mongodb: 1200, redis: 40000,
  lb: 50000, gateway: 30000, cdn: 1e7, waf: 1e6, dns: 1e7,
};
const BASE_LAT: Record<string, number> = { frontend: 20, backend: 30, service: 25, auth: 10, postgres: 5, mysql: 5, mongodb: 6, redis: 1, lb: 1, gateway: 3, cdn: 2, worker: 0 };
const CACHE_HIT = 0.8;
const CDN_HIT = 0.7;

export const parseUsers = (s?: string) => {
  const n = Number(String(s ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const fmt = (n: number) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);

export const sizeOf = (n: SysNode) => (SIZE_MULT[n.fields.Size] ? n.fields.Size : "S");
const shardsOf = (n: SysNode) => Math.max(1, parseInt(n.fields.Shards ?? "1") || 1);
const isTelemetry = (p: string) => /telemetry|replication/i.test(p);

export function capacityOf(n: SysNode) {
  const base = BASE_CAP[n.kind];
  if (!base) return Infinity;
  return base * SIZE_MULT[sizeOf(n)] * shardsOf(n);
}

export interface NodeMetrics {
  rps: number;
  cap: number;
  util: number;
  cpu: number;
  latency: number;
  errors: number;
  status: "idle" | "ok" | "hot" | "breaking" | "down";
}

export interface SimResult {
  users: number;
  rps: number;
  throughput: number;
  metrics: Map<string, NodeMetrics>;
  p95: number;
  errorRate: number;
  availability: number;
  cost: number;
  complexity: number;
  bottlenecks: SysNode[];
}

/** A scenario is an input to the simulation, not a change to the model. */
export interface Scenario {
  traffic: number;
  extraLatency: number;
  fail: string[];
}
export const BASE_SCENARIO: Scenario = { traffic: 1, extraLatency: 0, fail: [] };

const dbKindsSim = ["postgres", "mysql", "mongodb"];

export function simulate(g: Graph, sc: Scenario = BASE_SCENARIO): SimResult {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const isDown = (id: string) => !!byId.get(id)?.failed || sc.fail.includes(id);
  const flowEdges = g.edges.filter((e) => !isTelemetry(e.pattern) && byId.has(e.source) && byId.has(e.target));
  const userLoad = (n: SysNode) => parseUsers(n.fields.Concurrent) * sc.traffic;
  const users = g.nodes.filter((n) => n.kind === "user").reduce((s, n) => s + userLoad(n), 0);
  const inbound = new Map<string, number>();
  g.nodes.forEach((n) => inbound.set(n.id, n.kind === "user" ? userLoad(n) * REQ_PER_USER : 0));

  const indeg = new Map(g.nodes.map((n) => [n.id, 0]));
  flowEdges.forEach((e) => indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1));
  const queue = g.nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  const order: string[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    flowEdges.filter((e) => e.source === id).forEach((e) => {
      indeg.set(e.target, indeg.get(e.target)! - 1);
      if (indeg.get(e.target)! <= 0) queue.push(e.target);
    });
  }
  g.nodes.forEach((n) => !seen.has(n.id) && order.push(n.id));

  /** Same-kind targets are replicas; dead replicas are skipped when a healthy peer exists; a dead cache is bypassed. */
  const groupsOf = (id: string) => {
    const groups = new Map<string, string[]>();
    flowEdges.filter((e) => e.source === id).forEach((e) => {
      const k = byId.get(e.target)!.kind;
      groups.set(k, [...(groups.get(k) ?? []), e.target]);
    });
    const live = new Map<string, string[]>();
    groups.forEach((ts, k) => {
      const healthy = ts.filter((t) => !isDown(t));
      live.set(k, healthy.length ? healthy : ts);
    });
    const cache = live.get("redis");
    const hasDb = [...live.keys()].some((k) => dbKindsSim.includes(k));
    if (cache && cache.every(isDown) && hasDb) live.delete("redis");
    return live;
  };

  for (const id of order) {
    const n = byId.get(id)!;
    if (isDown(id)) continue;
    let out = inbound.get(id) ?? 0;
    if (n.kind === "redis") out *= 1 - CACHE_HIT;
    if (n.kind === "cdn") out *= 1 - CDN_HIT;
    const groups = groupsOf(id);
    const hasCache = groups.has("redis");
    groups.forEach((targets, k) => {
      const share = hasCache && dbKindsSim.includes(k) ? 0 : out / targets.length;
      targets.forEach((t) => inbound.set(t, (inbound.get(t) ?? 0) + share));
    });
  }

  const metrics = new Map<string, NodeMetrics>();
  let cost = 0;
  g.nodes.forEach((n) => {
    const rps = inbound.get(n.id) ?? 0;
    if (BASE_CAP[n.kind]) cost += SIZE_COST[sizeOf(n)] * shardsOf(n);
    if (isDown(n.id)) {
      metrics.set(n.id, { rps, cap: capacityOf(n), util: 0, cpu: 0, latency: 0, errors: 100, status: "down" });
      return;
    }
    const cap = capacityOf(n);
    const util = cap === Infinity ? 0 : rps / cap;
    const base = BASE_LAT[n.kind] ?? 0;
    const latency = base * (1 / Math.max(0.05, 1 - Math.min(util, 0.95)));
    const errors = util > 1 ? (1 - 1 / util) * 100 : 0;
    const status = rps === 0 && n.kind !== "user" ? "idle" : util > 1 ? "breaking" : util > 0.75 ? "hot" : "ok";
    metrics.set(n.id, { rps, cap, util, cpu: Math.min(100, util * 100), latency, errors, status });
  });

  const lat = new Map<string, number>();
  const ok = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const m = metrics.get(id)!;
    if (isDown(id)) {
      lat.set(id, 0);
      ok.set(id, 0);
      continue;
    }
    let down = 0;
    let succ = 1 - m.errors / 100;
    groupsOf(id).forEach((targets) => {
      const sync = targets.filter((t) => flowEdges.some((e) => e.source === id && e.target === t && !/async/i.test(e.pattern)));
      if (!sync.length) return;
      down = Math.max(down, ...sync.map((t) => (lat.get(t) ?? 0) + sc.extraLatency));
      succ *= sync.reduce((s, t) => s + (ok.get(t) ?? 1), 0) / sync.length;
    });
    lat.set(id, m.latency + down);
    ok.set(id, succ);
  }
  const userNodes = g.nodes.filter((n) => n.kind === "user");
  const totalRps = users * REQ_PER_USER;
  const served = userNodes.reduce((s, u) => s + userLoad(u) * REQ_PER_USER * (ok.get(u.id) ?? 1), 0);
  const errorRate = totalRps ? (1 - served / totalRps) * 100 : 0;
  const p95 = Math.max(0, ...userNodes.map((u) => lat.get(u.id) ?? 0)) * 1.6;
  const bottlenecks = g.nodes
    .filter((n) => metrics.get(n.id)!.status === "down" || (metrics.get(n.id)!.status === "breaking" && metrics.get(n.id)!.rps > 0))
    .sort((a, b) => metrics.get(b.id)!.util - metrics.get(a.id)!.util);
  const complexity = g.nodes.filter((n) => n.kind !== "user").length + g.edges.length * 0.5;
  return { users, rps: totalRps, throughput: served, metrics, p95, errorRate, availability: 100 - errorRate, cost, complexity, bottlenecks };
}

/* ---------- Fixes: the senior-engineer ladder ---------- */

export interface Fix {
  id: string;
  step: string; // "Scale up", "Scale out", ...
  title: string;
  why: string;
  tradeoff: string;
  apply: (g: Graph) => Graph;
}

const callersOf = (g: Graph, id: string) => g.edges.filter((e) => e.target === id && !isTelemetry(e.pattern));
const peers = (g: Graph, n: SysNode) => g.nodes.filter((x) => x.kind === n.kind && x.purpose === n.purpose);
const dbKinds = ["postgres", "mysql", "mongodb"];

function scaleUp(g: Graph, id: string): Graph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === id ? { ...n, fields: { ...n.fields, Size: SIZES[Math.min(3, SIZES.indexOf(sizeOf(n) as "S") + 1)] } } : n)) };
}

/** Add a replica and (if missing) a load balancer in front of the group. */
function scaleOut(g: Graph, id: string): Graph {
  const orig = g.nodes.find((n) => n.id === id)!;
  const group = peers(g, orig);
  const lbIn = callersOf(g, id).map((e) => g.nodes.find((n) => n.id === e.source)!).find((n) => n?.kind === "lb");
  const copy = makeNode(orig.kind, `${orig.name.replace(/ #\d+$/, "")} #${group.length + 1}`, { fields: { ...orig.fields, State: "Stateless" }, purpose: orig.purpose });
  let nodes = [...g.nodes.map((n) => (group.includes(n) ? { ...n, fields: { ...n.fields, State: "Stateless" } } : n)), copy];
  let edges = [...g.edges];
  const downstream = g.edges.filter((e) => e.source === id).map((e) => makeEdge(copy.id, e.target, { protocol: e.protocol, pattern: e.pattern, latency: e.latency }));
  if (lbIn) {
    edges.push(makeEdge(lbIn.id, copy.id, { protocol: "HTTP" }), ...downstream);
  } else {
    const lb = makeNode("lb", `${orig.name.replace(/ #\d+$/, "")} LB`);
    nodes.push(lb);
    const groupIds = new Set([...group.map((n) => n.id)]);
    const callers = g.edges.filter((e) => groupIds.has(e.target) && !isTelemetry(e.pattern));
    const srcs = [...new Set(callers.map((e) => e.source))];
    edges = edges.filter((e) => !callers.includes(e));
    edges.push(...srcs.map((s) => makeEdge(s, lb.id, { protocol: callers[0]?.protocol ?? "HTTPS" })));
    edges.push(...[...groupIds, copy.id].map((t) => makeEdge(lb.id, t, { protocol: "HTTP" })), ...downstream);
  }
  nodes = nodes.filter(Boolean);
  return { nodes, edges };
}

function addCache(g: Graph, dbId: string): Graph {
  const redis = makeNode("redis", "Redis", { purpose: "Cache" });
  const callers = callersOf(g, dbId);
  const srcs = [...new Set(callers.map((e) => e.source))];
  return {
    nodes: [...g.nodes, redis],
    edges: [...g.edges, ...srcs.map((s) => makeEdge(s, redis.id, { protocol: "RESP", latency: "1 ms" })), makeEdge(redis.id, dbId, { protocol: "SQL (miss)", latency: "5 ms" })],
  };
}

function addReplica(g: Graph, dbId: string): Graph {
  const db = g.nodes.find((n) => n.id === dbId)!;
  const rep = makeNode(db.kind, `${db.name} Replica`, { purpose: "Read replica", fields: { ...db.fields } });
  const readers = callersOf(g, dbId).map((e) => makeEdge(e.source, rep.id, { protocol: "SQL (read)", latency: "6 ms" }));
  return { nodes: [...g.nodes, rep], edges: [...g.edges, makeEdge(db.id, rep.id, { protocol: "WAL", pattern: "Replication", latency: "~200 ms lag" }), ...readers] };
}

function shard(g: Graph, dbId: string): Graph {
  return { ...g, nodes: g.nodes.map((n) => (n.id === dbId ? { ...n, fields: { ...n.fields, Shards: String(shardsOf(n) * 2), "Shard key": n.fields["Shard key"] ?? "tenant_id" } } : n)) };
}

function addCdn(g: Graph, feId: string): Graph {
  const cdn = makeNode("cdn", "CDN");
  const callers = callersOf(g, feId);
  const srcs = [...new Set(callers.map((e) => e.source))];
  return { nodes: [...g.nodes, cdn], edges: [...g.edges.filter((e) => !callers.includes(e)), ...srcs.map((s) => makeEdge(s, cdn.id)), makeEdge(cdn.id, feId, { protocol: "HTTPS (miss)" })] };
}

export function fixesFor(g: Graph, n: SysNode): Fix[] {
  const out: Fix[] = [];
  const size = sizeOf(n);
  const next = SIZES[SIZES.indexOf(size as "S") + 1];
  const wrap = (f: (g: Graph) => Graph) => (x: Graph) => autoLayout(f(x));
  if (next && BASE_CAP[n.kind])
    out.push({
      id: "up", step: "1 · Scale up", title: `Upgrade to ${next} (${SIZE_LABEL[next]})`,
      why: "Cheapest first move: a bigger machine, no code or architecture change.",
      tradeoff: `Cost doubles and there is a ceiling (XL). Still a single point of failure.`,
      apply: (x) => scaleUp(x, n.id),
    });
  if (n.kind === "frontend" && !g.nodes.some((x) => x.kind === "cdn"))
    out.push({ id: "cdn", step: "2 · Offload", title: "Put a CDN in front", why: "~70% of frontend requests are static assets; a CDN serves them from the edge.", tradeoff: "Cache invalidation on deploy.", apply: wrap((x) => addCdn(x, n.id)) });
  if (["frontend", "backend", "service", "worker", "auth"].includes(n.kind))
    out.push({
      id: "out", step: "2 · Scale out", title: g.nodes.some((x) => x.kind === "lb" && callersOf(g, n.id).some((e) => e.source === x.id)) ? "Add another instance" : "Add a 2nd instance + load balancer",
      why: "Horizontal scaling: the load balancer spreads requests across identical instances.",
      tradeoff: "Instances must be stateless — sessions move to Redis or JWT. The LB is a new hop.",
      apply: wrap((x) => scaleOut(x, n.id)),
    });
  if (dbKinds.includes(n.kind)) {
    if (!callersOf(g, n.id).some((e) => g.nodes.find((x) => x.id === e.source)?.kind === "redis") && !g.nodes.some((x) => x.kind === "redis"))
      out.push({ id: "cache", step: "2 · Cache reads", title: "Add a Redis cache", why: "Most ticket reads repeat; a cache absorbs ~80% of them before they hit the DB.", tradeoff: "Stale reads and cache invalidation.", apply: wrap((x) => addCache(x, n.id)) });
    if (n.purpose !== "Read replica")
      out.push({ id: "rep", step: "3 · Replicate", title: "Add a read replica", why: "Reads split across primary and replica; also gives you failover.", tradeoff: "Replication lag — a user may not see their own write.", apply: wrap((x) => addReplica(x, n.id)) });
    out.push({ id: "shard", step: "4 · Shard", title: `Shard data (${shardsOf(n) * 2} shards)`, why: "When writes outgrow one machine, split rows by a shard key across databases.", tradeoff: "Cross-shard queries, rebalancing and much more operational complexity. Last resort.", apply: (x) => shard(x, n.id) });
  }
  return out;
}

export const statusColor = (s?: NodeMetrics["status"]) => (s === "breaking" || s === "down" ? "var(--destructive)" : s === "hot" ? "var(--warning)" : "var(--primary)");
export const isScalable = (kind: string) => !!BASE_CAP[kind] && catalogOf(kind).category !== "client";
