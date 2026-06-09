"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BookmarkGroupDialog({
  open,
  onOpenChange,
  mode,
  initialName = "",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "rename";
  initialName?: string;
  onSubmit: (name: string) => void | Promise<void>;
}) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create group" : "Rename group"}</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {mode === "create"
              ? "Add a group to organize bookmarks in this tab."
              : "Update the group name."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="group-name">Name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Infrastructure"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const trimmed = name.trim();
                if (trimmed) void onSubmit(trimmed);
              }
            }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const trimmed = name.trim();
              if (trimmed) void onSubmit(trimmed);
            }}
            disabled={!name.trim()}
          >
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
