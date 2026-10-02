import { catalogOf } from "./catalog";
import type { Graph, SysEdge, SysNode, SystemModel } from "./types";

let counter = 0;
export const uid = (p = "n") => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export function makeNode(kind: string, name?: string, extra: Partial<SysNode> = {}): SysNode {
  const c = catalogOf(kind);
  return { id: uid(), kind, name: name ?? c.label, fields: { ...(c.fields ?? {}) }, x: 0, y: 0, ...extra };
}

export function makeEdge(source: string, target: string, extra: Partial<SysEdge> = {}): SysEdge {
  return {
    id: uid("e"),
    source,
    target,
    protocol: "HTTPS",
    pattern: "Request/Response",
    latency: "40 ms",
    rps: "100",
    auth: "None",
    timeout: "5 s",
    retry: "3",
    ...extra,
  };
}

export function getGraph(model: SystemModel, path: string[]): Graph {
  let g = model.root;
  for (const id of path) {
    const n = g.nodes.find((x) => x.id === id);
    if (!n) return g;
    g = n.children ?? defaultChildren(n);
  }
  return g;
}

export function setGraph(model: SystemModel, path: string[], fn: (g: Graph) => Graph): SystemModel {
  const rec = (g: Graph, p: string[]): Graph => {
    if (p.length === 0) return fn(g);
    const [head, ...rest] = p;
    return {
      ...g,
      nodes: g.nodes.map((n) => (n.id === head ? { ...n, children: rec(n.children ?? defaultChildren(n), rest) } : n)),
    };
  };
  return { ...model, root: rec(model.root, path) };
}

export function pathNodes(model: SystemModel, path: string[]): SysNode[] {
  const out: SysNode[] = [];
  let g = model.root;
  for (const id of path) {
    const n = g.nodes.find((x) => x.id === id);
    if (!n) break;
    out.push(n);
    g = n.children ?? defaultChildren(n);
  }
  return out;
}

/** Stable default internals generated on first drill-in. */
export function defaultChildren(n: SysNode): Graph {
  const d = catalogOf(n.kind).domain;
  const chain = (items: [string, string][], edgeProto = "call") => {
    const nodes = items.map(([k, name]) => makeNode(k, name));
    const edges = nodes.slice(1).map((t, i) => makeEdge(nodes[i].id, t.id, { protocol: edgeProto, pattern: "In-process", latency: "<1 ms" }));
    return autoLayout({ nodes, edges });
  };
  if (d === "frontend") {
    const app = makeNode("component", "React App");
    const pages = ["Login", "Ticket List", "Ticket Details", "Admin Panel"].map((p) => makeNode("component", p, { purpose: "Page" }));
    const state = makeNode("component", "State Management", { purpose: "Redux store" });
    const hook = makeNode("component", "useTickets()", { purpose: "Data hook" });
    const client = makeNode("component", "API Client", { purpose: "fetch + retry" });
    const authm = makeNode("auth", "Auth Module", { purpose: "Token storage, refresh" });
    const edges = [
      ...pages.map((p) => makeEdge(app.id, p.id, { protocol: "route", pattern: "In-process", latency: "<1 ms" })),
      makeEdge(pages[1].id, hook.id, { protocol: "call", pattern: "In-process", latency: "<1 ms" }),
      makeEdge(pages[2].id, hook.id, { protocol: "call", pattern: "In-process", latency: "<1 ms" }),
      makeEdge(hook.id, state.id, { protocol: "dispatch", pattern: "In-process", latency: "<1 ms" }),
      makeEdge(hook.id, client.id, { protocol: "GET /tickets", pattern: "Request/Response" }),
      makeEdge(pages[0].id, authm.id, { protocol: "call", pattern: "In-process", latency: "<1 ms" }),
      makeEdge(client.id, authm.id, { protocol: "token", pattern: "In-process", latency: "<1 ms" }),
    ];
    return autoLayout({ nodes: [app, ...pages, hook, state, client, authm], edges });
  }
  if (d === "backend") {
    const base = n.name.replace(/ ?(service|api|server)$/i, "").replace(/\s+/g, "") || "Ticket";
    const pre = /backend/i.test(base) ? "Ticket" : base;
    const ctrl = makeNode("component", `${pre}Controller`, { purpose: "HTTP handlers" });
    const val = makeNode("component", `${pre}Validator`, { purpose: "Input rules" });
    const svc = makeNode("component", `${pre}Service`, { purpose: "Business logic" });
    const repo = makeNode("component", `${pre}Repository`, { purpose: "Persistence" });
    const pub = makeNode("component", `${pre}EventPublisher`, { purpose: "Domain events" });
    const db = makeNode("postgres", "PostgreSQL");
    const ip = { pattern: "In-process", latency: "<1 ms", protocol: "call" };
    return autoLayout({
      nodes: [ctrl, val, svc, repo, pub, db],
      edges: [
        makeEdge(ctrl.id, val.id, ip),
        makeEdge(ctrl.id, svc.id, ip),
        makeEdge(svc.id, repo.id, ip),
        makeEdge(svc.id, pub.id, ip),
        makeEdge(repo.id, db.id, { protocol: "SQL", pattern: "Request/Response", latency: "5 ms" }),
      ],
    });
  }
  if (d === "database") {
    if (n.kind === "redis") return chain([["component", "Key: session:{id}"], ["component", "Key: ticket:{id}"], ["component", "TTL / eviction"]]);
    const t = ["tickets", "users", "comments", "attachments"].map((x) => makeNode("component", x, { purpose: "Table" }));
    const idx = makeNode("component", "idx_tickets_status_created", { purpose: "Index" });
    return autoLayout({
      nodes: [...t, idx],
      edges: [
        makeEdge(t[0].id, t[1].id, { protocol: "FK assignee_id", pattern: "Relation", latency: "-" }),
        makeEdge(t[2].id, t[0].id, { protocol: "FK ticket_id", pattern: "Relation", latency: "-" }),
        makeEdge(t[3].id, t[0].id, { protocol: "FK ticket_id", pattern: "Relation", latency: "-" }),
        makeEdge(idx.id, t[0].id, { protocol: "covers", pattern: "Index", latency: "-" }),
      ],
    });
  }
  if (d === "messaging") return chain([["component", "Producer"], ["component", "Topic / Queue"], ["component", "Consumer group"], ["component", "Dead letter queue"]], "msg");
  if (d === "infra") return chain([["component", "Listener :443"], ["component", "Routing rules"], ["component", "Target group"], ["component", "Health checks"]]);
  return { nodes: [], edges: [] };
}

const W = 190;
const GAPX = 40;
const GAPY = 130;

export function autoLayout(g: Graph): Graph {
  const incoming = new Map<string, number>();
  g.nodes.forEach((n) => incoming.set(n.id, 0));
  g.edges.forEach((e) => incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1));
  const rank = new Map<string, number>();
  const roots = g.nodes.filter((n) => !incoming.get(n.id));
  (roots.length ? roots : g.nodes.slice(0, 1)).forEach((r) => rank.set(r.id, 0));
  for (let iter = 0; iter < g.nodes.length; iter++) {
    let changed = false;
    for (const e of g.edges) {
      const rs = rank.get(e.source);
      if (rs === undefined) continue;
      const rt = rank.get(e.target);
      if ((rt === undefined || rt < rs + 1) && rs + 1 <= g.nodes.length) {
        rank.set(e.target, rs + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  g.nodes.forEach((n) => !rank.has(n.id) && rank.set(n.id, 0));
  const rows = new Map<number, SysNode[]>();
  g.nodes.forEach((n) => {
    const r = rank.get(n.id)!;
    rows.set(r, [...(rows.get(r) ?? []), n]);
  });
  const pos = new Map<string, { x: number; y: number }>();
  rows.forEach((list, r) => {
    const total = list.length * W + (list.length - 1) * GAPX;
    list.forEach((n, i) => pos.set(n.id, { x: -total / 2 + i * (W + GAPX), y: r * GAPY }));
  });
  return { ...g, nodes: g.nodes.map((n) => ({ ...n, ...pos.get(n.id)! })) };
}

/** Nodes that depend (transitively) on any failed node. */
export function impactOf(g: Graph): { failed: Set<string>; impacted: Set<string> } {
  const failed = new Set(g.nodes.filter((n) => n.failed).map((n) => n.id));
  const impacted = new Set<string>();
  const stack = [...failed];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const e of g.edges) {
      if (e.target === cur && !failed.has(e.source) && !impacted.has(e.source)) {
        // if the caller has another healthy route to a same-kind peer, it survives
        const target = g.nodes.find((n) => n.id === cur)!;
        const peers = g.edges.filter(
          (x) => x.source === e.source && x.target !== cur && g.nodes.find((n) => n.id === x.target)?.kind === target.kind && !failed.has(x.target),
        );
        if (peers.length) continue;
        impacted.add(e.source);
        stack.push(e.source);
      }
    }
  }
  return { failed, impacted };
}
