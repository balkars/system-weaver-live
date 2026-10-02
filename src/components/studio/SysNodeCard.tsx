import { Handle, Position, type NodeProps } from "@xyflow/react";
import { icons, Layers } from "lucide-react";
import { catalogOf } from "@/lib/model/catalog";
import { cn } from "@/lib/utils";

export type CardData = {
  label: string;
  kind: string;
  sub?: string;
  state?: "failed" | "impacted";
  drillable?: boolean;
  derived?: boolean;
};

export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const name = catalogOf(kind).icon as keyof typeof icons;
  const Icon = icons[name] ?? icons.Puzzle;
  return <Icon className={className} />;
}

export function SysNodeCard({ data, selected }: NodeProps & { data: CardData }) {
  const c = catalogOf(data.kind);
  return (
    <div
      style={{ ["--cat" as string]: `var(--cat-${c.category})` }}
      className={cn(
        "group relative w-[190px] rounded-md border bg-card px-3 py-2 shadow-lg transition-all",
        "border-l-[3px] [border-left-color:var(--cat)]",
        selected && "ring-2 ring-ring",
        data.state === "failed" && "border-destructive bg-destructive/15 [border-left-color:var(--destructive)]",
        data.state === "impacted" && "border-warning/80 bg-warning/10",
        data.derived && "border-dashed",
      )}
    >
      <Handle type="target" position={Position.Top} />
      <div className="flex items-center gap-2">
        <KindIcon kind={data.kind} className="h-4 w-4 shrink-0 [color:var(--cat)]" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium leading-tight">{data.label}</div>
          <div className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {data.state === "failed" ? "✕ down" : data.state === "impacted" ? "△ impacted" : data.sub || c.label}
          </div>
        </div>
        {data.drillable && <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
