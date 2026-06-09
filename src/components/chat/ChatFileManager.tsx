"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileText, FolderOpen, MessageSquare, Pencil, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  onRename,
  onDelete,
}: {
  file: AiProjectFile | AiConversationFile;
  onRename: () => void;
  onDelete: () => void;
}) {
  const isImage = file.mimeType.startsWith("image/");
  const src = `/uploads/${file.path}`;

  return (
    <div className="flex gap-3 rounded-lg border p-3">
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
        <p className="truncate font-medium">{file.displayName}</p>
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
  const [isPending, startTransition] = useTransition();
  const projectInputRef = useRef<HTMLInputElement>(null);
  const conversationInputRef = useRef<HTMLInputElement>(null);

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
    if (next) refresh();
  };

  async function uploadMany(
    files: FileList | null,
    scope: "project" | "conversation"
  ) {
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
            Project knowledge base files are shared across conversations. Conversation files apply to
            this thread only.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={projectId ? "project" : "conversation"}>
          <TabsList>
            {projectId ? (
              <TabsTrigger value="project">
                <FolderOpen className="mr-1 h-4 w-4" />
                Project
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="conversation">
              <MessageSquare className="mr-1 h-4 w-4" />
              Conversation
            </TabsTrigger>
          </TabsList>

          {projectId ? (
            <TabsContent value="project" className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Knowledge base · {projectFiles.length} file{projectFiles.length === 1 ? "" : "s"}
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
              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {projectFiles.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No project files yet
                  </p>
                ) : (
                  projectFiles.map((file) => (
                    <FileRow
                      key={file.id}
                      file={file}
                      onRename={() => {
                        const name = window.prompt("Display name", file.displayName)?.trim();
                        if (!name || name === file.displayName) return;
                        startTransition(async () => {
                          await renameAiProjectFile({ id: file.id, displayName: name });
                          refresh();
                        });
                      }}
                      onDelete={() => {
                        if (!window.confirm(`Delete "${file.displayName}"?`)) return;
                        startTransition(async () => {
                          await deleteAiProjectFile(file.id);
                          refresh();
                        });
                      }}
                    />
                  ))
                )}
              </div>
            </TabsContent>
          ) : null}

          <TabsContent value="conversation" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Conversation files · {conversationFiles.length} file
                {conversationFiles.length === 1 ? "" : "s"}
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
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {conversationFiles.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No conversation files yet
                </p>
              ) : (
                conversationFiles.map((file) => (
                  <FileRow
                    key={file.id}
                    file={file}
                    onRename={() => {
                      const name = window.prompt("Display name", file.displayName)?.trim();
                      if (!name || name === file.displayName) return;
                      startTransition(async () => {
                        await renameAiConversationFile({ id: file.id, displayName: name });
                        refresh();
                      });
                    }}
                    onDelete={() => {
                      if (!window.confirm(`Delete "${file.displayName}"?`)) return;
                      startTransition(async () => {
                        await deleteAiConversationFile(file.id);
                        refresh();
                      });
                    }}
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
