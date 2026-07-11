import { ChatPanel } from "@/components/chat/chat-panel";
import { PendingConfirmations } from "@/components/chat/pending-confirmations";

export default function ChatPage() {
  return (
    <div className="flex flex-1 flex-col">
      <PendingConfirmations />
      <ChatPanel />
    </div>
  );
}
