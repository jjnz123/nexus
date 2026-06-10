"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import mammoth from "mammoth";
import { read, utils } from "xlsx";
import { Download, ExternalLink, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TaskAttachment } from "./types";

function fileUrl(attachment: TaskAttachment) {
  return attachment.path ? `/uploads/${attachment.path}` : null;
}

function extension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

function isImage(mimeType: string, filename: string) {
  return mimeType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);
}

function isPdf(mimeType: string, filename: string) {
  return mimeType === "application/pdf" || filename.endsWith(".pdf");
}

function isText(mimeType: string, filename: string) {
  return (
    mimeType.startsWith("text/") ||
    /\.(txt|md|json|csv|log|xml|yaml|yml)$/i.test(filename)
  );
}

function isDocx(mimeType: string, filename: string) {
  return (
    mimeType.includes("wordprocessingml") ||
    mimeType === "application/msword" ||
    /\.docx?$/i.test(filename)
  );
}

function isXlsx(mimeType: string, filename: string) {
  return (
    mimeType.includes("spreadsheetml") ||
    mimeType === "application/vnd.ms-excel" ||
    /\.xlsx?$/i.test(filename)
  );
}

function isPptx(mimeType: string, filename: string) {
  return (
    mimeType.includes("presentationml") ||
    mimeType === "application/vnd.ms-powerpoint" ||
    /\.pptx?$/i.test(filename)
  );
}

export function AttachmentPreviewModal({
  attachment,
  open,
  onOpenChange,
}: {
  attachment: TaskAttachment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = attachment ? fileUrl(attachment) : null;
  const ext = attachment ? extension(attachment.filename) : "";

  const previewKind = useMemo(() => {
    if (!attachment) return "unsupported";
    if (isImage(attachment.mimeType, attachment.filename)) return "image";
    if (isPdf(attachment.mimeType, attachment.filename)) return "pdf";
    if (isText(attachment.mimeType, attachment.filename)) return "text";
    if (isDocx(attachment.mimeType, attachment.filename)) return "docx";
    if (isXlsx(attachment.mimeType, attachment.filename)) return "xlsx";
    if (isPptx(attachment.mimeType, attachment.filename)) return "pptx";
    return "unsupported";
  }, [attachment]);

  useEffect(() => {
    if (!open || !attachment || !url) return;

    setHtml(null);
    setText(null);
    setError(null);

    if (previewKind === "docx" || previewKind === "xlsx" || previewKind === "text") {
      setLoading(true);
      void fetch(url)
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to load file");
          const buffer = await response.arrayBuffer();

          if (previewKind === "docx") {
            const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
            setHtml(result.value);
            return;
          }

          if (previewKind === "xlsx") {
            const workbook = read(buffer, { type: "array" });
            const firstSheet = workbook.SheetNames[0];
            if (!firstSheet) {
              setError("Spreadsheet has no sheets.");
              return;
            }
            const sheetHtml = utils.sheet_to_html(workbook.Sheets[firstSheet]);
            setHtml(sheetHtml);
            return;
          }

          const decoded = new TextDecoder().decode(buffer);
          setText(decoded.slice(0, 200_000));
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Preview failed");
        })
        .finally(() => setLoading(false));
    }
  }, [attachment, open, previewKind, url]);

  if (!attachment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12">
          <DialogTitle className="truncate text-left text-base">
            {attachment.filename}
            {attachment.version > 1 ? ` (v${attachment.version})` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading preview…
            </div>
          ) : error ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              {url ? (
                <Button asChild variant="outline">
                  <a href={url} download={attachment.filename}>
                    <Download className="mr-2 h-4 w-4" />
                    Download file
                  </a>
                </Button>
              ) : null}
            </div>
          ) : previewKind === "image" && url ? (
            <Image
              src={url}
              alt={attachment.filename}
              width={960}
              height={720}
              className="mx-auto max-h-[70vh] w-auto rounded object-contain"
              unoptimized
            />
          ) : previewKind === "pdf" && url ? (
            <iframe
              src={url}
              title={attachment.filename}
              className="h-[70vh] w-full rounded border"
            />
          ) : previewKind === "text" && text ? (
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-4 text-sm">
              {text}
            </pre>
          ) : html ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none overflow-auto rounded-md border bg-background p-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : previewKind === "pptx" ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Slide preview is not available in the browser for PowerPoint files ({ext.toUpperCase()}).
              </p>
              {url ? (
                <Button asChild variant="outline">
                  <a href={url} download={attachment.filename}>
                    <Download className="mr-2 h-4 w-4" />
                    Download to open in PowerPoint
                  </a>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Preview is not available for this file type.
              </p>
              {url ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button asChild variant="outline">
                    <a href={url} download={attachment.filename}>
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </a>
                  </Button>
                  <Button asChild variant="ghost">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open in new tab
                    </a>
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3">
          {url ? (
            <Button asChild variant="outline" size="sm">
              <a href={url} download={attachment.filename}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          ) : null}
          <Button size="sm" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
