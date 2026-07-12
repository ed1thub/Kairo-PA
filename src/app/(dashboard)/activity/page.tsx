import { PageHeader } from "@/components/page-header";
import { ActivityPanel } from "@/components/activity/activity-panel";

export default function ActivityPage() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Activity" description="Every tool call, permission check, and confirmation." />
      <ActivityPanel />
    </div>
  );
}
