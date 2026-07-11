"use client";

import { useCallback, useEffect, useState } from "react";
import { MEMORY_CATEGORIES } from "@/lib/memory-constants";

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
    <div className="flex flex-1 flex-col gap-6 p-8 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          What Kairo remembers about you across conversations. Kairo proposes new memories as it
          learns things worth keeping — sensitive ones always ask first.
        </p>
        <button onClick={handleExport} className="text-sm underline whitespace-nowrap ml-4">
          Export JSON
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {rows.length === 0 && (
          <p className="text-sm text-neutral-500">Nothing remembered yet.</p>
        )}
        {rows.map((m) => (
          <div
            key={m.id}
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
          >
            {editingId === m.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
                  rows={2}
                />
                <div className="flex gap-3 text-sm">
                  <button onClick={() => saveEdit(m.id)} className="underline">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="underline text-neutral-500">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm">{m.content}</p>
                  <div className="flex gap-2 text-sm whitespace-nowrap">
                    <button onClick={() => startEdit(m)} className="underline">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(m.id)} className="underline text-red-600">
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-xs text-neutral-500">
                  {m.category ?? "uncategorized"} · {m.sensitivity}
                  {!m.approved ? " · pending approval" : ""} · {new Date(m.createdAt).toLocaleDateString()}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-neutral-400">
        Categories: {MEMORY_CATEGORIES.join(", ")}. Memories marked &ldquo;sensitive&rdquo; always required
        your explicit confirmation before being saved.
      </p>
    </div>
  );
}
