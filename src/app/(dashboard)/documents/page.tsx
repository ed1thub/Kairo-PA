import { PageHeader } from "@/components/page-header";
import { DocumentsPanel } from "@/components/documents/documents-panel";

export default function DocumentsPage() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Documents" description="Uploaded files Kairo can search over with RAG." />
      <DocumentsPanel />
    </div>
  );
}
