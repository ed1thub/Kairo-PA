"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Repeat, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ReminderRow {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  recurrenceRule: string | null;
  deliveryChannel: string;
}

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

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
    toast.success("Reminder created");
    setTitle("");
    setDueAt("");
    await refresh();
  }

  async function handleCancel(id: string) {
    const res = await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    toast(res.ok ? "Reminder cancelled" : "Failed to cancel reminder");
    await refresh();
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
    toast(res.ok ? "Reminder deleted" : "Failed to delete reminder");
    await refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Card>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Remind me to..."
              className="flex-1"
            />
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="sm:w-56"
            />
            <Button type="submit" className="whitespace-nowrap">
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {reminders.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No reminders yet. Create one above, or ask Kairo in chat.
          </p>
        )}
        {reminders.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Bell className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  {new Date(r.dueAt).toLocaleString()}
                  {r.recurrenceRule && (
                    <span className="flex items-center gap-0.5">
                      <Repeat className="size-3" /> recurring
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary" className={cn("capitalize", STATUS_STYLES[r.status])}>
                {r.status}
              </Badge>
              {r.status === "planned" && (
                <Button variant="ghost" size="icon-sm" onClick={() => handleCancel(r.id)}>
                  <X />
                  <span className="sr-only">Cancel</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(r.id)}
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
