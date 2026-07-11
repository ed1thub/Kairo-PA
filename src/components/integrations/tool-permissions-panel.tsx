"use client";

import { useCallback, useEffect, useState } from "react";

interface ToolPermission {
  toolName: string;
  permissionScope: string;
  enabled: boolean;
  requiresConfirmation: boolean;
}

const HIGH_RISK_TOOLS = new Set(["calendar_cancel", "memory_delete"]);

export function ToolPermissionsPanel() {
  const [permissions, setPermissions] = useState<ToolPermission[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/permissions");
    if (!res.ok) return;
    const body = await res.json();
    setPermissions(body.permissions);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function update(toolName: string, patch: Partial<Pick<ToolPermission, "enabled" | "requiresConfirmation">>) {
    await fetch(`/api/permissions/${toolName}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await refresh();
  }

  if (permissions.length === 0) {
    return <p className="text-sm text-neutral-500">No permission rows yet — sign in again to seed defaults.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {permissions.map((p) => {
        const highRisk = HIGH_RISK_TOOLS.has(p.toolName);
        return (
          <div
            key={p.toolName}
            className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2"
          >
            <div>
              <p className="text-sm font-medium">{p.toolName}</p>
              <p className="text-xs text-neutral-500">{p.permissionScope}</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => update(p.toolName, { enabled: e.target.checked })}
                />
                Enabled
              </label>
              <label className="flex items-center gap-1" title={highRisk ? "Always required for high-risk tools" : undefined}>
                <input
                  type="checkbox"
                  checked={p.requiresConfirmation}
                  disabled={highRisk}
                  onChange={(e) => update(p.toolName, { requiresConfirmation: e.target.checked })}
                />
                Require confirmation
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
