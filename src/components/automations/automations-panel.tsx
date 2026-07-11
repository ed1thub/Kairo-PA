"use client";

import { useCallback, useEffect, useState } from "react";

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
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-8 max-w-2xl mx-auto w-full">
      <form onSubmit={handleCreate} className="flex flex-col gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Automation name (e.g. Weekly reminder summary)"
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
        />
        <input
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          placeholder="RRULE schedule"
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 font-mono text-sm"
        />
        <textarea
          value={actionsJson}
          onChange={(e) => setActionsJson(e.target.value)}
          rows={5}
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 font-mono text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="self-start rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2"
        >
          Create automation
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {automations.length === 0 && (
          <p className="text-sm text-neutral-500">No automations yet.</p>
        )}
        {automations.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-xs text-neutral-500">
                {a.enabled ? "enabled" : "paused"}
                {a.nextRunAt ? ` · next run ${new Date(a.nextRunAt).toLocaleString()}` : ""}
                {a.lastRunAt ? ` · last run ${new Date(a.lastRunAt).toLocaleString()}` : ""}
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <button onClick={() => handleToggle(a.id, a.enabled)} className="underline">
                {a.enabled ? "Pause" : "Enable"}
              </button>
              <button onClick={() => handleDelete(a.id)} className="underline text-red-600">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
