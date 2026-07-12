"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Pencil, Trash2, Lock } from "lucide-react";
import { MEMORY_CATEGORIES } from "@/lib/memory-constants";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface MemoryRow {
  id: string;
  content: string;
  category: string | null;
  sensitivity: string;
  source: string | null;
  approved: boolean;
  createdAt: string;
}

export function MemoryPanel() {
  const [rows, setRows] = useState<MemoryRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/memory");
    if (!res.ok) return;
    const body = await res.json();
    setRows(body.memories);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function handleDelete(id: string) {
    const res = await fetch(`/api/memory/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    toast("Memory deleted");
    setRows((current) => current.filter((r) => r.id !== id));
  }

  function startEdit(row: MemoryRow) {
    setEditingId(row.id);
    setDraft(row.content);
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/memory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: draft }),
    });
    setEditingId(null);
    if (!res.ok) return;
    const { memory } = await res.json();
    toast.success("Memory updated");
    setRows((current) => current.map((r) => (r.id === id ? memory : r)));
  }

  async function handleExport() {
    const res = await fetch("/api/memory/export");
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kairo-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Kairo proposes new memories as it learns things worth keeping. Sensitive ones always ask first.
        </p>
        <Button variant="outline" size="sm" onClick={handleExport} className="shrink-0">
          <Download /> Export
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing remembered yet.</p>}
        {rows.map((m) => (
          <div key={m.id} className="flex flex-col gap-2 rounded-lg border px-4 py-3">
            {editingId === m.id ? (
              <div className="flex flex-col gap-2">
                <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => saveEdit(m.id)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm">{m.content}</p>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => startEdit(m)}>
                      <Pencil />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(m.id)}
                    >
                      <Trash2 />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {m.category && (
                    <Badge variant="secondary" className="capitalize">
                      {m.category}
                    </Badge>
                  )}
                  {m.sensitivity === "sensitive" && (
                    <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                      <Lock className="size-3" /> sensitive
                    </Badge>
                  )}
                  {!m.approved && <Badge variant="outline">pending approval</Badge>}
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Categories: {MEMORY_CATEGORIES.join(", ")}.
      </p>
    </div>
  );
}
