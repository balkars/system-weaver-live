import type { Category, Domain } from "./types";

export interface CatalogItem {
  kind: string;
  label: string;
  category: Category;
  domain: Domain;
  icon: string;
  purposes?: string[];
  fields?: Record<string, string>;
}

const FE = { Framework: "React", Rendering: "CSR", State: "Redux", API: "REST", Authentication: "OAuth2", "Perf budget": "LCP < 2.5s" };
const BE = { Language: "TypeScript", Framework: "NestJS", Pattern: "Microservice", Protocol: "REST", Concurrency: "Async", Scaling: "Horizontal" };
const DB = { Type: "Relational", Engine: "PostgreSQL", Replication: "Streaming", Consistency: "Strong", Indexing: "B-tree", Backup: "Daily", Retention: "30 days", Storage: "500 GB" };
const INFRA = { Cloud: "AWS", Region: "us-east-1", "Availability zones": "3" };
const MQ = { Delivery: "At-least-once", Ordering: "Per key", Retention: "7 days", Partitions: "6" };

export const CATALOG: CatalogItem[] = [
  { kind: "user", label: "Users", category: "client", domain: "generic", icon: "Users", fields: { Concurrent: "100" } },
  { kind: "frontend", label: "Frontend", category: "app", domain: "frontend", icon: "Monitor", fields: FE },
  { kind: "backend", label: "Backend API", category: "app", domain: "backend", icon: "Server", fields: BE },
  { kind: "service", label: "Microservice", category: "app", domain: "backend", icon: "Box", fields: BE },
  { kind: "worker", label: "Worker", category: "app", domain: "backend", icon: "Cog", fields: { ...BE, Pattern: "Consumer" } },
  { kind: "cron", label: "Cron Job", category: "app", domain: "backend", icon: "Clock", fields: { Schedule: "*/5 * * * *" } },
  { kind: "postgres", label: "PostgreSQL", category: "data", domain: "database", icon: "Database", fields: DB, purposes: ["Primary transactional DB", "Read replica", "Analytics"] },
  { kind: "mysql", label: "MySQL", category: "data", domain: "database", icon: "Database", fields: { ...DB, Engine: "MySQL" } },
  { kind: "mongodb", label: "MongoDB", category: "data", domain: "database", icon: "Leaf", fields: { ...DB, Type: "Document", Engine: "MongoDB", Consistency: "Tunable" } },
  { kind: "redis", label: "Redis", category: "data", domain: "database", icon: "Zap", purposes: ["Cache", "Session storage", "Rate limiting", "Queue"], fields: { Type: "Key-value", Engine: "Redis", Eviction: "allkeys-lru", Memory: "8 GB", Persistence: "AOF" } },
  { kind: "storage", label: "Object Storage", category: "data", domain: "database", icon: "Archive", fields: { Engine: "S3", Versioning: "On", Lifecycle: "90d → Glacier" } },
  { kind: "kafka", label: "Kafka", category: "messaging", domain: "messaging", icon: "Waves", purposes: ["Event stream", "Audit log", "CDC"], fields: MQ },
  { kind: "rabbitmq", label: "RabbitMQ", category: "messaging", domain: "messaging", icon: "Rabbit", fields: MQ },
  { kind: "queue", label: "Queue (SQS)", category: "messaging", domain: "messaging", icon: "ListOrdered", purposes: ["Async jobs", "Notifications", "Retries / DLQ"], fields: MQ },
  { kind: "pubsub", label: "Pub/Sub", category: "messaging", domain: "messaging", icon: "Radio", fields: MQ },
  { kind: "lb", label: "Load Balancer", category: "infra", domain: "infra", icon: "Split", fields: { ...INFRA, Algorithm: "Round robin", "Health check": "/healthz" } },
  { kind: "cdn", label: "CDN", category: "infra", domain: "infra", icon: "Globe", fields: { ...INFRA, Provider: "CloudFront", TTL: "1h" } },
  { kind: "waf", label: "WAF", category: "security", domain: "infra", icon: "ShieldAlert", fields: { Rules: "OWASP top 10", "Rate limit": "1000 req/min/IP" } },
  { kind: "gateway", label: "API Gateway", category: "infra", domain: "infra", icon: "DoorOpen", fields: { ...INFRA, "Rate limit": "500 req/s" } },
  { kind: "k8s", label: "Kubernetes", category: "infra", domain: "infra", icon: "Ship", fields: { ...INFRA, Nodes: "6", Autoscaling: "HPA" } },
  { kind: "vm", label: "VM", category: "infra", domain: "infra", icon: "HardDrive", fields: INFRA },
  { kind: "container", label: "Container", category: "infra", domain: "infra", icon: "Package", fields: { Image: "app:latest", CPU: "500m", Memory: "512Mi" } },
  { kind: "logs", label: "Logs", category: "observability", domain: "generic", icon: "ScrollText", fields: { Tool: "Loki", Retention: "14 days" } },
  { kind: "metrics", label: "Metrics", category: "observability", domain: "generic", icon: "Activity", fields: { Tool: "Prometheus" } },
  { kind: "tracing", label: "Tracing", category: "observability", domain: "generic", icon: "Footprints", fields: { Tool: "OpenTelemetry", Sampling: "10%" } },
  { kind: "alerting", label: "Alerting", category: "observability", domain: "generic", icon: "BellRing", fields: { Tool: "PagerDuty" } },
  { kind: "auth", label: "Auth Service", category: "security", domain: "backend", icon: "KeyRound", fields: { ...BE, Tokens: "JWT", Session: "15 min / refresh 7d" } },
  { kind: "oauth", label: "OAuth Provider", category: "security", domain: "generic", icon: "BadgeCheck", fields: { Provider: "Google / Okta" } },
  { kind: "iam", label: "IAM", category: "security", domain: "generic", icon: "UserCog", fields: { Model: "Least privilege" } },
  { kind: "secrets", label: "Secrets", category: "security", domain: "generic", icon: "LockKeyhole", fields: { Store: "AWS Secrets Manager", Rotation: "30 days" } },
  { kind: "firewall", label: "Firewall", category: "security", domain: "infra", icon: "BrickWall", fields: { Ingress: "443 only" } },
  { kind: "email", label: "Email Provider", category: "external", domain: "generic", icon: "Mail", fields: { Provider: "SES" } },
  { kind: "dns", label: "Global DNS", category: "infra", domain: "infra", icon: "Earth", fields: { Routing: "Latency-based" } },
  { kind: "component", label: "Component", category: "app", domain: "generic", icon: "Puzzle" },
];

export const CATALOG_MAP: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.kind, c]));
export const catalogOf = (kind: string): CatalogItem => CATALOG_MAP[kind] ?? CATALOG_MAP.component;

export const LIBRARY_GROUPS: { title: string; categories: Category[] }[] = [
  { title: "Application", categories: ["app", "client"] },
  { title: "Data", categories: ["data"] },
  { title: "Messaging", categories: ["messaging"] },
  { title: "Infrastructure", categories: ["infra"] },
  { title: "Observability", categories: ["observability"] },
  { title: "Security", categories: ["security", "external"] },
];

export function inferKind(label: string): string {
  const l = label.toLowerCase();
  const rules: [RegExp, string][] = [
    [/user|client|browser|customer|mobile/, "user"],
    [/front|web app|ui|react|spa|portal/, "frontend"],
    [/postgres|rds|sql(?!ite)/, "postgres"],
    [/mysql|maria/, "mysql"],
    [/mongo|dynamo|document/, "mongodb"],
    [/redis|cache|memcache/, "redis"],
    [/s3|bucket|blob|object/, "storage"],
    [/kafka|stream/, "kafka"],
    [/rabbit/, "rabbitmq"],
    [/queue|sqs/, "queue"],
    [/pub\/?sub|sns|event/, "pubsub"],
    [/load ?bal|lb|elb|alb|nginx/, "lb"],
    [/cdn|cloudfront|edge/, "cdn"],
    [/waf/, "waf"],
    [/gateway/, "gateway"],
    [/k8s|kube|eks|gke/, "k8s"],
    [/auth|login|identity|cognito|sso/, "auth"],
    [/oauth|okta/, "oauth"],
    [/secret|vault|kms/, "secrets"],
    [/log/, "logs"],
    [/metric|prometheus|grafana/, "metrics"],
    [/trac/, "tracing"],
    [/alert|pager/, "alerting"],
    [/mail|smtp|ses/, "email"],
    [/worker|consumer|job/, "worker"],
    [/cron|schedul/, "cron"],
    [/dns|route ?53/, "dns"],
    [/db|database|store/, "postgres"],
    [/service|api|backend|server/, "service"],
  ];
  for (const [re, k] of rules) if (re.test(l)) return k;
  return "component";
}
