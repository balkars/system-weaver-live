import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SystemLens — Build systems, not diagrams" },
      { name: "description", content: "A live system design workspace: start simple, add requirements, zoom from HLD to LLD, and bring draw.io or Lucid diagrams to life." },
      { property: "og:title", content: "SystemLens — Build systems, not diagrams" },
      { property: "og:description", content: "Evolve a ticketing system from three boxes to a global architecture. Explore HLD, LLD, infra, DevOps and failure impact." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<div className="flex h-screen items-center justify-center font-mono text-xs text-muted-foreground">Loading system model…</div>}>
      <Studio />
    </ClientOnly>
  );
}
