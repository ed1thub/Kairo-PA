"use client";

import { useState } from "react";

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
      className="flex flex-col gap-3 max-w-sm"
    >
      <p className="text-sm text-neutral-500">
        Message your Kairo Telegram bot with <code>/start</code> to get a linking code, then enter
        it here.
      </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Linking code"
        maxLength={6}
        disabled={status === "linking" || status === "linked"}
        className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 uppercase"
      />
      <button
        type="submit"
        disabled={!code.trim() || status === "linking" || status === "linked"}
        className="rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 disabled:opacity-50"
      >
        {status === "linked" ? "Linked" : "Link Telegram"}
      </button>
      {status === "linked" && (
        <p className="text-sm text-green-600">Telegram is now linked to your account.</p>
      )}
      {status === "error" && <p className="text-sm text-red-600">{errorMessage}</p>}
    </form>
  );
}
