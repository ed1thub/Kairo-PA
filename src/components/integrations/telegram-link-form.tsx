"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function TelegramLinkForm() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "linking" | "linked" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setStatus("linking");
        setErrorMessage("");
        try {
          const res = await fetch("/api/telegram/link-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setErrorMessage(body.error ?? "Something went wrong");
            setStatus("error");
            return;
          }
          setStatus("linked");
        } catch {
          setErrorMessage("Network error");
          setStatus("error");
        }
      }}
      className="flex flex-col gap-3"
    >
      <p className="text-sm text-muted-foreground">
        Message your Kairo Telegram bot with <code className="rounded bg-muted px-1 py-0.5 text-xs">/start</code> to
        get a linking code, then enter it here.
      </p>
      <div className="flex max-w-sm gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Linking code"
          maxLength={6}
          disabled={status === "linking" || status === "linked"}
          className="uppercase"
        />
        <Button type="submit" disabled={!code.trim() || status === "linking" || status === "linked"}>
          <Send /> Link
        </Button>
      </div>
      {status === "linked" && (
        <Alert className="max-w-sm border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          <AlertDescription className="text-emerald-700 dark:text-emerald-400">
            Telegram is now linked to your account.
          </AlertDescription>
        </Alert>
      )}
      {status === "error" && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
