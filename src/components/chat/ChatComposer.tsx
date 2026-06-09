"use client";

import { useRef } from "react";
import { Paperclip, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AiMessageAttachment } from "@/lib/db/schema";

async function uploadFile(file: File): Promise<AiMessageAttachment> {
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

export function ChatComposer({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  onSend,
  onStop,
  isLoading,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  attachments: AiMessageAttachment[];
  onAttachmentsChange: (files: AiMessageAttachment[]) => void;
  onSend: () => void;
  onStop: () => void;
  isLoading: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    try {
      const uploaded = await Promise.all(Array.from(fileList).slice(0, 5).map(uploadFile));
      onAttachmentsChange([...attachments, ...uploaded].slice(0, 5));
    } catch {
      // parent may show toast
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const canSend = (value.trim().length > 0 || attachments.length > 0) && !isLoading && !disabled;

  return (
    <div className="border-t bg-background/95 p-4 backdrop-blur">
      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((file) => (
            <span
              key={file.path}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs"
            >
              {file.filename}
              <button
                type="button"
                onClick={() =>
                  onAttachmentsChange(attachments.filter((a) => a.path !== file.path))
                }
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative rounded-2xl border bg-card shadow-sm">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="Message Grok…"
          disabled={disabled || isLoading}
          rows={3}
          className="min-h-[88px] resize-none border-0 bg-transparent px-4 py-3 pr-36 focus-visible:ring-0"
        />
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled || isLoading}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          {isLoading ? (
            <Button type="button" size="sm" variant="outline" onClick={onStop}>
              <Square className="mr-1 h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={!canSend} onClick={onSend}>
              <Send className="mr-1 h-3.5 w-3.5" />
              Send
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        Enter to send · Shift+Enter for new line · Attach images, PDFs, or text files
      </p>
    </div>
  );
}
