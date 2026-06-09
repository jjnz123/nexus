"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { FileText, Paperclip, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { addTaskAttachment, deleteTaskAttachment } from "@/server/actions/tasks";
import { Button } from "@/components/ui/button";
import type { TaskAttachment } from "./types";

async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!response.ok) throw new Error("Upload failed");
  const data = (await response.json()) as { path: string };
  return {
    path: data.path,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  };
}

function isImage(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isPdf(mimeType: string) {
  return mimeType === "application/pdf";
}

export function TaskAttachmentsPanel({
  taskId,
  attachments,
  onChange,
}: {
  taskId: string;
  attachments: TaskAttachment[];
  onChange: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    startTransition(async () => {
      try {
        for (const file of Array.from(fileList).slice(0, 8)) {
          const uploaded = await uploadFile(file);
          await addTaskAttachment({
            taskId,
            filename: uploaded.filename,
            path: uploaded.path,
            mimeType: uploaded.mimeType,
            size: uploaded.size,
          });
        }
        await onChange();
        toast.success("Attachment uploaded");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function removeAttachment(attachmentId: string) {
    startTransition(async () => {
      try {
        await deleteTaskAttachment(attachmentId);
        if (preview?.id === attachmentId) setPreview(null);
        await onChange();
        toast.success("Attachment removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to remove attachment");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium">Attachments</h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="mr-1 h-4 w-4" />
          Upload
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => handleUpload(event.target.files)}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attachments yet.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {attachments.map((file) => (
            <div key={file.id} className="flex items-start gap-2 rounded-md border p-2">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setPreview(file)}
              >
                {isImage(file.mimeType) ? (
                  <Image
                    src={`/uploads/${file.path}`}
                    alt={file.filename}
                    width={120}
                    height={80}
                    className="mb-2 h-20 w-full rounded object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="mb-2 flex h-20 items-center justify-center rounded bg-muted/40">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <p className="truncate text-sm font-medium">{file.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="shrink-0 text-destructive"
                disabled={isPending}
                onClick={() => removeAttachment(file.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {preview ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border bg-background p-4 shadow-xl">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="absolute right-2 top-2"
              onClick={() => setPreview(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            <h5 className="mb-3 pr-10 font-medium">{preview.filename}</h5>
            {isImage(preview.mimeType) ? (
              <Image
                src={`/uploads/${preview.path}`}
                alt={preview.filename}
                width={960}
                height={720}
                className="mx-auto max-h-[70vh] w-auto rounded object-contain"
                unoptimized
              />
            ) : isPdf(preview.mimeType) ? (
              <iframe
                title={preview.filename}
                src={`/uploads/${preview.path}`}
                className="h-[70vh] w-full rounded border"
              />
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">Preview not available for this file type.</p>
                <Button asChild variant="outline">
                  <a href={`/uploads/${preview.path}`} target="_blank" rel="noopener noreferrer">
                    Open file
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
