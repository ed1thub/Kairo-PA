import { PageHeader } from "@/components/page-header";
import { AutomationsPanel } from "@/components/automations/automations-panel";

export default function AutomationsPage() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Automations" description="Scheduled tool runs: reports, digests, recurring actions." />
      <AutomationsPanel />
    </div>
  );
}
