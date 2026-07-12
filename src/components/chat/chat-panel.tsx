"use client";

import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { WorkflowChatTransport } from "@workflow/ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Send, Sparkles, TriangleAlert, SquarePlus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PendingConfirmations } from "@/components/chat/pending-confirmations";
import { cn } from "@/lib/utils";

const STARTED_KEY_PREFIX = "kairo-conversation-started:";

export function ChatPanel({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  // A conversation only has something to resume once its first message has
  // actually reached the server (row + workflow run created). Resuming a
  // brand-new id 404s on GET /api/chat/stream/[id] and permanently wedges
  // useChat's status at "error", disabling the composer. This is decided
  // once per conversationId and never flipped again afterward: useChat's
  // resume effect re-fires resumeStream() on every false->true transition
  // of `resume`, so toggling it true right after the first sendMessage()
  // (as opposed to only reading it once when the conversation loads) races
  // the same GET against the POST that's still creating the conversation
  // row server-side.
  const [shouldResume, setShouldResume] = useState(false);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Re-derive on every conversationId change, not just on mount: this
    // component instance is reused across chat switches (Next.js keeps the
    // same page component mounted when only the dynamic segment changes),
    // so a [] dependency array here would leave shouldResume/input stuck
    // from the previously-open chat.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInput("");
    setShouldResume(localStorage.getItem(STARTED_KEY_PREFIX + conversationId) === "1");
  }, [conversationId]);

  const transport = useMemo(() => {
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
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        const model = res.headers.get("x-model");
        if (model) console.info(`[Kairo] LLM model: ${model}`);
        return res;
      },
    });
    // Stable across conversationId changes: the id is read from useChat's
    // own params at request time (see prepareSendMessagesRequest above),
    // never closed over here.
  }, []);

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    resume: shouldResume,
    transport,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function submit() {
    if (!input.trim() || status !== "ready") return;
    sendMessage({ text: input });
    setInput("");
    localStorage.setItem(STARTED_KEY_PREFIX + conversationId, "1");
  }

  // The underlying workflow run backing a conversation can fail outright
  // (Groq's free-tier models occasionally reject a tool call; see
  // docs/ASSUMPTIONS.md) and there is no way to resume a dead run. Once
  // that happens the composer would otherwise stay disabled forever with
  // no way out.
  function startNewConversation() {
    router.push(`/chat/${crypto.randomUUID()}`);
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Say hello to Kairo</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ask about your documents, set a reminder, check your calendar, or just chat.
                </p>
              </div>
            </div>
          )}
          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <div key={message.id} className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className={cn(isUser ? "bg-secondary" : "bg-primary text-primary-foreground")}>
                    {isUser ? "Y" : <Bot className="size-3.5" />}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                    isUser ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {message.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <PendingConfirmations />

      {error && (
        <div className="flex items-center gap-2 border-t bg-destructive/10 px-4 py-3 text-sm text-destructive sm:px-6">
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            This conversation hit an error and can&apos;t continue. Starting a new one (+ below) usually fixes it,
            but if a fresh conversation fails too, the AI provider&apos;s usage limit may be temporarily exhausted;
            wait a bit and try again.
          </span>
        </div>
      )}

      <div className="border-t p-4 sm:p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mx-auto flex w-full max-w-2xl items-end gap-2"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={startNewConversation}
            title="Start new conversation"
          >
            <SquarePlus />
            <span className="sr-only">Start new conversation</span>
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={status !== "ready"}
            placeholder="Message Kairo..."
            rows={1}
            className="min-h-9 flex-1 resize-none"
          />
          <Button type="submit" size="icon" disabled={status !== "ready" || !input.trim()}>
            <Send />
            <span className="sr-only">Send</span>
          </Button>
        </form>
      </div>
    </div>
  );
}
