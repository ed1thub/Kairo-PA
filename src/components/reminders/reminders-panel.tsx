"use client";

import { useCallback, useEffect, useState } from "react";

interface ReminderRow {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  recurrenceRule: string | null;
  deliveryChannel: string;
}

export function RemindersPanel() {
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/reminders");
    if (!res.ok) return;
    const body = await res.json();
    setReminders(body.reminders);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim() || !dueAt) return;
    await fetch("/api/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueAt: new Date(dueAt).toISOString(), deliveryChannel: "both" }),
    });
    setTitle("");
    setDueAt("");
    await refresh();
  }

  async function handleCancel(id: string) {
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    await refresh();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-8 max-w-2xl mx-auto w-full">
      <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Remind me to..."
          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
        />
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
        />
        <button
          type="submit"
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 whitespace-nowrap"
        >
          Create
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {reminders.length === 0 && (
          <p className="text-sm text-neutral-500">
            No reminders yet. Create one above, or ask Kairo in chat.
          </p>
        )}
        {reminders.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-xs text-neutral-500">
                {new Date(r.dueAt).toLocaleString()} · {r.status}
                {r.recurrenceRule ? " · recurring" : ""}
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              {r.status === "planned" && (
                <button onClick={() => handleCancel(r.id)} className="underline">
                  Cancel
                </button>
              )}
              <button onClick={() => handleDelete(r.id)} className="underline text-red-600">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
