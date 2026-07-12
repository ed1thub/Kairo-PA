"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PendingAction {
  id: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  riskLevel: string;
  expiresAt: string;
}

const RISK_VARIANT: Record<string, "secondary" | "destructive"> = {
  LOW: "secondary",
  MEDIUM: "secondary",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

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
    const res = await fetch(`/api/confirmations/${id}/${approve ? "approve" : "reject"}`, { method: "POST" });
    if (res.ok) {
      toast(approve ? "Action approved" : "Action rejected");
    } else {
      toast.error(`Failed to ${approve ? "approve" : "reject"} — please try again`);
    }
    await refresh();
  }

  if (pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 border-t bg-muted/40 px-4 py-3 sm:px-6">
      {pending.map((action) => (
        <div
          key={action.id}
          className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 dark:border-amber-800/60 dark:bg-amber-950/40"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{action.toolName}</p>
              <Badge variant={RISK_VARIANT[action.riskLevel] ?? "secondary"} className="text-[10px]">
                {action.riskLevel}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {JSON.stringify(action.toolArgs)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Expires {new Date(action.expiresAt).toLocaleTimeString()}
            </p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" onClick={() => handleDecision(action.id, true)}>
              <Check /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleDecision(action.id, false)}>
              <X /> Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
