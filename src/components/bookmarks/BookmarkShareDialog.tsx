"use client";

import { useEffect, useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BookmarkShareResource } from "@/lib/db/schema";
import {
  getBookmarkShareState,
  getShareableUsers,
  updateBookmarkSharing,
} from "@/server/actions/bookmark-shares";

export function BookmarkShareDialog({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: BookmarkShareResource;
  resourceId: string | null;
  resourceName: string;
}) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [visibility, setVisibility] = useState<"everyone" | "restricted">("everyone");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !resourceId) return;
    let cancelled = false;
    void Promise.all([getShareableUsers(), getBookmarkShareState(resourceType, resourceId)])
      .then(([userList, state]) => {
        if (cancelled) return;
        setUsers(userList);
        setVisibility(state.visibility);
        setSelectedUserIds(state.userIds);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load sharing settings");
      });
    return () => {
      cancelled = true;
    };
  }, [open, resourceId, resourceType]);

  function toggleUser(userId: string, checked: boolean) {
    setSelectedUserIds((prev) =>
      checked ? [...prev, userId] : prev.filter((id) => id !== userId)
    );
  }

  function save() {
    if (!resourceId) return;
    startTransition(async () => {
      try {
        await updateBookmarkSharing({
          resourceType,
          resourceId,
          visibility: resourceType === "tab" ? visibility : undefined,
          userIds: selectedUserIds,
        });
        toast.success("Sharing updated");
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update sharing");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share bookmarks
          </DialogTitle>
          <DialogDescription>
            Share <strong>{resourceName}</strong> with selected users. Restricted tabs are only
            visible to admins and shared users.
          </DialogDescription>
        </DialogHeader>

        {resourceType === "tab" ? (
          <div className="space-y-2">
            <Label>Tab visibility</Label>
            <Select
              value={visibility}
              onValueChange={(v: "everyone" | "restricted") => setVisibility(v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone — all users with bookmark access</SelectItem>
                <SelectItem value="restricted">Restricted — only shared users + admins</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="max-h-[40vh] space-y-2 overflow-y-auto rounded-lg border p-3">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users available.</p>
          ) : (
            users.map((user) => (
              <label key={user.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50">
                <Checkbox
                  checked={selectedUserIds.includes(user.id)}
                  onCheckedChange={(checked) => toggleUser(user.id, checked === true)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{user.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isPending || !resourceId}>
            {isPending ? "Saving…" : "Save sharing"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
