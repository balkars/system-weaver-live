import { catalogOf } from "./catalog";
import { defaultChildren } from "./graph";
import type { DerivedGraph, Graph, SysNode, ViewId } from "./types";

export const VIEWS: { id: ViewId; label: string; hint: string }[] = [
  { id: "hld", label: "HLD", hint: "Editable system model" },
  { id: "architecture", label: "Architecture", hint: "Layers & tiers" },
  { id: "lld", label: "LLD", hint: "Internal components" },
  { id: "infrastructure", label: "Infra", hint: "Cloud resources" },
  { id: "devops", label: "DevOps", hint: "Build & deploy" },
  { id: "security", label: "Security", hint: "Trust boundaries" },
  { id: "runtime", label: "Runtime", hint: "Request path" },
];

/** Which view is the editable one at this depth. */
export const editableView = (depth: number): ViewId => (depth === 0 ? "hld" : "lld");

const dn = (id: string, label: string, kind: string, sub?: string) => ({ id, label, kind, sub });
function chain(items: [string, string, string?][]): DerivedGraph {
  const nodes = items.map(([label, kind, sub], i) => dn(`c${i}`, label, kind, sub));
  return { nodes, edges: nodes.slice(1).map((n, i) => ({ source: nodes[i].id, target: n.id })) };
}

const LAYERS: { name: string; kind: string; cats: string[] }[] = [
  { name: "Clients", kind: "user", cats: ["client"] },
  { name: "Edge", kind: "cdn", cats: ["infra"] },
  { name: "Security", kind: "auth", cats: ["security"] },
  { name: "Application", kind: "service", cats: ["app"] },
  { name: "Messaging", kind: "queue", cats: ["messaging"] },
  { name: "Data", kind: "postgres", cats: ["data"] },
  { name: "External", kind: "email", cats: ["external"] },
  { name: "Observability", kind: "metrics", cats: ["observability"] },
];

function architecture(g: Graph): DerivedGraph {
  const present = LAYERS.map((l) => ({ ...l, members: g.nodes.filter((n) => l.cats.includes(catalogOf(n.kind).category)) })).filter((l) => l.members.length);
  const nodes = present.map((l) => dn(l.name, `${l.name} tier`, l.kind, l.members.map((m) => m.name).join(" · ")));
  const layerOf = (id: string) => present.find((l) => l.members.some((m) => m.id === id))?.name;
  const seen = new Set<string>();
  const edges = g.edges.flatMap((e) => {
    const a = layerOf(e.source);
    const b = layerOf(e.target);
    const k = `${a}>${b}`;
    if (!a || !b || a === b || seen.has(k)) return [];
    seen.add(k);
    return [{ source: a, target: b }];
  });
  return { nodes, edges };
}

function lldOf(g: Graph): DerivedGraph {
  const svcs = g.nodes.filter((n) => ["backend", "service", "auth", "worker", "frontend"].includes(n.kind));
  const nodes: DerivedGraph["nodes"] = [];
  const edges: DerivedGraph["edges"] = [];
  for (const s of svcs) {
    nodes.push(dn(s.id, s.name, s.kind, "module"));
    const kids = s.children ?? defaultChildren(s);
    kids.nodes.forEach((k) => nodes.push(dn(`${s.id}/${k.id}`, k.name, k.kind, k.purpose)));
    const roots = kids.nodes.filter((k) => !kids.edges.some((e) => e.target === k.id));
    roots.forEach((r) => edges.push({ source: s.id, target: `${s.id}/${r.id}` }));
    kids.edges.forEach((e) => edges.push({ source: `${s.id}/${e.source}`, target: `${s.id}/${e.target}`, label: e.protocol }));
  }
  return { nodes, edges };
}

function infra(g: Graph): DerivedGraph {
  const region = g.nodes.find((n) => n.fields.Region)?.fields.Region ?? "us-east-1";
  const nodes = [dn("aws", "AWS", "vm", region), dn("vpc", "VPC", "firewall", "10.0.0.0/16"), dn("pub", "Public Subnet", "lb", "3 AZs"), dn("priv", "Private Subnet", "k8s", "3 AZs")];
  const edges = [{ source: "aws", target: "vpc" }, { source: "vpc", target: "pub" }, { source: "vpc", target: "priv" }];
  const map: Record<string, [string, string, string]> = {
    lb: ["pub", "ALB", "lb"],
    cdn: ["aws", "CloudFront", "cdn"],
    waf: ["aws", "AWS WAF", "waf"],
    dns: ["aws", "Route 53", "dns"],
    frontend: ["aws", "S3 + CloudFront (static)", "storage"],
    backend: ["priv", "EKS", "k8s"],
    service: ["priv", "EKS", "k8s"],
    worker: ["priv", "EKS", "k8s"],
    auth: ["priv", "EKS", "k8s"],
    postgres: ["priv", "RDS PostgreSQL", "postgres"],
    mysql: ["priv", "RDS MySQL", "mysql"],
    mongodb: ["priv", "DocumentDB", "mongodb"],
    redis: ["priv", "ElastiCache", "redis"],
    queue: ["aws", "SQS", "queue"],
    kafka: ["priv", "MSK", "kafka"],
    storage: ["aws", "S3", "storage"],
    email: ["aws", "SES", "email"],
    metrics: ["aws", "CloudWatch / AMP", "metrics"],
    logs: ["aws", "CloudWatch Logs", "logs"],
  };
  const added = new Map<string, string[]>();
  g.nodes.forEach((n) => {
    const m = map[n.kind];
    if (!m) return;
    const id = `r_${m[1]}`;
    if (!added.has(id)) {
      added.set(id, []);
      nodes.push(dn(id, m[1], m[2]));
      edges.push({ source: m[0], target: id });
    }
    added.get(id)!.push(n.name);
  });
  nodes.forEach((n) => added.has(n.id) && (n.sub = added.get(n.id)!.join(" · ")));
  return { nodes, edges };
}

const deployable = (n: SysNode) => ["frontend", "backend", "service", "worker", "auth", "cron"].includes(n.kind);
function devops(targets: SysNode[]): DerivedGraph {
  const base = chain([["GitHub", "component", "main branch"], ["CI", "cog", "lint · test · SAST"], ["Docker Build", "container"], ["Container Registry", "storage", "ECR"], ["Argo CD", "k8s", "GitOps"], ["Kubernetes", "k8s", "rolling / canary"]]);
  targets.forEach((t, i) => {
    base.nodes.push(dn(`d${i}`, `${t.name} Deployment`, t.kind, t.kind === "frontend" ? "static bundle" : "3 replicas · HPA"));
    base.edges.push({ source: "c5", target: `d${i}` });
  });
  return base;
}

function security(g: Graph): DerivedGraph {
  const zones: [string, (n: SysNode) => boolean, string][] = [
    ["Internet (untrusted)", (n) => n.kind === "user", "user"],
    ["Edge boundary", (n) => ["cdn", "waf", "dns", "lb", "gateway", "firewall"].includes(n.kind), "waf"],
    ["Identity", (n) => ["auth", "oauth", "iam"].includes(n.kind), "auth"],
    ["Trusted app zone", (n) => ["frontend", "backend", "service", "worker"].includes(n.kind), "service"],
    ["Data zone (encrypted)", (n) => catalogOf(n.kind).category === "data" || catalogOf(n.kind).category === "messaging", "secrets"],
  ];
  const nodes = zones.map(([z, f, k]) => {
    const m = g.nodes.filter(f);
    return dn(z, z, m.length ? k : "component", m.length ? m.map((x) => x.name).join(" · ") : "⚠ missing");
  });
  return { nodes, edges: nodes.slice(1).map((n, i) => ({ source: nodes[i].id, target: n.id, label: ["TLS 1.3", "JWT", "mTLS", "IAM + KMS"][i] })) };
}

function runtime(g: Graph): DerivedGraph {
  // follow the main request path greedily from the first client node
  const start = g.nodes.find((n) => n.kind === "user") ?? g.nodes[0];
  if (!start) return { nodes: [], edges: [] };
  const path: SysNode[] = [start];
  const seen = new Set([start.id]);
  let cur = start;
  for (;;) {
    const next = g.edges
      .filter((e) => e.source === cur.id && e.pattern !== "Telemetry" && e.pattern !== "Replication")
      .map((e) => g.nodes.find((n) => n.id === e.target)!)
      .find((n) => n && !seen.has(n.id));
    if (!next) break;
    path.push(next);
    seen.add(next.id);
    cur = next;
  }
  const nodes = [dn("req", "HTTP Request", "component", "POST /tickets"), ...path.slice(1).map((n, i) => dn(n.id, n.name, n.kind, `t+${(i + 1) * 12} ms`))];
  const edges = nodes.slice(1).map((n, i) => {
    const e = g.edges.find((x) => x.source === (i === 0 ? start.id : nodes[i].id) && x.target === n.id);
    return { source: nodes[i].id, target: n.id, label: e?.protocol };
  });
  return { nodes, edges };
}

function scopedInfra(n: SysNode): DerivedGraph {
  const d = catalogOf(n.kind).domain;
  if (n.kind === "frontend") return chain([["Route 53", "dns"], ["CloudFront", "cdn"], ["S3 bucket", "storage", "static assets"], ["Lambda@Edge", "service", "SSR / headers"]]);
  if (d === "backend") return chain([["EKS cluster", "k8s"], ["Namespace: tickets", "k8s"], [`${n.name} Deployment`, "container", "3 pods"], ["HPA", "metrics", "CPU 70%"], ["Service / Ingress", "lb"]]);
  if (n.kind === "redis") return chain([["ElastiCache", "redis"], ["Primary node", "redis"], ["Replica node", "redis", "multi-AZ"]]);
  if (d === "database") return chain([["RDS", n.kind], ["Primary (AZ-a)", n.kind], ["Standby (AZ-b)", n.kind, "sync"], ["Automated backups", "storage", n.fields.Backup ?? "Daily"]]);
  if (d === "messaging") return chain([["Managed broker", n.kind], ["Queue / Topic", n.kind], ["DLQ", "queue"]]);
  return chain([["AWS", "vm"], [n.name, n.kind]]);
}

function contextOf(parent: Graph, n: SysNode): DerivedGraph {
  const ins = parent.edges.filter((e) => e.target === n.id);
  const outs = parent.edges.filter((e) => e.source === n.id);
  const ids = new Set([n.id, ...ins.map((e) => e.source), ...outs.map((e) => e.target)]);
  return {
    nodes: parent.nodes.filter((x) => ids.has(x.id)).map((x) => ({ ...dn(x.id, x.name, x.kind, x.id === n.id ? "◉ you are here" : x.purpose) })),
    edges: [...ins, ...outs].map((e) => ({ source: e.source, target: e.target, label: e.protocol })),
  };
}

export function deriveView(view: ViewId, scope: Graph, focus: SysNode | null, parent: Graph | null): DerivedGraph {
  if (!focus) {
    switch (view) {
      case "architecture":
        return architecture(scope);
      case "lld":
        return lldOf(scope);
      case "infrastructure":
        return infra(scope);
      case "devops":
        return devops(scope.nodes.filter(deployable));
      case "security":
        return security(scope);
      default:
        return runtime(scope);
    }
  }
  switch (view) {
    case "hld":
    case "architecture":
      return parent ? contextOf(parent, focus) : { nodes: [], edges: [] };
    case "infrastructure":
      return scopedInfra(focus);
    case "devops":
      return devops([focus]);
    case "security":
      return chain([["Caller", "user"], ["TLS termination", "firewall"], ["Token verify", "auth", focus.fields.Authentication ?? "JWT"], [focus.name, focus.kind], ["Secrets Manager", "secrets"]]);
    default:
      return runtime(scope);
  }
}
