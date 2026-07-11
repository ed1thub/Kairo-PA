"use client";

import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "kairo-active-conversation-id";

function getOrCreateConversationId(): string {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

export function ChatPanel() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");

  useEffect(() => {
    // localStorage isn't available during SSR, so the conversation id can
    // only be resolved after mount, synced in from this external source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversationId(getOrCreateConversationId());
  }, []);

  const transport = useMemo(() => {
    if (!conversationId) return undefined;
    return new WorkflowChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages, api }) => {
        const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
        const text =
          lastUserMessage?.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("") ?? "";
        return { api, body: { conversationId: id, message: text } };
      },
      prepareReconnectToStreamRequest: ({ id, ...rest }) => ({
        ...rest,
        api: `/api/chat/stream/${encodeURIComponent(id)}`,
      }),
    });
  }, [conversationId]);

  const { messages, sendMessage, status } = useChat({
    id: conversationId ?? undefined,
    resume: Boolean(conversationId),
    transport,
  });

  if (!conversationId || !transport) {
    return null;
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 max-w-2xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            Say hello to Kairo. Tools (calendar, reminders, documents, web search) come in later
            phases — for now this is a plain conversation.
          </p>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={message.role === "user" ? "self-end text-right" : "self-start"}
          >
            <div className="text-xs text-neutral-500 mb-1">
              {message.role === "user" ? "You" : "Kairo"}
            </div>
            <div className="rounded-lg bg-neutral-100 dark:bg-neutral-800 px-3 py-2 inline-block whitespace-pre-wrap">
              {message.parts.map((part, i) =>
                part.type === "text" ? <span key={i}>{part.text}</span> : null,
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim()) return;
          sendMessage({ text: input });
          setInput("");
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== "ready"}
          placeholder="Message Kairo..."
          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
        />
        <button
          type="submit"
          disabled={status !== "ready"}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
