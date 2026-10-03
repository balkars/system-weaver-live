import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, CircleAlert, CircleCheck, Layers, Power, Trash2 } from "lucide-react";
import { CATALOG, LIBRARY_GROUPS, catalogOf } from "@/lib/model/catalog";
import { REQUIREMENTS, review } from "@/lib/model/evolve";
import { fixesFor, fmt, statusColor, type Fix, type NodeMetrics, type SimResult } from "@/lib/model/sim";
import type { Graph, SysEdge, SysNode } from "@/lib/model/types";
import { KindIcon } from "./SysNodeCard";
import { cn } from "@/lib/utils";

export const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{children}</div>
);

export function Library() {
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">Drag a component onto the HLD or LLD canvas. Connect handles to wire it in.</p>
      {LIBRARY_GROUPS.map((g) => (
        <div key={g.title}>
          <Label>{g.title}</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {CATALOG.filter((c) => g.categories.includes(c.category) && c.kind !== "component").map((c) => (
              <div
                key={c.kind}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-sys-kind", c.kind);
                  e.dataTransfer.effectAllowed = "move";
                }}
                style={{ ["--cat" as string]: `var(--cat-${c.category})` }}
                className="flex cursor-grab items-center gap-1.5 rounded border border-border bg-card px-2 py-1.5 text-xs hover:border-[color:var(--cat)] active:cursor-grabbing"
              >
                <KindIcon kind={c.kind} className="h-3.5 w-3.5 shrink-0 [color:var(--cat)]" />
                <span className="truncate">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Evolve({ applied, onApply, disabled }: { applied: string[]; onApply: (id: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <p className="mb-2 text-xs text-muted-foreground">Drag a requirement onto the canvas (or click it). Then fix what breaks.</p>
      {disabled && <p className="rounded border border-warning/50 bg-warning/10 p-2 text-xs">Go back to the System level to apply requirements.</p>}
      {REQUIREMENTS.map((r, i) => {
        const done = applied.includes(r.id);
        return (
          <div
            key={r.id}
            draggable={!disabled}
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-sys-req", r.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className={cn("cursor-grab rounded-md border bg-card active:cursor-grabbing", done ? "border-primary/40" : "border-border hover:border-ring")}
          >
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex-1 truncate text-left text-sm font-medium">{r.title}</button>
              {done ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <button disabled={disabled} onClick={() => { onApply(r.id); setOpen(r.id); }} className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-40">
                  Apply
                </button>
              )}
            </div>
            {open === r.id && (
              <div className="space-y-1.5 border-t border-border px-2.5 py-2 text-xs">
                <p className="text-muted-foreground">{r.prompt}</p>
                <p><span className="text-primary">Why · </span>{r.why}</p>
                <p><span className="text-warning">Trade-off · </span>{r.tradeoff}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function MetricsBlock({ m }: { m: NodeMetrics }) {
  const cells: [string, string][] = [["Load", `${fmt(m.rps)} req/s`], ["Capacity", m.cap === Infinity ? "∞" : `${fmt(m.cap)} req/s`], ["CPU", `${Math.round(m.cpu)}%`], ["Latency", `${Math.round(m.latency)} ms`], ["Errors", `${m.errors.toFixed(1)}%`]];
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="mb-2 h-1.5 overflow-hidden rounded bg-secondary">
        <div className="h-full transition-all" style={{ width: `${Math.min(100, m.util * 100)}%`, background: statusColor(m.status) }} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
        {cells.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2"><span className="text-muted-foreground">{k}</span><span style={k === "Errors" && m.errors > 0 ? { color: "var(--destructive)" } : undefined}>{v}</span></div>
        ))}
      </div>
    </div>
  );
}

export function FixList({ fixes, onFix }: { fixes: Fix[]; onFix: (f: Fix) => void }) {
  return (
    <div className="space-y-1.5">
      {fixes.map((f) => (
        <div key={f.id} className="rounded border border-border bg-card p-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase text-muted-foreground">{f.step}</span>
            <button onClick={() => onFix(f)} className="ml-auto rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">Apply</button>
          </div>
          <div className="mt-1 font-medium">{f.title}</div>
          <p className="mt-0.5 text-muted-foreground">{f.why}</p>
          <p className="mt-0.5"><span className="text-warning">Trade-off · </span>{f.tradeoff}</p>
        </div>
      ))}
    </div>
  );
}

export function Telemetry({ sim, graph, onFix, onSelect }: { sim: SimResult; graph: Graph; onFix: (f: Fix) => void; onSelect: (id: string) => void }) {
  const top = sim.bottlenecks[0];
  const healthy = sim.errorRate < 0.5 && sim.p95 < 500;
  const stat = (k: string, v: string, bad?: boolean) => (
    <div className="rounded border border-border bg-card px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="font-mono text-sm" style={bad ? { color: "var(--destructive)" } : undefined}>{v}</div>
    </div>
  );
  return (
    <div className="space-y-3">
      <Label>Live telemetry</Label>
      <div className="grid grid-cols-2 gap-1.5">
        {stat("Users", fmt(sim.users))}
        {stat("Traffic", `${fmt(sim.rps)} req/s`)}
        {stat("p95 latency", `${Math.round(sim.p95)} ms`, sim.p95 > 500)}
        {stat("Error rate", `${sim.errorRate.toFixed(1)}%`, sim.errorRate >= 0.5)}
        {stat("Infra cost", `$${fmt(sim.cost)}/mo`)}
        {stat("Status", healthy ? "Healthy" : "Breaking", !healthy)}
      </div>
      {sim.bottlenecks.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-xs">
          <div className="font-medium">Alert · {sim.bottlenecks.length} component{sim.bottlenecks.length > 1 ? "s" : ""} over capacity</div>
          <div className="mt-1 space-y-0.5 font-mono text-[11px]">
            {sim.bottlenecks.map((n) => {
              const m = sim.metrics.get(n.id)!;
              return <button key={n.id} onClick={() => onSelect(n.id)} className="block hover:underline">{n.name} · CPU 100% · {Math.round(m.util * 100)}% load · {m.errors.toFixed(0)}% 5xx</button>;
            })}
          </div>
        </div>
      )}
      {top && (
        <div>
          <Label>Fix the bottleneck: {top.name}</Label>
          <FixList fixes={fixesFor(graph, top)} onFix={onFix} />
        </div>
      )}
    </div>
  );
}

const Field = ({ k, v, onChange }: { k: string; v: string; onChange: (v: string) => void }) => (
  <label className="grid grid-cols-[110px_1fr] items-center gap-2 text-xs">
    <span className="truncate text-muted-foreground">{k}</span>
    <input value={v} onChange={(e) => onChange(e.target.value)} className="rounded border border-input bg-background px-2 py-1 font-mono text-[11px] outline-none focus:border-ring" />
  </label>
);

export function NodeInspector({
  node,
  graph,
  editable,
  onChange,
  onDelete,
  onDrill,
  metrics,
  onFix,
}: {
  node: SysNode;
  graph: Graph;
  editable: boolean;
  onChange: (n: SysNode) => void;
  onDelete: () => void;
  onDrill: () => void;
  metrics?: NodeMetrics;
  onFix?: (f: Fix) => void;
}) {
  const c = catalogOf(node.kind);
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? "?";
  const ins = graph.edges.filter((e) => e.target === node.id);
  const outs = graph.edges.filter((e) => e.source === node.id);
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2" style={{ ["--cat" as string]: `var(--cat-${c.category})` }}>
        <KindIcon kind={node.kind} className="h-5 w-5 [color:var(--cat)]" />
        <input
          disabled={!editable}
          value={node.name}
          onChange={(e) => onChange({ ...node, name: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-1.5 font-mono text-[10px] uppercase">
        <span className="rounded bg-secondary px-1.5 py-0.5">{c.label}</span>
        <span className="rounded bg-secondary px-1.5 py-0.5">{c.domain}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onDrill} className="flex items-center justify-center gap-1.5 rounded border border-border bg-secondary px-2 py-1.5 text-xs hover:border-ring">
          <Layers className="h-3.5 w-3.5" /> Open inside
        </button>
        <button
          onClick={() => onChange({ ...node, failed: !node.failed })}
          className={cn("flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-xs", node.failed ? "border-destructive bg-destructive/20" : "border-border bg-secondary hover:border-destructive")}
        >
          <Power className="h-3.5 w-3.5" /> {node.failed ? "Restore" : "What if down?"}
        </button>
      </div>
      {node.kind === "user" && editable && (
        <div>
          <Label>Concurrent users</Label>
          <UserSlider value={node.fields.Concurrent} onChange={(v) => onChange({ ...node, fields: { ...node.fields, Concurrent: v } })} />
        </div>
      )}
      {metrics && metrics.cap !== Infinity && (
        <div>
          <Label>Live metrics</Label>
          <MetricsBlock m={metrics} />
          {editable && onFix && (metrics.status === "breaking" || metrics.status === "hot") && (
            <div className="mt-2"><FixList fixes={fixesFor(graph, node)} onFix={onFix} /></div>
          )}
        </div>
      )}
      <div>
        <Label>Purpose</Label>
        {c.purposes ? (
          <div className="flex flex-wrap gap-1.5">
            {c.purposes.map((p) => (
              <button key={p} onClick={() => onChange({ ...node, purpose: p })} className={cn("rounded border px-2 py-1 text-xs", node.purpose === p ? "border-primary bg-primary/15" : "border-border")}>
                {p}
              </button>
            ))}
          </div>
        ) : (
          <input value={node.purpose ?? ""} placeholder="What does this do?" onChange={(e) => onChange({ ...node, purpose: e.target.value })} className="w-full rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring" />
        )}
      </div>
      <div>
        <Label>{c.domain} fields</Label>
        <div className="space-y-1.5">
          {Object.entries(node.fields).map(([k, v]) => (
            <Field key={k} k={k} v={v} onChange={(nv) => onChange({ ...node, fields: { ...node.fields, [k]: nv } })} />
          ))}
          <button
            onClick={() => {
              const k = prompt("Field name");
              if (k) onChange({ ...node, fields: { ...node.fields, [k]: "" } });
            }}
            className="text-[11px] text-muted-foreground hover:text-primary"
          >
            + add field
          </button>
        </div>
      </div>
      <div>
        <Label>Connections</Label>
        <div className="space-y-1 font-mono text-[11px]">
          {ins.map((e) => <div key={e.id}>← {name(e.source)} <span className="text-muted-foreground">{e.protocol}</span></div>)}
          {outs.map((e) => <div key={e.id}>→ {name(e.target)} <span className="text-muted-foreground">{e.protocol}</span></div>)}
          {!ins.length && !outs.length && <div className="text-muted-foreground">none</div>}
        </div>
      </div>
      {editable && (
        <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-destructive hover:underline">
          <Trash2 className="h-3.5 w-3.5" /> Remove component
        </button>
      )}
    </div>
  );
}

export function EdgeInspector({ edge, graph, onChange, onDelete }: { edge: SysEdge; graph: Graph; onChange: (e: SysEdge) => void; onDelete: () => void }) {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? "?";
  const keys: [keyof SysEdge, string][] = [["protocol", "Protocol"], ["pattern", "Pattern"], ["latency", "Avg latency"], ["rps", "Peak req/s"], ["auth", "Authentication"], ["timeout", "Timeout"], ["retry", "Retries"]];
  return (
    <div className="space-y-5">
      <div>
        <Label>Connection</Label>
        <div className="text-sm font-medium">{name(edge.source)} → {name(edge.target)}</div>
      </div>
      <div className="space-y-1.5">
        {keys.map(([k, l]) => <Field key={k} k={l} v={String(edge[k] ?? "")} onChange={(v) => onChange({ ...edge, [k]: v })} />)}
      </div>
      <button onClick={onDelete} className="flex items-center gap-1.5 text-xs text-destructive hover:underline">
        <Trash2 className="h-3.5 w-3.5" /> Remove connection
      </button>
    </div>
  );
}

export function Review({ graph, impacted, onRestoreAll }: { graph: Graph; impacted: number; onRestoreAll: () => void }) {
  const items = review(graph);
  const failed = graph.nodes.filter((n) => n.failed);
  return (
    <div className="space-y-5">
      <div>
        <Label>Model</Label>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Components", graph.nodes.length], ["Links", graph.edges.length], ["Down", failed.length]].map(([k, v]) => (
            <div key={k} className="rounded border border-border bg-card py-2">
              <div className="font-mono text-lg">{v}</div>
              <div className="text-[10px] text-muted-foreground">{k}</div>
            </div>
          ))}
        </div>
      </div>
      {failed.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs">
          <div className="mb-1 font-medium">Failure simulation</div>
          <p>{failed.map((f) => f.name).join(", ")} down → {impacted} dependent component{impacted === 1 ? "" : "s"} affected.</p>
          <button onClick={onRestoreAll} className="mt-2 underline">Restore all</button>
        </div>
      )}
      <div>
        <Label>Design review</Label>
        <div className="space-y-2">
          {items.map((i, k) => (
            <div key={k} className="flex gap-2 text-xs">
              {i.level === "risk" ? <CircleAlert className="h-4 w-4 shrink-0 text-destructive" /> : i.level === "warn" ? <AlertTriangle className="h-4 w-4 shrink-0 text-warning" /> : <CircleCheck className="h-4 w-4 shrink-0 text-primary" />}
              <span>{i.text}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">You decide what to change. Select a component and press “What if down?” to see its blast radius.</p>
      </div>
    </div>
  );
}

const STEPS = [100, 1000, 5000, 10000, 50000, 100000, 500000, 1000000];
export function UserSlider({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const n = Number(String(value ?? "0").replace(/[^\d]/g, "")) || 0;
  const idx = STEPS.reduce((best, s, i) => (Math.abs(s - n) < Math.abs(STEPS[best] - n) ? i : best), 0);
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={0} max={STEPS.length - 1} value={idx} onChange={(e) => onChange(STEPS[+e.target.value].toLocaleString("en-US"))} className="flex-1 accent-[var(--primary)]" />
      <span className="w-12 text-right font-mono text-xs">{fmt(n)}</span>
    </div>
  );
}
