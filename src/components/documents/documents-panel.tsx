"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DocumentRow {
  id: string;
  filename: string;
  status: string;
  error: string | null;
  sourceChannel: string;
  uploadedAt: string;
}

export function DocumentsPanel() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (!res.ok) return;
    const body = await res.json();
    setDocuments(body.documents);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // Poll while any document is still processing.
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      if (res.ok) {
        if (fileInputRef.current) fileInputRef.current.value = "";
        await refresh();
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function handleReprocess(id: string) {
    await fetch(`/api/documents/${id}/reprocess`, { method: "POST" });
    await refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-8 max-w-2xl mx-auto w-full">
      <form onSubmit={handleUpload} className="flex gap-2 items-center">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv"
          disabled={uploading}
        />
        <button
          type="submit"
          disabled={uploading}
          className="rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 disabled:opacity-50 whitespace-nowrap"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {documents.length === 0 && (
          <p className="text-sm text-neutral-500">
            No documents yet. Upload a PDF, DOCX, XLSX, PPTX, TXT, MD, or CSV file, or forward one
            to the Telegram bot.
          </p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{doc.filename}</p>
              <p className="text-xs text-neutral-500">
                {doc.status}
                {doc.error ? ` — ${doc.error}` : ""} · via {doc.sourceChannel}
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              {doc.status === "failed" && (
                <button onClick={() => handleReprocess(doc.id)} className="underline">
                  Retry
                </button>
              )}
              <button onClick={() => handleDelete(doc.id)} className="underline text-red-600">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
