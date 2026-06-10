"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Eye,
  Link2,
  Mail,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  addTaskAttachment,
  addTaskEmailAttachment,
  addTaskUrlLink,
  deleteTaskAttachment,
} from "@/server/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isEmlFile, parseEmlFile } from "@/lib/tasks/eml";
import { AttachmentPreviewModal } from "./AttachmentPreviewModal";
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

function groupFileAttachments(files: TaskAttachment[]) {
  const map = new Map<string, TaskAttachment[]>();
  for (const file of files) {
    const key = file.groupId ?? file.id;
    const list = map.get(key) ?? [];
    list.push(file);
    map.set(key, list);
  }
  return Array.from(map.values()).map((versions) =>
    [...versions].sort((a, b) => b.version - a.version)
  );
}

export function TaskLinksAndFilesPanel({
  taskId,
  attachments,
  onChange,
}: {
  taskId: string;
  attachments: TaskAttachment[];
  onChange: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<TaskAttachment | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [urlTitle, setUrlTitle] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [isPending, startTransition] = useTransition();

  const urlLinks = useMemo(
    () => attachments.filter((item) => item.kind === "url"),
    [attachments]
  );
  const emails = useMemo(
    () => attachments.filter((item) => item.kind === "email"),
    [attachments]
  );
  const fileGroups = useMemo(
    () => groupFileAttachments(attachments.filter((item) => item.kind === "file")),
    [attachments]
  );

  function processFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (!files.length) return;

    startTransition(async () => {
      try {
        let fileCount = 0;
        let emailCount = 0;

        for (const file of files.slice(0, 12)) {
          if (isEmlFile(file)) {
            const uploaded = await uploadFile(file);
            const headers = await parseEmlFile(file);
            await addTaskEmailAttachment({
              taskId,
              filename: uploaded.filename,
              path: uploaded.path,
              size: uploaded.size,
              emailSubject: headers.subject,
              emailFrom: headers.from,
              emailSentAt: headers.sentAt?.toISOString() ?? null,
            });
            emailCount += 1;
          } else {
            const uploaded = await uploadFile(file);
            await addTaskAttachment({
              taskId,
              filename: uploaded.filename,
              path: uploaded.path,
              mimeType: uploaded.mimeType,
              size: uploaded.size,
            });
            fileCount += 1;
          }
        }

        await onChange();
        if (fileCount && emailCount) {
          toast.success(`Uploaded ${fileCount} file(s) and ${emailCount} email(s)`);
        } else if (emailCount) {
          toast.success(emailCount === 1 ? "Email attached" : `${emailCount} emails attached`);
        } else {
          toast.success(fileCount === 1 ? "File uploaded" : `${fileCount} files uploaded`);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function addUrlLink() {
    if (!urlTitle.trim() || !urlValue.trim()) return;
    startTransition(async () => {
      try {
        await addTaskUrlLink({ taskId, title: urlTitle.trim(), url: urlValue.trim() });
        setUrlTitle("");
        setUrlValue("");
        await onChange();
        toast.success("Link added");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to add link");
      }
    });
  }

  function openPreview(attachment: TaskAttachment) {
    setPreview(attachment);
    setPreviewOpen(true);
  }

  function removeAttachment(attachmentId: string) {
    startTransition(async () => {
      try {
        await deleteTaskAttachment(attachmentId);
        if (preview?.id === attachmentId) {
          setPreview(null);
          setPreviewOpen(false);
        }
        await onChange();
        toast.success("Removed");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to remove item");
      }
    });
  }

  return (
    <div
      className={cn(
        "space-y-4 rounded-xl border border-dashed p-4 transition-colors",
        isDragging && "border-primary bg-primary/5"
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (event.dataTransfer.files?.length) {
          processFiles(event.dataTransfer.files);
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-medium">Links & files</h4>
          <p className="text-xs text-muted-foreground">
            Drag files or .eml emails here, or use the buttons below.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="mr-1 h-4 w-4" />
            Upload files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => event.target.files && processFiles(event.target.files)}
          />
        </div>
      </div>

      {isDragging ? (
        <div className="flex items-center justify-center rounded-lg border border-primary/40 bg-primary/5 px-4 py-8 text-sm text-primary">
          <Upload className="mr-2 h-4 w-4" />
          Drop files or emails to attach
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border bg-card/40 p-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Add URL link</Label>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            value={urlTitle}
            onChange={(event) => setUrlTitle(event.target.value)}
            placeholder="Title (e.g. SharePoint spec)"
          />
          <Input
            value={urlValue}
            onChange={(event) => setUrlValue(event.target.value)}
            placeholder="https://..."
          />
          <Button type="button" variant="secondary" disabled={isPending} onClick={addUrlLink}>
            <Link2 className="mr-1 h-4 w-4" />
            Add link
          </Button>
        </div>
      </div>

      {urlLinks.length ? (
        <section className="space-y-2">
          <h5 className="text-sm font-medium">External links</h5>
          <ul className="space-y-2">
            {urlLinks.map((link) => (
              <li
                key={link.id}
                className="flex items-start gap-2 rounded-md border bg-background px-3 py-2"
              >
                <Badge variant="outline" className="mt-0.5 shrink-0">
                  Link
                </Badge>
                <div className="min-w-0 flex-1">
                  <a
                    href={link.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    {link.displayTitle ?? link.filename}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <p className="truncate text-xs text-muted-foreground">{link.url}</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="shrink-0 text-destructive"
                  disabled={isPending}
                  onClick={() => removeAttachment(link.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h5 className="text-sm font-medium">Attachments</h5>
        {fileGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No file attachments yet.</p>
        ) : (
          <div className="space-y-2">
            {fileGroups.map((versions) => {
              const current = versions.find((item) => item.isCurrent) ?? versions[0];
              const groupKey = current.groupId ?? current.id;
              const expanded = expandedGroups[groupKey];
              const hasHistory = versions.length > 1;

              return (
                <div key={groupKey} className="rounded-md border bg-background p-2">
                  <div className="flex items-start gap-2">
                    {hasHistory ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="mt-1 h-7 w-7 shrink-0"
                        onClick={() =>
                          setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
                        }
                      >
                        {expanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <span className="mt-1 inline-flex h-7 w-7 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{current.filename}</p>
                        <Badge variant="secondary" className="h-5 text-[10px]">
                          v{current.version}
                        </Badge>
                        {hasHistory ? (
                          <span className="text-[10px] text-muted-foreground">
                            {versions.length} versions
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {(current.size / 1024).toFixed(1)} KB ·{" "}
                        {format(new Date(current.createdAt), "MMM d, yyyy")} ·{" "}
                        {current.uploadedByName ?? "Unknown"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => openPreview(current)}
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        Preview
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        disabled={isPending}
                        onClick={() => removeAttachment(current.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {expanded && hasHistory ? (
                    <ul className="mt-2 space-y-1 border-t pt-2 pl-9">
                      {versions.map((version) => (
                        <li
                          key={version.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-medium">v{version.version}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {format(new Date(version.createdAt), "MMM d, h:mm a")} ·{" "}
                              {version.uploadedByName ?? "Unknown"}
                            </span>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            {version.path ? (
                              <Button asChild size="sm" variant="outline" className="h-7 px-2">
                                <a href={`/uploads/${version.path}`} download={version.filename}>
                                  Download
                                </a>
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-destructive"
                              disabled={isPending}
                              onClick={() => removeAttachment(version.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {emails.length ? (
        <section className="space-y-2">
          <h5 className="text-sm font-medium">Emails</h5>
          <ul className="space-y-2">
            {emails.map((email) => (
              <li
                key={email.id}
                className="flex items-start gap-2 rounded-md border bg-background px-3 py-2"
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{email.emailSubject ?? email.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {email.emailFrom ? `From ${email.emailFrom}` : "Unknown sender"}
                    {email.emailSentAt
                      ? ` · ${format(new Date(email.emailSentAt), "MMM d, yyyy h:mm a")}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {email.path ? (
                    <Button asChild size="sm" variant="outline" className="h-7">
                      <a href={`/uploads/${email.path}`} download={email.filename}>
                        Download
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    disabled={isPending}
                    onClick={() => removeAttachment(email.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AttachmentPreviewModal
        attachment={preview}
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreview(null);
        }}
      />
    </div>
  );
}
