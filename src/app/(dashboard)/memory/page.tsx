import { PageHeader } from "@/components/page-header";
import { MemoryPanel } from "@/components/memory/memory-panel";

export default function MemoryPage() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Memory" description="What Kairo remembers about you across conversations." />
      <MemoryPanel />
    </div>
  );
}
