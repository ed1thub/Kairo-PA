import { PageHeader } from "@/components/page-header";
import { RemindersPanel } from "@/components/reminders/reminders-panel";

export default function RemindersPage() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Reminders" description="One-time and recurring reminders." />
      <RemindersPanel />
    </div>
  );
}
