import { PageHeader } from "@/components/page-header";
import { ChatPanel } from "@/components/chat/chat-panel";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Chat" description="Talk to Kairo." />
      <ChatPanel conversationId={conversationId} />
    </div>
  );
}
