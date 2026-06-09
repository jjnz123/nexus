"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileText, FolderOpen, ImageIcon, MessageSquare, Pencil, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AiConversationFile, AiProjectFile } from "@/lib/db/schema";
import {
  addAiConversationFile,
  addAiProjectFile,
  deleteAiConversationFile,
  deleteAiProjectFile,
  getAiConversationFiles,
  getAiProjectFiles,
  renameAiConversationFile,
  renameAiProjectFile,
} from "@/server/actions/ai-files";

async function uploadRawFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!response.ok) throw new Error("Upload failed");
  return (await response.json()) as { path: string };
}

function FileRow({
  file,
  scope,
  onRename,
  onDelete,
}: {
  file: AiProjectFile | AiConversationFile;
  scope: "project" | "conversation";
  onRename: () => void;
  onDelete: () => void;
}) {
  const isImage = file.mimeType.startsWith("image/");
  const src = `/uploads/${file.path}`;

  return (
    <div className="flex gap-3 rounded-lg border p-3 transition hover:bg-muted/40">
      <div className="shrink-0">
        {isImage ? (
          <Image
            src={src}
            alt={file.displayName}
            width={64}
            height={64}
            className="h-16 w-16 rounded-md object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{file.displayName}</p>
          <Badge variant={scope === "project" ? "default" : "secondary"} className="text-[10px]">
            {scope === "project" ? "Project-wide" : "This conversation"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {file.mimeType} · {(file.size / 1024).toFixed(1)} KB
        </p>
        <p className="text-[10px] text-muted-foreground">
          {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
        </p>
        {file.textPreview ? (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{file.textPreview}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <Button size="sm" variant="ghost" className="h-8 px-2" asChild>
          <a href={src} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        </Button>
        <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onRename}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function filterFiles<T extends AiProjectFile | AiConversationFile>(files: T[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return files;
  return files.filter(
    (file) =>
      file.displayName.toLowerCase().includes(q) ||
      file.mimeType.toLowerCase().includes(q) ||
      (file.textPreview?.toLowerCase().includes(q) ?? false)
  );
}

function groupFiles<T extends AiProjectFile | AiConversationFile>(files: T[]) {
  const images = files.filter((f) => f.mimeType.startsWith("image/"));
  const documents = files.filter((f) => !f.mimeType.startsWith("image/"));
  return { images, documents };
}

function FileList<T extends AiProjectFile | AiConversationFile>({
  files,
  scope,
  onRename,
  onDelete,
}: {
  files: T[];
  scope: "project" | "conversation";
  onRename: (file: T) => void;
  onDelete: (file: T) => void;
}) {
  const { images, documents } = groupFiles(files);

  if (files.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No files match your search
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {images.length > 0 ? (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            Images ({images.length})
          </h4>
          {images.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              scope={scope}
              onRename={() => onRename(file)}
              onDelete={() => onDelete(file)}
            />
          ))}
        </section>
      ) : null}
      {documents.length > 0 ? (
        <section className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            Documents ({documents.length})
          </h4>
          {documents.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              scope={scope}
              onRename={() => onRename(file)}
              onDelete={() => onDelete(file)}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function DropZone({
  disabled,
  onFiles,
  children,
}: {
  disabled?: boolean;
  onFiles: (files: FileList) => void;
  children: React.ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`rounded-xl border border-dashed p-1 transition ${
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
    >
      {children}
    </div>
  );
}

export function ChatFileManager({
  open,
  onOpenChange,
  projectId,
  conversationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  conversationId: string | null;
}) {
  const [projectFiles, setProjectFiles] = useState<AiProjectFile[]>([]);
  const [conversationFiles, setConversationFiles] = useState<AiConversationFile[]>([]);
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const projectInputRef = useRef<HTMLInputElement>(null);
  const conversationInputRef = useRef<HTMLInputElement>(null);

  const filteredProjectFiles = useMemo(
    () => filterFiles(projectFiles, search),
    [projectFiles, search]
  );
  const filteredConversationFiles = useMemo(
    () => filterFiles(conversationFiles, search),
    [conversationFiles, search]
  );

  const refresh = () => {
    startTransition(async () => {
      try {
        const [project, conversation] = await Promise.all([
          projectId ? getAiProjectFiles(projectId) : Promise.resolve([]),
          conversationId ? getAiConversationFiles(conversationId) : Promise.resolve([]),
        ]);
        setProjectFiles(project);
        setConversationFiles(conversation);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load files");
      }
    });
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (next) {
      setSearch("");
      refresh();
    }
  };

  async function uploadMany(files: FileList | null, scope: "project" | "conversation") {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 10);

    try {
      for (const file of list) {
        const uploaded = await uploadRawFile(file);
        if (scope === "project" && projectId) {
          await addAiProjectFile({
            projectId,
            path: uploaded.path,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          });
        } else if (scope === "conversation" && conversationId) {
          await addAiConversationFile({
            conversationId,
            path: uploaded.path,
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          });
        }
      }
      toast.success(`Uploaded ${list.length} file${list.length === 1 ? "" : "s"}`);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>File manager</DialogTitle>
          <DialogDescription>
            Files attached to a project are shared across every conversation in that project.
            Conversation files apply to the active thread only. Uploaded text is indexed for AI
            context.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="pl-9"
          />
        </div>

        <Tabs defaultValue={projectId ? "project" : "conversation"}>
          <TabsList>
            {projectId ? (
              <TabsTrigger value="project" className="gap-1">
                <FolderOpen className="h-4 w-4" />
                Project files
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="conversation" className="gap-1">
              <MessageSquare className="h-4 w-4" />
              Conversation files
            </TabsTrigger>
          </TabsList>

          {projectId ? (
            <TabsContent value="project" className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Shared knowledge base · {projectFiles.length} file
                  {projectFiles.length === 1 ? "" : "s"} · visible in all project conversations
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => projectInputRef.current?.click()}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  Upload
                </Button>
                <input
                  ref={projectInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*,.pdf,.txt,.md,.csv,.json"
                  onChange={(e) => void uploadMany(e.target.files, "project")}
                />
              </div>
              <DropZone disabled={isPending} onFiles={(files) => void uploadMany(files, "project")}>
                <div className="max-h-[50vh] space-y-2 overflow-y-auto p-2">
                  {projectFiles.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Drop files here or click Upload · PDF, text, images, CSV, JSON
                    </p>
                  ) : (
                    <FileList
                      files={filteredProjectFiles}
                      scope="project"
                      onRename={(file) => {
                        const name = window.prompt("Display name", file.displayName)?.trim();
                        if (!name || name === file.displayName) return;
                        startTransition(async () => {
                          await renameAiProjectFile({ id: file.id, displayName: name });
                          refresh();
                        });
                      }}
                      onDelete={(file) => {
                        if (!window.confirm(`Delete "${file.displayName}"?`)) return;
                        startTransition(async () => {
                          await deleteAiProjectFile(file.id);
                          refresh();
                        });
                      }}
                    />
                  )}
                </div>
              </DropZone>
            </TabsContent>
          ) : null}

          <TabsContent value="conversation" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Thread-only files · {conversationFiles.length} file
                {conversationFiles.length === 1 ? "" : "s"} · not shared with other conversations
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!conversationId || isPending}
                onClick={() => conversationInputRef.current?.click()}
              >
                <Upload className="mr-1 h-4 w-4" />
                Upload
              </Button>
              <input
                ref={conversationInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,.pdf,.txt,.md,.csv,.json"
                onChange={(e) => void uploadMany(e.target.files, "conversation")}
              />
            </div>
            <DropZone
              disabled={!conversationId || isPending}
              onFiles={(files) => void uploadMany(files, "conversation")}
            >
              <div className="max-h-[50vh] space-y-2 overflow-y-auto p-2">
                {conversationFiles.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Drop files here or click Upload · scoped to this conversation
                  </p>
                ) : (
                  <FileList
                    files={filteredConversationFiles}
                    scope="conversation"
                    onRename={(file) => {
                      const name = window.prompt("Display name", file.displayName)?.trim();
                      if (!name || name === file.displayName) return;
                      startTransition(async () => {
                        await renameAiConversationFile({ id: file.id, displayName: name });
                        refresh();
                      });
                    }}
                    onDelete={(file) => {
                      if (!window.confirm(`Delete "${file.displayName}"?`)) return;
                      startTransition(async () => {
                        await deleteAiConversationFile(file.id);
                        refresh();
                      });
                    }}
                  />
                )}
              </div>
            </DropZone>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
