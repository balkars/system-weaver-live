import { useState } from "react";
import { FileUp, X } from "lucide-react";
import { parseDrawio, parseLucidCsv, parseMermaid } from "@/lib/model/io";
import type { Graph, SystemModel } from "@/lib/model/types";

const SAMPLE = `flowchart TD
  U[Customers] --> W[Web App]
  W -->|REST| API[Support API]
  API --> PG[(PostgreSQL)]
  API --> R[Redis Cache]
  API -->|events| Q[SQS Queue]
  Q --> N[Notification Worker]
  N --> E[Email SES]`;

export function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (g: Graph | SystemModel, name: string) => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [err, setErr] = useState("");

  const run = async (src: string, fname: string) => {
    setErr("");
    try {
      const t = src.trim();
      let g: Graph;
      if (fname.endsWith(".json") || t.startsWith("{")) {
        const m = JSON.parse(t) as SystemModel;
        if (!m.root?.nodes) throw new Error("Not a SystemLens model file");
        return onImport(m, m.name);
      } else if (t.startsWith("<") || /\.(drawio|xml)$/.test(fname)) g = await parseDrawio(t);
      else if (/\.csv$/.test(fname) || /^"?id"?,/i.test(t)) g = parseLucidCsv(t);
      else g = parseMermaid(t);
      if (!g.nodes.length) throw new Error("No components found in this diagram.");
      onImport(g, fname.replace(/\.[^.]+$/, "") || "Imported System");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that diagram.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-lg border border-border bg-popover p-5 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bring your HLD to life</h2>
          <button onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Upload a draw.io / diagrams.net file, a Lucidchart CSV export, Mermaid flowchart, or a SystemLens JSON. Each shape becomes a typed, explorable component.
        </p>
        <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card py-6 text-sm hover:border-ring">
          <FileUp className="h-4 w-4" /> {fileName || "Choose .drawio, .xml, .csv, .mmd or .json"}
          <input
            type="file"
            accept=".drawio,.xml,.csv,.mmd,.md,.txt,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name);
              run(await f.text(), f.name.toLowerCase());
            }}
          />
        </label>
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>or paste</span>
          <button onClick={() => setText(SAMPLE)} className="normal-case tracking-normal hover:text-primary">use sample</button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="flowchart TD&#10;  A[Frontend] --> B[API]" className="w-full rounded border border-input bg-background p-2 font-mono text-xs outline-none focus:border-ring" />
        {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-border px-3 py-1.5 text-sm">Cancel</button>
          <button disabled={!text.trim()} onClick={() => run(text, "")} className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40">
            Import & animate
          </button>
        </div>
      </div>
    </div>
  );
}
