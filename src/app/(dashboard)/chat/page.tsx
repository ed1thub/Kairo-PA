import { PageHeader } from "@/components/page-header";
import { ChatPanel } from "@/components/chat/chat-panel";

export default function ChatPage() {
  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader title="Chat" description="Talk to Kairo, same conversation as Telegram." />
      <ChatPanel />
    </div>
  );
}
