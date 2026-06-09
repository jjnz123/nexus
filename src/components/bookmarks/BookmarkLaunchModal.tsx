"use client";

import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BookmarkLaunchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  url: string;
};

export function BookmarkLaunchModal({
  open,
  onOpenChange,
  title,
  url,
}: BookmarkLaunchModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-zinc-800 bg-zinc-950 p-0">
        <DialogHeader className="space-y-2 border-b border-zinc-800 px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Sandboxed iframe preview. External sites may block embedding.
          </DialogDescription>
        </DialogHeader>
        <iframe
          title={title}
          src={url}
          className="h-[70vh] w-full bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </DialogContent>
    </Dialog>
  );
}
