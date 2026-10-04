import { useState } from "react";
import { Copy, Play, Trash2 } from "lucide-react";
import { fmt, simulate, type Scenario, type SimResult } from "@/lib/model/sim";
import type { Graph } from "@/lib/model/types";
import { cn } from "@/lib/utils";
import { Label } from "./Panels";

export interface Architecture {
  id: string;
  name: string;
  root: Graph;
}

const TRAFFIC = [1, 2, 5, 10, 50];
const LAT = [0, 50, 200];

export function ScenarioPanel({ graph, scenario, onChange }: { graph: Graph; scenario: Scenario; onChange: (s: Scenario) => void }) {
  const failable = graph.nodes.filter((n) => n.kind !== "user");
  const chip = (active: boolean) => cn("rounded border px-2 py-1 font-mono text-[11px]", active ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:border-ring");
  return (
    <div className="space-y-3">
      <div>
        <Label>Traffic multiplier</Label>
        <div className="flex flex-wrap gap-1">{TRAFFIC.map((t) => <button key={t} className={chip(scenario.traffic === t)} onClick={() => onChange({ ...scenario, traffic: t })}>{t}×</button>)}</div>
      </div>
      <div>
        <Label>Network latency per hop</Label>
        <div className="flex flex-wrap gap-1">{LAT.map((t) => <button key={t} className={chip(scenario.extraLatency === t)} onClick={() => onChange({ ...scenario, extraLatency: t })}>+{t} ms</button>)}</div>
      </div>
      <div>
        <Label>Fail components</Label>
        <div className="flex flex-wrap gap-1">
          {failable.map((n) => {
            const on = scenario.fail.includes(n.id);
            return (
              <button key={n.id} onClick={() => onChange({ ...scenario, fail: on ? scenario.fail.filter((x) => x !== n.id) : [...scenario.fail, n.id] })} className={cn("max-w-full truncate rounded border px-2 py-1 text-[11px]", on ? "border-destructive bg-destructive/20" : "border-border text-muted-foreground hover:border-destructive")}>
                {n.name}
              </button>
            );
          })}
        </div>
      </div>
      {(scenario.traffic !== 1 || scenario.extraLatency || scenario.fail.length > 0) && (
        <button onClick={() => onChange({ traffic: 1, extraLatency: 0, fail: [] })} className="text-xs text-muted-foreground underline">Clear scenario</button>
      )}
    </div>
  );
}

export function ArchitecturesPanel({ archs, current, scenario, onSave, onLoad, onDelete }: { archs: Architecture[]; current: Graph; scenario: Scenario; onSave: (name: string) => void; onLoad: (a: Architecture) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Architecture ${String.fromCharCode(65 + archs.length)}`} className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-xs outline-none focus:border-ring" />
        <button onClick={() => { onSave(name || `Architecture ${String.fromCharCode(65 + archs.length)}`); setName(""); }} className="flex items-center gap-1 rounded bg-primary px-2 text-xs text-primary-foreground"><Copy className="h-3 w-3" /> Save</button>
      </div>
      {archs.map((a) => (
        <div key={a.id} className="flex items-center gap-1 rounded border border-border bg-card px-2 py-1.5 text-xs">
          <span className="min-w-0 flex-1 truncate">{a.name}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{a.root.nodes.length} parts</span>
          <button title="Open on canvas" onClick={() => onLoad(a)} className="rounded px-1 hover:bg-accent">Open</button>
          <button title="Delete" onClick={() => onDelete(a.id)} className="rounded p-0.5 hover:bg-accent"><Trash2 className="h-3 w-3" /></button>
        </div>
      ))}
      {archs.length > 0 && (
        <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded border border-primary py-1.5 text-xs text-primary hover:bg-primary/10"><Play className="h-3 w-3" /> Compare under current scenario</button>
      )}
      {!archs.length && <p className="text-xs text-muted-foreground">Save the canvas as an architecture, change it, save again, then compare both under the same workload.</p>}
      {open && <CompareDialog archs={[...archs, { id: "cur", name: "Current canvas", root: current }]} scenario={scenario} onClose={() => setOpen(false)} />}
    </div>
  );
}

function CompareDialog({ archs, scenario, onClose }: { archs: Architecture[]; scenario: Scenario; onClose: () => void }) {
  // scenario failures reference node ids; they only apply to architectures containing that node
  const res = archs.map((a) => ({ a, r: simulate(a.root, scenario) }));
  const best = (f: (r: SimResult) => number, low = true) => {
    const v = res.map((x) => f(x.r));
    return low ? Math.min(...v) : Math.max(...v);
  };
  const rows: [string, (r: SimResult) => number, (v: number) => string, boolean][] = [
    ["Users", (r) => r.users, fmt, false],
    ["Throughput (ok req/s)", (r) => r.throughput, fmt, false],
    ["p95 latency", (r) => r.p95, (v) => `${Math.round(v)} ms`, true],
    ["Error rate", (r) => r.errorRate, (v) => `${v.toFixed(1)}%`, true],
    ["Availability", (r) => r.availability, (v) => `${v.toFixed(2)}%`, false],
    ["Cost / month", (r) => r.cost, (v) => `$${fmt(v)}`, true],
    ["Complexity", (r) => r.complexity, (v) => v.toFixed(0), true],
  ];
  const winner = res.slice().sort((x, y) => x.r.errorRate - y.r.errorRate || x.r.cost - y.r.cost)[0];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-full w-full max-w-4xl overflow-auto rounded-lg border border-border bg-popover p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="font-semibold">System comparison</h3>
          <button onClick={onClose} className="text-xs text-muted-foreground">Close</button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Same workload for all: traffic {scenario.traffic}×, +{scenario.extraLatency} ms per hop{scenario.fail.length ? `, ${scenario.fail.length} failed component(s)` : ""}.</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-1.5 pr-3 font-mono text-[10px] uppercase text-muted-foreground">Metric</th>
              {res.map(({ a }) => <th key={a.id} className="px-2 py-1.5">{a.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, f, show, low]) => {
              const b = best(f, low);
              return (
                <tr key={k} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 text-muted-foreground">{k}</td>
                  {res.map(({ a, r }) => <td key={a.id} className={cn("px-2 py-1.5 font-mono", k !== "Users" && f(r) === b && res.length > 1 && "text-primary")}>{show(f(r))}</td>)}
                </tr>
              );
            })}
            <tr>
              <td className="py-1.5 pr-3 text-muted-foreground">Main bottleneck</td>
              {res.map(({ a, r }) => <td key={a.id} className="px-2 py-1.5" style={r.bottlenecks[0] ? { color: "var(--destructive)" } : undefined}>{r.bottlenecks[0]?.name ?? "none"}</td>)}
            </tr>
          </tbody>
        </table>
        <div className="mt-4 rounded border border-border bg-card p-3 text-xs">
          <div className="font-medium">What differs</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
            <li><b className="text-foreground">{winner.a.name}</b> handles this workload best ({winner.r.errorRate.toFixed(1)}% errors at ${fmt(winner.r.cost)}/mo).</li>
            {res.map(({ a, r }) => (
              <li key={a.id}>{a.name}: {r.bottlenecks[0] ? `${r.bottlenecks[0].name} limits it — ${r.metrics.get(r.bottlenecks[0].id)!.status === "down" ? "it is down and nothing takes over" : `${Math.round(r.metrics.get(r.bottlenecks[0].id)!.util * 100)}% of capacity`}.` : "no component over capacity."}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
