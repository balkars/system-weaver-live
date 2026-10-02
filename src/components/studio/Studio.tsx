import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChevronRight, Download, Eye, RotateCcw, Upload, Wand2, Boxes } from "lucide-react";
import { catalogOf } from "@/lib/model/catalog";
import { REQUIREMENTS, seedModel } from "@/lib/model/evolve";
import { autoLayout, defaultChildren, getGraph, impactOf, makeEdge, makeNode, pathNodes, setGraph } from "@/lib/model/graph";
import { download, toDrawio, toMermaid } from "@/lib/model/io";
import type { Graph, SysNode, SystemModel, ViewId } from "@/lib/model/types";
import { VIEWS, deriveView, editableView } from "@/lib/model/views";
import { cn } from "@/lib/utils";
import { EdgeInspector, Evolve, Label, Library, NodeInspector, Review } from "./Panels";
import { ImportDialog } from "./ImportDialog";
import { SysNodeCard, type CardData } from "./SysNodeCard";

const STORAGE = "systemlens.model.v1";
const nodeTypes = { sys: SysNodeCard };
type Sel = { type: "node" | "edge"; id: string } | null;

function Canvas() {
  const [model, setModel] = useState<SystemModel>(() => seedModel());
  const [path, setPath] = useState<string[]>([]);
  const [view, setView] = useState<ViewId>("hld");
  const [sel, setSel] = useState<Sel>(null);
  const [leftTab, setLeftTab] = useState<"evolve" | "library">("evolve");
  const [pendingDrop, setPendingDrop] = useState<SysNode | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const rf = useReactFlow();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) setModel(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE, JSON.stringify(model));
  }, [model, loaded]);

  const scope = getGraph(model, path);
  const crumbs = pathNodes(model, path);
  const focus = crumbs[crumbs.length - 1] ?? null;
  const parent = path.length ? getGraph(model, path.slice(0, -1)) : null;
  const editable = view === editableView(path.length);
  const updateScope = useCallback((fn: (g: Graph) => Graph) => setModel((m) => setGraph(m, path, fn)), [path]);

  const { failed, impacted } = useMemo(() => impactOf(scope), [scope]);

  const base = useMemo(() => {
    if (editable) {
      const nodes: Node[] = scope.nodes.map((n) => ({
        id: n.id,
        type: "sys",
        position: { x: n.x, y: n.y },
        data: {
          label: n.name,
          kind: n.kind,
          sub: n.purpose,
          drillable: true,
          state: failed.has(n.id) ? "failed" : impacted.has(n.id) ? "impacted" : undefined,
        } satisfies CardData,
      }));
      const edges: Edge[] = scope.edges.map((e) => {
        const down = failed.has(e.target) || failed.has(e.source);
        const async = /async|telemetry|replication/i.test(e.pattern);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.protocol,
          animated: !down && e.pattern !== "Relation",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeDasharray: async ? "5 4" : undefined, stroke: down ? "var(--destructive)" : undefined, opacity: e.pattern === "Telemetry" ? 0.4 : 1 },
        };
      });
      return { nodes, edges };
    }
    const d = deriveView(view, scope, focus, parent);
    const laid = autoLayout({ nodes: d.nodes.map((n) => ({ id: n.id, kind: n.kind, name: n.label, fields: {}, x: 0, y: 0 })), edges: d.edges.map((e, i) => makeEdge(e.source, e.target, { id: `d${i}`, protocol: e.label ?? "" })) });
    const nodes: Node[] = laid.nodes.map((n, i) => ({
      id: n.id,
      type: "sys",
      position: { x: n.x, y: n.y },
      data: { label: n.name, kind: n.kind, sub: d.nodes[i].sub, derived: true, drillable: scope.nodes.some((s) => s.id === n.id) } satisfies CardData,
    }));
    const edges: Edge[] = d.edges.map((e, i) => ({ id: `d${i}`, source: e.source, target: e.target, label: e.label, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }));
    return { nodes, edges };
  }, [editable, scope, view, focus, parent, failed, impacted]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  useEffect(() => {
    setNodes((prev) => base.nodes.map((n) => ({ ...n, selected: prev.find((p) => p.id === n.id)?.selected ?? false })));
    setEdges(base.edges);
  }, [base, setNodes, setEdges]);

  const structureKey = `${path.join("/")}|${view}|${scope.nodes.length}`;
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.2, duration: 400 }), 60);
    return () => clearTimeout(t);
  }, [structureKey, rf]);

  const drill = (id: string) => {
    const n = scope.nodes.find((x) => x.id === id);
    if (!n) return;
    if (!n.children) updateScope((g) => ({ ...g, nodes: g.nodes.map((x) => (x.id === id ? { ...x, children: defaultChildren(x) } : x)) }));
    setPath([...path, id]);
    setView("lld");
    setSel(null);
  };
  const goTo = (depth: number) => {
    setPath(path.slice(0, depth));
    setView(depth === 0 ? "hld" : "lld");
    setSel(null);
  };

  const applyReq = (id: string) => {
    const r = REQUIREMENTS.find((x) => x.id === id)!;
    setModel((m) => ({ ...m, requirements: [...m.requirements, id], root: autoLayout(r.apply(structuredClone(m.root))) }));
    setView("hld");
  };

  const onConnect = (c: Connection) => {
    if (!editable || !c.source || !c.target) return;
    const t = scope.nodes.find((n) => n.id === c.target);
    const proto = t && catalogOf(t.kind).domain === "database" ? "SQL" : t && catalogOf(t.kind).domain === "messaging" ? "AMQP" : "REST";
    updateScope((g) => ({ ...g, edges: [...g.edges, makeEdge(c.source!, c.target!, { protocol: proto, pattern: proto === "AMQP" ? "Async" : "Request/Response" })] }));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/x-sys-kind");
    if (!kind) return;
    if (!editable) setView(editableView(path.length));
    const pos = rf.screenToFlowPosition({ x: e.clientX - 95, y: e.clientY - 25 });
    const n = makeNode(kind, undefined, { x: pos.x, y: pos.y });
    if (catalogOf(kind).purposes) setPendingDrop(n);
    else commitDrop(n);
  };
  const commitDrop = (n: SysNode) => {
    updateScope((g) => ({ ...g, nodes: [...g.nodes, n] }));
    setSel({ type: "node", id: n.id });
    setPendingDrop(null);
  };

  const selNode = sel?.type === "node" ? scope.nodes.find((n) => n.id === sel.id) : undefined;
  const selEdge = sel?.type === "edge" ? scope.edges.find((e) => e.id === sel.id) : undefined;

  const exportAs = (fmt: "drawio" | "mermaid" | "json") => {
    const slug = model.name.toLowerCase().replace(/\W+/g, "-");
    if (fmt === "drawio") download(`${slug}.drawio`, toDrawio(scope, model.name), "application/xml");
    if (fmt === "mermaid") download(`${slug}.mmd`, toMermaid(scope));
    if (fmt === "json") download(`${slug}.systemlens.json`, JSON.stringify(model, null, 2), "application/json");
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">SystemLens</span>
        </div>
        <div className="mx-2 h-5 w-px bg-border" />
        <nav className="flex min-w-0 items-center gap-1 text-sm">
          <button onClick={() => goTo(0)} className={cn("truncate rounded px-1.5 py-0.5 hover:bg-accent", !path.length && "text-primary")}>
            {model.name}
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button onClick={() => goTo(i + 1)} className={cn("truncate rounded px-1.5 py-0.5 hover:bg-accent", i === crumbs.length - 1 && "text-primary")}>
                {c.name}
              </button>
            </span>
          ))}
          <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">L{path.length}</span>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
            <Upload className="h-3.5 w-3.5" /> Import HLD
          </button>
          <div className="group relative">
            <button className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> Export
            </button>
            <div className="invisible absolute right-0 top-full z-40 w-44 rounded-md border border-border bg-popover p-1 text-xs opacity-0 shadow-xl group-hover:visible group-hover:opacity-100">
              {[["drawio", "draw.io / Lucid (.drawio)"], ["mermaid", "Mermaid (.mmd)"], ["json", "System model (.json)"]].map(([k, l]) => (
                <button key={k} onClick={() => exportAs(k as "drawio")} className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent">{l}</button>
              ))}
            </div>
          </div>
          <button
            title="Start over"
            onClick={() => {
              if (!confirm("Reset to the basic ticketing system?")) return;
              setModel(seedModel());
              goTo(0);
            }}
            className="rounded border border-border p-1.5 hover:bg-accent"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="flex border-b border-border text-xs">
            {[["evolve", "Evolve", Wand2], ["library", "Components", Boxes]].map(([k, l, I]) => {
              const Icon = I as typeof Wand2;
              return (
                <button key={k as string} onClick={() => setLeftTab(k as "evolve")} className={cn("flex flex-1 items-center justify-center gap-1.5 py-2.5", leftTab === k ? "border-b-2 border-primary text-foreground" : "text-muted-foreground")}>
                  <Icon className="h-3.5 w-3.5" /> {l as string}
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {leftTab === "evolve" ? <Evolve applied={model.requirements} onApply={applyReq} disabled={path.length > 0} /> : <Library />}
          </div>
        </aside>

        {/* Center */}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-3 py-1.5">
            {VIEWS.map((v) => {
              const isEdit = v.id === editableView(path.length);
              return (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  title={isEdit ? "Editable model" : v.hint}
                  className={cn("whitespace-nowrap rounded px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider", view === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                >
                  {v.label}
                  {isEdit && <span className="ml-1 opacity-60">✎</span>}
                </button>
              );
            })}
            <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap pl-3 text-[11px] text-muted-foreground">
              {editable ? (
                <>Live model · drag, connect, double-click to zoom in</>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" /> Lens generated from the model
                </>
              )}
            </span>
          </div>
          <div className="relative flex-1" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodesDraggable
              nodesConnectable={editable}
              onConnect={onConnect}
              onNodeDragStop={(_, n) => editable && updateScope((g) => ({ ...g, nodes: g.nodes.map((x) => (x.id === n.id ? { ...x, x: n.position.x, y: n.position.y } : x)) }))}
              onNodeClick={(_, n) => editable && setSel({ type: "node", id: n.id })}
              onEdgeClick={(_, e) => editable && setSel({ type: "edge", id: e.id })}
              onNodeDoubleClick={(_, n) => (n.data as CardData).drillable && drill(n.id)}
              onPaneClick={() => setSel(null)}
              onNodesDelete={(ds) => editable && updateScope((g) => ({ nodes: g.nodes.filter((n) => !ds.some((d) => d.id === n.id)), edges: g.edges.filter((e) => !ds.some((d) => d.id === e.source || d.id === e.target)) }))}
              onEdgesDelete={(ds) => editable && updateScope((g) => ({ ...g, edges: g.edges.filter((e) => !ds.some((d) => d.id === e.id)) }))}
              deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
              proOptions={{ hideAttribution: true }}
              minZoom={0.2}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--grid)" />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable maskColor="oklch(0.17 0.012 250 / 0.7)" style={{ background: "var(--card)" }} nodeColor={(n) => `var(--cat-${catalogOf((n.data as CardData).kind).category})`} />
            </ReactFlow>
            {editable && scope.nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                Drag components here from the Components tab
              </div>
            )}
          </div>
        </main>

        {/* Right */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-sidebar p-4">
          {selNode ? (
            <NodeInspector
              key={selNode.id}
              node={selNode}
              graph={scope}
              editable={editable}
              onChange={(n) => updateScope((g) => ({ ...g, nodes: g.nodes.map((x) => (x.id === n.id ? n : x)) }))}
              onDelete={() => {
                updateScope((g) => ({ nodes: g.nodes.filter((n) => n.id !== selNode.id), edges: g.edges.filter((e) => e.source !== selNode.id && e.target !== selNode.id) }));
                setSel(null);
              }}
              onDrill={() => drill(selNode.id)}
            />
          ) : selEdge ? (
            <EdgeInspector
              key={selEdge.id}
              edge={selEdge}
              graph={scope}
              onChange={(e) => updateScope((g) => ({ ...g, edges: g.edges.map((x) => (x.id === e.id ? e : x)) }))}
              onDelete={() => {
                updateScope((g) => ({ ...g, edges: g.edges.filter((x) => x.id !== selEdge.id) }));
                setSel(null);
              }}
            />
          ) : (
            <>
              <Label>{focus ? `Inside ${focus.name}` : model.name}</Label>
              <Review graph={scope} impacted={impacted.size} onRestoreAll={() => updateScope((g) => ({ ...g, nodes: g.nodes.map((n) => ({ ...n, failed: false })) }))} />
            </>
          )}
        </aside>
      </div>

      {pendingDrop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="w-80 rounded-lg border border-border bg-popover p-5 shadow-2xl">
            <h3 className="font-semibold">What should {pendingDrop.name} do?</h3>
            <p className="mb-3 text-xs text-muted-foreground">Give it meaning inside the system model.</p>
            <div className="space-y-1.5">
              {catalogOf(pendingDrop.kind).purposes!.map((p) => (
                <button key={p} onClick={() => commitDrop({ ...pendingDrop, purpose: p })} className="block w-full rounded border border-border px-3 py-2 text-left text-sm hover:border-primary hover:bg-primary/10">
                  {p}
                </button>
              ))}
            </div>
            <button onClick={() => setPendingDrop(null)} className="mt-3 text-xs text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}
      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImport={(g, name) => {
            setModel("root" in g ? g : { name, requirements: REQUIREMENTS.map((r) => r.id).filter(() => false), root: g });
            setShowImport(false);
            setPath([]);
            setView("hld");
            setSel(null);
          }}
        />
      )}
    </div>
  );
}

export function Studio() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}
