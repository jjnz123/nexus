"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  PanelBottomClose,
  PanelBottomOpen,
  Play,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { NoteLanguage, UserNote } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import {
  createUserNote,
  deleteUserNote,
  updateUserNote,
} from "@/server/actions/notes";
import { updateBookmarkPreferences } from "@/server/actions/preferences";

const LANGUAGES: { value: NoteLanguage; label: string }[] = [
  { value: "plaintext", label: "Plain Text" },
  { value: "markdown", label: "Markdown" },
  { value: "shell", label: "Shell Script" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
];

type WorkspaceState = {
  openTabIds: string[];
  activeTabId: string | null;
  previewVisible: boolean;
  explorerCollapsed: boolean;
};

type DraftMap = Record<string, { title: string; content: string; language: NoteLanguage }>;

export function NotesWorkspace({
  initialNotes,
  initialWorkspace,
}: {
  initialNotes: UserNote[];
  initialWorkspace: WorkspaceState;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [openTabIds, setOpenTabIds] = useState(initialWorkspace.openTabIds);
  const [activeTabId, setActiveTabId] = useState<string | null>(
    initialWorkspace.activeTabId ?? initialNotes[0]?.id ?? null
  );
  const [previewVisible, setPreviewVisible] = useState(initialWorkspace.previewVisible);
  const [explorerCollapsed, setExplorerCollapsed] = useState(initialWorkspace.explorerCollapsed);
  const [drafts, setDrafts] = useState<DraftMap>(() =>
    Object.fromEntries(
      initialNotes.map((note) => [
        note.id,
        { title: note.title, content: note.content, language: note.language as NoteLanguage },
      ])
    )
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [isPending, startTransition] = useTransition();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workspaceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openNotes = useMemo(
    () => openTabIds.map((id) => notes.find((n) => n.id === id)).filter(Boolean) as UserNote[],
    [notes, openTabIds]
  );

  const activeDraft = activeTabId ? drafts[activeTabId] : null;

  const persistWorkspace = useCallback((next: Partial<WorkspaceState>) => {
    if (workspaceTimerRef.current) clearTimeout(workspaceTimerRef.current);
    workspaceTimerRef.current = setTimeout(() => {
      void updateBookmarkPreferences({
        notesWorkspace: {
          openTabIds: next.openTabIds ?? openTabIds,
          activeTabId: next.activeTabId ?? activeTabId,
          previewVisible: next.previewVisible ?? previewVisible,
          explorerCollapsed: next.explorerCollapsed ?? explorerCollapsed,
        },
      });
    }, 400);
  }, [activeTabId, explorerCollapsed, openTabIds, previewVisible]);

  const openNote = useCallback(
    (note: UserNote) => {
      setOpenTabIds((prev) => (prev.includes(note.id) ? prev : [...prev, note.id]));
      setActiveTabId(note.id);
      setDrafts((prev) =>
        prev[note.id]
          ? prev
          : {
              ...prev,
              [note.id]: {
                title: note.title,
                content: note.content,
                language: note.language as NoteLanguage,
              },
            }
      );
      persistWorkspace({ openTabIds: [...new Set([...openTabIds, note.id])], activeTabId: note.id });
    },
    [openTabIds, persistWorkspace]
  );

  const closeTab = (id: string) => {
    const nextTabs = openTabIds.filter((tabId) => tabId !== id);
    const nextActive =
      activeTabId === id ? nextTabs[nextTabs.length - 1] ?? null : activeTabId;
    setOpenTabIds(nextTabs);
    setActiveTabId(nextActive);
    persistWorkspace({ openTabIds: nextTabs, activeTabId: nextActive });
  };

  const scheduleSave = useCallback((id: string, patch: Partial<DraftMap[string]>) => {
    setSaveState("saving");
    setDrafts((prev) => {
      const merged = { ...prev[id], ...patch };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        startTransition(async () => {
          try {
            const saved = await updateUserNote({
              id,
              title: merged.title,
              content: merged.content,
              language: merged.language,
            });
            setNotes((current) => current.map((n) => (n.id === id ? saved : n)));
            setSaveState("saved");
          } catch (error) {
            setSaveState("idle");
            toast.error(error instanceof Error ? error.message : "Autosave failed");
          }
        });
      }, 700);
      return { ...prev, [id]: merged };
    });
  }, []);

  useEffect(() => {
    if (openTabIds.length === 0 && notes.length > 0) {
      openNote(notes[0]);
    }
  }, [notes, openNote, openTabIds.length]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (workspaceTimerRef.current) clearTimeout(workspaceTimerRef.current);
    };
  }, []);

  async function handleCreateNote() {
    startTransition(async () => {
      try {
        const note = await createUserNote({ title: "Untitled", language: "plaintext" });
        setNotes((prev) => [note, ...prev]);
        setDrafts((prev) => ({
          ...prev,
          [note.id]: { title: note.title, content: "", language: "plaintext" },
        }));
        openNote(note);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to create note");
      }
    });
  }

  async function handleDeleteNote(id: string) {
    if (!window.confirm("Delete this note?")) return;
    startTransition(async () => {
      try {
        await deleteUserNote(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        closeTab(id);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Delete failed");
      }
    });
  }

  const canPreview = activeDraft?.language === "markdown";

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] min-h-[520px] flex-col md:-m-6">
      <div className="flex items-center justify-between border-b px-4 py-3 md:px-6">
        <div className="flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Notes</h1>
            <p className="text-xs text-muted-foreground">
              Personal scratchpad · autosaved
              {saveState === "saving" ? " · saving…" : saveState === "saved" ? " · saved" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canPreview ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const next = !previewVisible;
                setPreviewVisible(next);
                persistWorkspace({ previewVisible: next });
              }}
            >
              {previewVisible ? (
                <PanelBottomClose className="mr-1 h-4 w-4" />
              ) : (
                <PanelBottomOpen className="mr-1 h-4 w-4" />
              )}
              Preview
            </Button>
          ) : null}
          <Button size="sm" onClick={() => void handleCreateNote()} disabled={isPending}>
            <FilePlus className="mr-1 h-4 w-4" />
            New note
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {!explorerCollapsed ? (
          <aside className="flex w-56 shrink-0 flex-col border-r bg-card/30">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Files
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  setExplorerCollapsed(true);
                  persistWorkspace({ explorerCollapsed: true });
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {notes.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No notes yet
                </p>
              ) : (
                notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => openNote(note)}
                    className={cn(
                      "mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-accent",
                      activeTabId === note.id && "bg-accent font-medium"
                    )}
                  >
                    <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{note.title}</span>
                  </button>
                ))
              )}
            </div>
          </aside>
        ) : (
          <div className="flex w-10 shrink-0 flex-col items-center border-r bg-card/30 py-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => {
                setExplorerCollapsed(false);
                persistWorkspace({ explorerCollapsed: false });
              }}
              title="Show file explorer"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 overflow-x-auto border-b bg-muted/20 px-2 py-1">
            {openNotes.length === 0 ? (
              <span className="px-2 py-1 text-xs text-muted-foreground">No open tabs</span>
            ) : (
              openNotes.map((note) => (
                <div
                  key={note.id}
                  className={cn(
                    "flex max-w-[200px] items-center gap-1 rounded-md border px-2 py-1 text-xs",
                    activeTabId === note.id ? "border-primary/40 bg-background" : "bg-muted/40"
                  )}
                >
                  <button
                    type="button"
                    className="truncate"
                    onClick={() => {
                      setActiveTabId(note.id);
                      persistWorkspace({ activeTabId: note.id });
                    }}
                  >
                    {drafts[note.id]?.title ?? note.title}
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 hover:bg-accent"
                    onClick={() => closeTab(note.id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {activeTabId && activeDraft ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <input
                  value={activeDraft.title}
                  onChange={(e) =>
                    scheduleSave(activeTabId, { title: e.target.value || "Untitled" })
                  }
                  className="min-w-[160px] flex-1 bg-transparent text-sm font-medium outline-none"
                />
                <Select
                  value={activeDraft.language}
                  onValueChange={(value) =>
                    scheduleSave(activeTabId, { language: value as NoteLanguage })
                  }
                >
                  <SelectTrigger className="h-8 w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canPreview ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPreviewVisible(true)}
                  >
                    <Play className="mr-1 h-4 w-4" />
                    Run
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => void handleDeleteNote(activeTabId)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <textarea
                  value={activeDraft.content}
                  onChange={(e) => scheduleSave(activeTabId, { content: e.target.value })}
                  spellCheck={false}
                  className={cn(
                    "min-h-0 flex-1 resize-none bg-background p-4 font-mono text-sm outline-none",
                    previewVisible && canPreview ? "h-1/2" : "flex-1"
                  )}
                  placeholder="Start typing…"
                />

                {previewVisible && canPreview ? (
                  <div className="flex min-h-0 flex-1 flex-col border-t bg-muted/10">
                    <div className="flex items-center gap-1 border-b px-3 py-1.5 text-xs text-muted-foreground">
                      <ChevronDown className="h-3.5 w-3.5" />
                      Markdown preview
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none min-h-0 flex-1 overflow-y-auto p-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {activeDraft.content || "*Nothing to preview yet.*"}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select or create a note to begin
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
