"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface AuditLogRow {
  id: string;
  action: string;
  toolName: string | null;
  riskLevel: string | null;
  status: string;
  confirmationStatus: string | null;
  channel: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  requires_confirmation: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
};

const RISK_STYLES: Record<string, string> = {
  HIGH: "border-destructive/40 text-destructive",
  CRITICAL: "border-destructive/40 text-destructive",
};

export function ActivityPanel() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/audit-log");
    if (!res.ok) return;
    const body = await res.json();
    setRows(body.auditLogs);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return (
    <div className="flex flex-1 flex-col gap-2 p-4 sm:p-6">
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-4 py-2.5 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.action}</span>
            {row.toolName && <span className="font-mono text-xs text-muted-foreground">{row.toolName}</span>}
            {row.riskLevel && (
              <Badge variant="outline" className={cn("text-[10px]", RISK_STYLES[row.riskLevel])}>
                {row.riskLevel}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className={cn("text-[10px] capitalize", STATUS_STYLES[row.status])}>
              {row.status.replace(/_/g, " ")}
            </Badge>
            {row.confirmationStatus && row.confirmationStatus !== "not_required" && (
              <span className="capitalize">({row.confirmationStatus})</span>
            )}
            <span>{new Date(row.createdAt).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
