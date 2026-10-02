import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, CircleAlert, CircleCheck, Layers, Power, Trash2 } from "lucide-react";
import { CATALOG, LIBRARY_GROUPS, catalogOf } from "@/lib/model/catalog";
import { REQUIREMENTS, review } from "@/lib/model/evolve";
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
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Architecture grows because requirements grow. Apply one at a time and watch the model change.
      </p>
      {disabled && <p className="rounded border border-warning/50 bg-warning/10 p-2 text-xs">Go back to the System level to apply requirements.</p>}
      {REQUIREMENTS.map((r, i) => {
        const done = applied.includes(r.id);
        return (
          <div key={r.id} className={cn("rounded-md border bg-card p-3", done ? "border-primary/40" : "border-border")}>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex-1">
                <div className="text-sm font-medium">{r.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{r.prompt}</div>
              </div>
              {done ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <button
                  disabled={disabled}
                  onClick={() => {
                    onApply(r.id);
                    setOpen(r.id);
                  }}
                  className="rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-40"
                >
                  Apply
                </button>
              )}
            </div>
            {(done || open === r.id) && (
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                <ChevronRight className={cn("h-3 w-3 transition-transform", open === r.id && "rotate-90")} /> Why & trade-off
              </button>
            )}
            {open === r.id && (
              <div className="mt-2 space-y-1.5 border-t border-border pt-2 text-xs">
                <p><span className="text-primary">Why · </span>{r.why}</p>
                <p><span className="text-warning">New risk · </span>{r.tradeoff}</p>
              </div>
            )}
          </div>
        );
      })}
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
}: {
  node: SysNode;
  graph: Graph;
  editable: boolean;
  onChange: (n: SysNode) => void;
  onDelete: () => void;
  onDrill: () => void;
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
