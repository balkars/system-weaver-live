export type Category =
  | "client"
  | "app"
  | "data"
  | "messaging"
  | "infra"
  | "observability"
  | "security"
  | "external";

export type Domain = "frontend" | "backend" | "database" | "infra" | "messaging" | "generic";

export interface SysNode {
  id: string;
  kind: string;
  name: string;
  purpose?: string;
  fields: Record<string, string>;
  x: number;
  y: number;
  children?: Graph;
  failed?: boolean;
}

export interface SysEdge {
  id: string;
  source: string;
  target: string;
  protocol: string;
  pattern: string;
  latency: string;
  rps: string;
  auth?: string;
  timeout?: string;
  retry?: string;
}

export interface Graph {
  nodes: SysNode[];
  edges: SysEdge[];
}

export interface SystemModel {
  name: string;
  root: Graph;
  requirements: string[];
}

export type ViewId = "hld" | "architecture" | "lld" | "infrastructure" | "devops" | "security" | "runtime";

export interface DerivedNode {
  id: string;
  label: string;
  kind: string;
  sub?: string;
  group?: string;
}
export interface DerivedEdge {
  source: string;
  target: string;
  label?: string;
}
export interface DerivedGraph {
  nodes: DerivedNode[];
  edges: DerivedEdge[];
}
