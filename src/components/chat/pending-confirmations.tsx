"use client";

import { useCallback, useEffect, useState } from "react";

interface PendingAction {
  id: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskLevel: string;
  expiresAt: string;
}

export function PendingConfirmations() {
  const [pending, setPending] = useState<PendingAction[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/confirmations");
    if (!res.ok) return;
    const body = await res.json();
    setPending(body.pendingActions);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleDecision(id: string, approve: boolean) {
    await fetch(`/api/confirmations/${id}/${approve ? "approve" : "reject"}`, { method: "POST" });
    await refresh();
  }

  if (pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pt-4 max-w-2xl mx-auto w-full">
      {pending.map((action) => (
        <div
          key={action.id}
          className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3"
        >
          <p className="text-sm font-medium">Confirm: {action.toolName}</p>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
            {JSON.stringify(action.toolArgs)}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            Risk: {action.riskLevel} · expires {new Date(action.expiresAt).toLocaleTimeString()}
          </p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleDecision(action.id, true)}
              className="rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-3 py-1 text-sm"
            >
              Approve
            </button>
            <button
              onClick={() => handleDecision(action.id, false)}
              className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-1 text-sm"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
