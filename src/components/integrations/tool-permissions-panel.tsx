"use client";

import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
    const previous = permissions;
    setPermissions((current) => current.map((p) => (p.toolName === toolName ? { ...p, ...patch } : p)));
    const res = await fetch(`/api/permissions/${toolName}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setPermissions(previous);
      toast.error("Failed to update permission");
    }
  }

  if (permissions.length === 0) {
    return <p className="text-sm text-muted-foreground">No permission rows yet. Sign in again to seed defaults.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {permissions.map((p) => {
        const highRisk = HIGH_RISK_TOOLS.has(p.toolName);
        return (
          <div key={p.toolName} className="flex items-center justify-between gap-4 rounded-lg px-2 py-2.5 hover:bg-muted/50">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate font-mono text-sm">{p.toolName}</p>
                <Badge variant="outline" className="text-[10px]">
                  {p.permissionScope}
                </Badge>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-5 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Enabled</span>
                <Switch checked={p.enabled} onCheckedChange={(v) => update(p.toolName, { enabled: v })} />
              </label>
              <label
                className="flex items-center gap-2"
                title={highRisk ? "Always required for high-risk tools" : undefined}
              >
                <span className="text-muted-foreground">Confirm</span>
                <Switch
                  checked={p.requiresConfirmation}
                  disabled={highRisk}
                  onCheckedChange={(v) => update(p.toolName, { requiresConfirmation: v })}
                />
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
