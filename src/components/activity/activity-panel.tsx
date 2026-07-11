"use client";

import { useCallback, useEffect, useState } from "react";

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
    <div className="flex flex-1 flex-col gap-2 p-8 max-w-3xl mx-auto w-full">
      {rows.length === 0 && <p className="text-sm text-neutral-500">No activity yet.</p>}
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm"
        >
          <div>
            <span className="font-medium">{row.action}</span>
            {row.toolName && <span className="text-neutral-500"> · {row.toolName}</span>}
            {row.riskLevel && <span className="text-neutral-500"> · {row.riskLevel}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <span>{row.status}</span>
            {row.confirmationStatus && row.confirmationStatus !== "not_required" && (
              <span>({row.confirmationStatus})</span>
            )}
            <span>{new Date(row.createdAt).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
