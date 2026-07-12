"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, FileText, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DocumentRow {
  id: string;
  filename: string;
  status: string;
  error: string | null;
  sourceChannel: string;
  uploadedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  failed: "bg-destructive/10 text-destructive",
};

export function DocumentsPanel() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
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

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      if (res.ok) {
        toast.success(`${file.name} uploaded`);
        await refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string, filename: string) {
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    toast(res.ok ? `${filename} deleted` : `Failed to delete ${filename}`);
    await refresh();
  }

  async function handleReprocess(id: string) {
    const res = await fetch(`/api/documents/${id}/reprocess`, { method: "POST" });
    toast(res.ok ? "Reprocessing started" : "Failed to start reprocessing");
    await refresh();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <Card
        className={cn(
          "border-dashed transition-colors",
          dragOver && "border-primary bg-primary/5",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) uploadFile(file);
        }}
      >
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Upload className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Drop a file here, or browse</p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, or forward one to the Telegram bot
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv"
            disabled={uploading}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {documents.length === 0 && (
          <p className="text-sm text-muted-foreground">No documents yet.</p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{doc.filename}</p>
                <p className="text-xs text-muted-foreground">
                  via {doc.sourceChannel} · {new Date(doc.uploadedAt).toLocaleDateString()}
                  {doc.error ? ` · ${doc.error}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary" className={cn("capitalize", STATUS_STYLES[doc.status])}>
                {doc.status}
              </Badge>
              {doc.status === "failed" && (
                <Button variant="ghost" size="icon-sm" onClick={() => handleReprocess(doc.id)}>
                  <RotateCcw />
                  <span className="sr-only">Retry</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-destructive hover:text-destructive"
                onClick={() => handleDelete(doc.id, doc.filename)}
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
