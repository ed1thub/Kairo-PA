"use client";

import { useCallback, useEffect, useState } from "react";
import { Workflow, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface AutomationRow {
  id: string;
  name: string;
  schedule: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

const EXAMPLE_ACTIONS = JSON.stringify(
  [{ toolName: "reminder_list", input: { status: "planned" } }],
  null,
  2,
);

export function AutomationsPanel() {
  const [automations, setAutomations] = useState<AutomationRow[]>([]);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0");
  const [actionsJson, setActionsJson] = useState(EXAMPLE_ACTIONS);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/automations");
    if (!res.ok) return;
    const body = await res.json();
    setAutomations(body.automations);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    let actions;
    try {
      actions = JSON.parse(actionsJson);
    } catch {
      setError("Actions must be valid JSON");
      return;
    }
    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, schedule, actions }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Failed to create automation");
      return;
    }
    toast.success("Automation created");
    setName("");
    await refresh();
  }

  async function handleToggle(id: string, enabled: boolean) {
    await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    await refresh();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/automations/${id}`, { method: "DELETE" });
    toast(res.ok ? "Automation deleted" : "Failed to delete automation");
    await refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Card>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="automation-name">Name</Label>
              <Input
                id="automation-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weekly reminder summary"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="automation-schedule">Schedule (RRULE)</Label>
              <Input
                id="automation-schedule"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="automation-actions">Actions (JSON)</Label>
              <Textarea
                id="automation-actions"
                value={actionsJson}
                onChange={(e) => setActionsJson(e.target.value)}
                rows={5}
                className="font-mono text-sm"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="self-start">
              Create automation
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {automations.length === 0 && (
          <p className="text-sm text-muted-foreground">No automations yet.</p>
        )}
        {automations.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Workflow className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {a.nextRunAt ? `next run ${new Date(a.nextRunAt).toLocaleString()}` : "no upcoming run"}
                  {a.lastRunAt ? ` · last run ${new Date(a.lastRunAt).toLocaleString()}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Switch checked={a.enabled} onCheckedChange={() => handleToggle(a.id, a.enabled)} />
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(a.id)}
              >
                <Trash2 />
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
