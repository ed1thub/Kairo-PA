"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ConversationRow {
  id: string;
  title: string | null;
  pinned: boolean;
  updatedAt: string;
}

export function ChatList() {
  const router = useRouter();
  const params = useParams<{ conversationId?: string }>();
  const activeId = params?.conversationId;

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const body = await res.json();
    setConversations(body.conversations);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh, activeId]);

  async function togglePin(id: string, pinned: boolean) {
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    if (!res.ok) {
      toast.error("Failed to update chat");
      return;
    }
    await refresh();
  }

  function startRename(row: ConversationRow) {
    setRenamingId(row.id);
    setRenameDraft(row.title ?? "");
  }

  async function saveRename(id: string) {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title) return;
    const res = await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) {
      toast.error("Failed to rename chat");
      return;
    }
    await refresh();
  }

  async function confirmDelete() {
    if (!deletingId) return;
    const id = deletingId;
    setDeletingId(null);
    const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete chat");
      return;
    }
    toast("Chat deleted");
    if (id === activeId) {
      router.push("/chat");
    }
    await refresh();
  }

  const pinned = conversations.filter((c) => c.pinned);
  const recent = conversations.filter((c) => !c.pinned);

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => router.push(`/chat/${crypto.randomUUID()}`)}>
                <Plus />
                <span>New chat</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {pinned.length > 0 && (
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Pinned</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {pinned.map((row) => (
                <ChatListItem
                  key={row.id}
                  row={row}
                  isActive={row.id === activeId}
                  isRenaming={renamingId === row.id}
                  renameDraft={renameDraft}
                  onRenameDraftChange={setRenameDraft}
                  onOpen={() => router.push(`/chat/${row.id}`)}
                  onStartRename={() => startRename(row)}
                  onSaveRename={() => saveRename(row.id)}
                  onTogglePin={() => togglePin(row.id, row.pinned)}
                  onDelete={() => setDeletingId(row.id)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}

      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        {pinned.length > 0 && <SidebarGroupLabel>Recent</SidebarGroupLabel>}
        <SidebarGroupContent>
          <SidebarMenu>
            {recent.map((row) => (
              <ChatListItem
                key={row.id}
                row={row}
                isActive={row.id === activeId}
                isRenaming={renamingId === row.id}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onOpen={() => router.push(`/chat/${row.id}`)}
                onStartRename={() => startRename(row)}
                onSaveRename={() => saveRename(row.id)}
                onTogglePin={() => togglePin(row.id, row.pinned)}
                onDelete={() => setDeletingId(row.id)}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the conversation and its messages. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ChatListItem({
  row,
  isActive,
  isRenaming,
  renameDraft,
  onRenameDraftChange,
  onOpen,
  onStartRename,
  onSaveRename,
  onTogglePin,
  onDelete,
}: {
  row: ConversationRow;
  isActive: boolean;
  isRenaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onOpen: () => void;
  onStartRename: () => void;
  onSaveRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  if (isRenaming) {
    return (
      <SidebarMenuItem>
        <Input
          autoFocus
          value={renameDraft}
          onChange={(e) => onRenameDraftChange(e.target.value)}
          onKeyDown={(e) => {
            // Both Enter and Escape just blur the input; onBlur is the
            // single place that actually saves, so there is exactly one
            // commit path regardless of how the user exits rename mode.
            // Escape resets the draft back to the original title first,
            // making the resulting "save" a harmless no-op.
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              onRenameDraftChange(row.title ?? "");
              e.currentTarget.blur();
            }
          }}
          onBlur={onSaveRename}
          className="h-8"
        />
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem className="group/menu-item">
      <SidebarMenuButton isActive={isActive} onClick={onOpen}>
        <span className="truncate">{row.title ?? "New chat"}</span>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover>
            <MoreHorizontal />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onStartRename}>
            <Pencil /> Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTogglePin}>
            {row.pinned ? <PinOff /> : <Pin />} {row.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
