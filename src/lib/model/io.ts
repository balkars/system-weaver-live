import { inferKind } from "./catalog";
import { autoLayout, makeEdge, makeNode } from "./graph";
import type { Graph, SysNode } from "./types";

const strip = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function inflate(b64: string): Promise<string> {
  const bin = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const text = await new Response(stream).text();
  return decodeURIComponent(text);
}

export async function parseDrawio(xml: string): Promise<Graph> {
  let doc = new DOMParser().parseFromString(xml, "text/xml");
  const diagram = doc.querySelector("diagram");
  if (diagram && !diagram.querySelector("mxGraphModel") && diagram.textContent?.trim()) {
    doc = new DOMParser().parseFromString(await inflate(diagram.textContent), "text/xml");
  }
  const cells = Array.from(doc.querySelectorAll("mxCell"));
  const idMap = new Map<string, SysNode>();
  for (const c of cells) {
    if (c.getAttribute("vertex") !== "1") continue;
    const label = strip(c.getAttribute("value") ?? c.parentElement?.getAttribute("label") ?? "");
    if (!label) continue;
    const kind = inferKind(label + " " + (c.getAttribute("style") ?? ""));
    const id = c.getAttribute("id") ?? c.parentElement?.getAttribute("id") ?? "";
    idMap.set(id, makeNode(kind, label));
  }
  const edges = cells
    .filter((c) => c.getAttribute("edge") === "1")
    .flatMap((c) => {
      const s = idMap.get(c.getAttribute("source") ?? "");
      const t = idMap.get(c.getAttribute("target") ?? "");
      const label = strip(c.getAttribute("value") ?? "");
      return s && t ? [makeEdge(s.id, t.id, label ? { protocol: label } : {})] : [];
    });
  return autoLayout({ nodes: [...idMap.values()], edges });
}

export function parseMermaid(src: string): Graph {
  const nodes = new Map<string, SysNode>();
  const edges: Graph["edges"] = [];
  const nodeRe = /^\s*([A-Za-z0-9_]+)\s*(?:\[\[?\(?\s*"?([^\]\)"]+)"?\s*\)?\]?\]|\(\(?\s*"?([^\)"]+)"?\s*\)?\)|\{\s*"?([^}"]+)"?\s*\}|\[\(\s*([^\)]+)\s*\)\])?/;
  const get = (tok: string) => {
    const m = tok.match(nodeRe);
    if (!m) return null;
    const id = m[1];
    const label = (m[2] ?? m[3] ?? m[4] ?? m[5] ?? "").trim();
    let n = nodes.get(id);
    if (!n) {
      n = makeNode(inferKind(label || id), label || id);
      nodes.set(id, n);
    } else if (label) {
      n.name = label;
      n.kind = inferKind(label);
    }
    return n;
  };
  for (const raw of src.split(/\n|;/)) {
    const line = raw.trim();
    if (!line || /^(graph|flowchart|subgraph|end|classDef|class|style|%%)/.test(line)) continue;
    const parts = line.split(/\s*(?:-->|---|-\.->|==>|-\.-|--[^->]+-->)\s*(?:\|([^|]*)\|)?\s*/);
    // split keeps capture groups: [node, label?, node, label?, node]
    const toks: string[] = [];
    const labels: (string | undefined)[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) toks.push(parts[i]);
      else labels.push(parts[i]);
    }
    const ns = toks.map((t) => (t ? get(t) : null));
    for (let i = 1; i < ns.length; i++) {
      if (ns[i - 1] && ns[i]) edges.push(makeEdge(ns[i - 1]!.id, ns[i]!.id, labels[i - 1] ? { protocol: labels[i - 1]!.trim() } : {}));
    }
  }
  return autoLayout({ nodes: [...nodes.values()], edges });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export function toDrawio(g: Graph, name: string): string {
  const cells = [
    ...g.nodes.map(
      (n) =>
        `<mxCell id="${n.id}" value="${esc(n.name)}" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="${Math.round(n.x + 600)}" y="${Math.round(n.y + 40)}" width="180" height="60" as="geometry"/></mxCell>`,
    ),
    ...g.edges.map(
      (e) =>
        `<mxCell id="${e.id}" value="${esc(e.protocol)}" style="endArrow=classic;html=1;" edge="1" parent="1" source="${e.source}" target="${e.target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    ),
  ].join("\n");
  return `<mxfile host="SystemLens"><diagram name="${esc(name)}"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>\n${cells}\n</root></mxGraphModel></diagram></mxfile>`;
}

export function toMermaid(g: Graph): string {
  const id = new Map(g.nodes.map((n, i) => [n.id, `N${i}`]));
  const lines = ["flowchart TD", ...g.nodes.map((n) => `  ${id.get(n.id)}["${n.name.replace(/"/g, "'")}"]`), ...g.edges.map((e) => `  ${id.get(e.source)} -->|${e.protocol}| ${id.get(e.target)}`)];
  return lines.join("\n");
}

export function download(filename: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Lucidchart "Export → CSV of shape data". */
export function parseLucidCsv(csv: string): Graph {
  const rows = csv.split(/\r?\n/).filter(Boolean).map((line) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  });
  const [head, ...body] = rows;
  const col = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n);
  const iId = col("id"), iText = col("text area 1"), iSrc = col("line source"), iDst = col("line destination");
  const map = new Map<string, SysNode>();
  body.forEach((r) => {
    if (r[iSrc] || r[iDst] || !r[iText]) return;
    map.set(r[iId], makeNode(inferKind(r[iText]), r[iText].trim()));
  });
  const edges = body.flatMap((r) => {
    const s = map.get(r[iSrc]);
    const t = map.get(r[iDst]);
    return s && t ? [makeEdge(s.id, t.id, r[iText] ? { protocol: r[iText] } : {})] : [];
  });
  return autoLayout({ nodes: [...map.values()], edges });
}
