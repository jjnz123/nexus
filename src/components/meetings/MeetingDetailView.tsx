"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Archive, ArrowLeft, Loader2, Mic, Pencil, Play, Square, Trash2, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import type { Meeting, MeetingActionItem, MeetingMessage, Project, Task } from "@/lib/db/schema";
import {
  datetimeLocalToIso,
  toDatetimeLocalValue,
} from "@/lib/meetings/datetime";
import {
  archiveMeeting,
  askMeetingQuestion,
  attachMeetingAudio,
  convertActionItemToTask,
  deleteMeeting,
  getMeeting,
  reprocessMeeting,
  updateMeeting,
} from "@/server/actions/meetings";
import { MeetingProjectSelect } from "@/components/meetings/MeetingProjectSelect";
import { AudioInputSelect } from "@/components/meetings/AudioInputSelect";
import { getRecordingExtension, useRecording } from "@/components/meetings/recording-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WHISPER_MAX_BYTES } from "@/lib/uploads";
import type { RecordingSettings } from "@/lib/recording";

type MeetingDetailProps = {
  meeting: Meeting;
  projectName: string | null;
  projectKey: string | null;
  actionItems: MeetingActionItem[];
  messages: MeetingMessage[];
  projects: Project[];
  canCreateProject?: boolean;
  recordingSettings: RecordingSettings;
};

export function MeetingDetailView({
  meeting: initialMeeting,
  projectName,
  projectKey,
  actionItems: initialActionItems,
  messages: initialMessages,
  projects: initialProjects,
  canCreateProject = false,
  recordingSettings: _recordingSettings,
}: MeetingDetailProps) {
  const recordingContext = useRecording();
  const [meeting, setMeeting] = useState(initialMeeting);
  const [projects, setProjects] = useState(initialProjects);
  const [actionItems, setActionItems] = useState(initialActionItems);
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(meeting.title);
  const [editMeetingAt, setEditMeetingAt] = useState(toDatetimeLocalValue(new Date(meeting.meetingAt)));
  const [editProjectId, setEditProjectId] = useState(meeting.projectId ?? "none");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);

  const isRecordingThisMeeting =
    recordingContext.isRecording &&
    recordingContext.activeRecording?.meetingId === meeting.id;

  const isArchived = !!meeting.archivedAt;

  useEffect(() => {
    setMeeting(initialMeeting);
    setActionItems(initialActionItems);
    setMessages(initialMessages);
  }, [initialMeeting, initialActionItems, initialMessages]);

  useEffect(() => {
    if (isArchived) return;
    const mode = searchParams.get("mode");
    if (mode === "upload") fileInputRef.current?.click();
    if (mode === "record" && meeting.status === "recording") startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (meeting.status !== "processing") return;

    let cancelled = false;

    const poll = async () => {
      try {
        const detail = await getMeeting(meeting.id);
        if (cancelled) return;
        setMeeting(detail.meeting);
        setActionItems(detail.actionItems);
        setMessages(detail.messages);
      } catch {
        // ignore transient poll errors
      }
    };

    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [meeting.id, meeting.status]);

  async function uploadBlob(blob: Blob, filename: string) {
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", blob, filename);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Upload failed (${res.status})`);
      }
      const { path } = (await res.json()) as { path: string };
      await attachMeetingAudio({
        meetingId: meeting.id,
        audioPath: path,
        audioFilename: filename,
        audioMimeType: blob.type || "audio/webm",
        audioSize: blob.size,
      });
      setMeeting((m) => ({ ...m, status: "processing" }));
      toast.success("Audio uploaded — processing started");
      router.refresh();
    } finally {
      setIsUploading(false);
    }
  }

  function startRecording() {
    void recordingContext.startRecording({
      meetingId: meeting.id,
      title: meeting.title,
      projectName,
      projectKey,
      onStop: async (blob, mimeType) => {
        const ext = getRecordingExtension(mimeType);
        await uploadBlob(blob, `meeting-${Date.now()}.${ext}`);
      },
    });
  }

  function stopRecording() {
    recordingContext.stopRecording();
  }

  function onFileSelected(file: File | null) {
    if (!file) return;
    if (file.size > WHISPER_MAX_BYTES) {
      toast.warning(
        `This file is ${Math.round(file.size / 1024 / 1024)}MB. Whisper accepts at most 25MB — transcription will fail unless you compress it.`
      );
    }
    void uploadBlob(file, file.name).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    });
  }

  function sendQuestion() {
    if (!question.trim()) return;
    startTransition(async () => {
      try {
        const msg = await askMeetingQuestion({ meetingId: meeting.id, question: question.trim() });
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            meetingId: meeting.id,
            role: "user",
            content: question.trim(),
            createdAt: new Date(),
          },
          msg,
        ]);
        setQuestion("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to ask question");
      }
    });
  }

  function convertItem(item: MeetingActionItem, projectId: string) {
    startTransition(async () => {
      try {
        const task = (await convertActionItemToTask({
          actionItemId: item.id,
          projectId,
        })) as Task;
        setActionItems((prev) =>
          prev.map((a) => (a.id === item.id ? { ...a, convertedTaskId: task.id } : a))
        );
        toast.success(`Created task #${task.number}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Conversion failed");
      }
    });
  }

  function saveEdits() {
    if (!editTitle.trim()) {
      toast.error("Title is required");
      return;
    }
    startTransition(async () => {
      try {
        const updated = await updateMeeting({
          id: meeting.id,
          title: editTitle.trim(),
          projectId: editProjectId === "none" ? null : editProjectId,
          meetingAt: datetimeLocalToIso(editMeetingAt),
        });
        setMeeting(updated);
        setEditing(false);
        toast.success("Meeting updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to update meeting");
      }
    });
  }

  function archive() {
    startTransition(async () => {
      try {
        await archiveMeeting(meeting.id);
        toast.success("Meeting archived");
        router.push("/meetings");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to archive meeting");
      }
    });
  }

  function permanentlyDelete() {
    if (
      !window.confirm(
        `Permanently delete "${meeting.title}"? This cannot be undone and removes all transcripts, summaries, and action items.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteMeeting(meeting.id);
        toast.success("Meeting deleted");
        router.push("/meetings/archived");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to delete meeting");
      }
    });
  }

  const backHref = isArchived ? "/meetings/archived" : "/meetings";
  const backLabel = isArchived ? "Back to archived meetings" : "Back to meetings";

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
        <Link href={backHref}>
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      </Button>

      {isArchived ? (
        <Card className="border-muted-foreground/30 bg-muted/30">
          <CardContent className="py-3 text-sm text-muted-foreground">
            This meeting is archived. Content is read-only. Delete it from here or the archived list
            to remove permanently.
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        {editing && !isArchived ? (
          <div className="grid w-full max-w-2xl gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-meeting-at">Date & time</Label>
                <Input
                  id="edit-meeting-at"
                  type="datetime-local"
                  value={editMeetingAt}
                  onChange={(e) => setEditMeetingAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <MeetingProjectSelect
                  projects={projects}
                  value={editProjectId}
                  onChange={setEditProjectId}
                  onProjectsChange={setProjects}
                  canCreateProject={canCreateProject}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button disabled={isPending} onClick={saveEdits}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
            <p className="text-sm text-muted-foreground">
              {format(new Date(meeting.meetingAt), "MMM d, yyyy HH:mm")}
              {projectKey ? ` · ${projectName} (${projectKey})` : ""}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{meeting.status}</Badge>
          {!editing && !isArchived ? (
            <>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={isPending}
                onClick={archive}
              >
                <Archive className="h-4 w-4" />
                Archive
              </Button>
            </>
          ) : null}
          {isArchived ? (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              disabled={isPending}
              onClick={permanentlyDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete permanently
            </Button>
          ) : null}
        </div>
      </div>

      {!isArchived && meeting.status === "recording" ? (
        <Card>
          <CardHeader>
            <CardTitle>Capture audio</CardTitle>
            <CardDescription>Record in the browser or upload an audio file (max 25MB for Whisper).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AudioInputSelect id="meeting-audio-input" />
            <div className="flex flex-wrap gap-2">
            {isUploading ? (
              <div className="flex w-full items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading audio…
              </div>
            ) : null}
            {!isRecordingThisMeeting ? (
              <Button className="gap-2" onClick={startRecording} disabled={isUploading || recordingContext.isRecording}>
                <Mic className="h-4 w-4" />
                Start recording
              </Button>
            ) : (
              <Button variant="destructive" className="gap-2" onClick={stopRecording}>
                <Square className="h-4 w-4" />
                Stop & process
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2"
              disabled={isUploading || isRecordingThisMeeting || recordingContext.isRecording}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Upload file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isArchived && meeting.status === "processing" ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div>
              <p className="font-medium text-foreground">Processing your meeting</p>
              <p className="mt-1">Transcribing with Whisper and summarizing with Grok…</p>
              <p className="mt-2 text-xs">This page updates automatically when finished.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!isArchived && meeting.status === "failed" ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <p className="text-sm text-destructive">{meeting.errorMessage ?? "Processing failed"}</p>
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await reprocessMeeting(meeting.id);
                  setMeeting((m) => ({ ...m, status: "processing" }));
                })
              }
            >
              Retry processing
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {meeting.status === "ready" ? (
        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="actions">Action items</TabsTrigger>
            {!isArchived ? <TabsTrigger value="chat">Ask AI</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <Card>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none pt-6">
                <ReactMarkdown>{meeting.summary ?? "_No summary._"}</ReactMarkdown>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transcript" className="mt-4">
            <Card>
              <CardContent className="max-h-[480px] overflow-y-auto whitespace-pre-wrap pt-6 text-sm">
                {meeting.transcript}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="mt-4 space-y-3">
            {actionItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    {item.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                    {item.assigneeHint ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Assignee: {item.assigneeHint}
                      </p>
                    ) : null}
                  </div>
                  {item.convertedTaskId ? (
                    <Badge>Converted</Badge>
                  ) : isArchived ? (
                    <Badge variant="outline">Not converted</Badge>
                  ) : (
                    <Select onValueChange={(projectId) => convertItem(item, projectId)}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Create task in…" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>
            ))}
            {actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No action items extracted.</p>
            ) : null}
          </TabsContent>

          {!isArchived ? (
            <TabsContent value="chat" className="mt-4 space-y-4">
              <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border p-4">
                {messages.map((m) => (
                  <div key={m.id} className={m.role === "user" ? "text-right" : ""}>
                    <div
                      className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ask anything about this meeting.</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="What decisions were made about…?"
                  onKeyDown={(e) => e.key === "Enter" && sendQuestion()}
                />
                <Button disabled={isPending} onClick={sendQuestion}>
                  Ask
                </Button>
              </div>
            </TabsContent>
          ) : null}
        </Tabs>
      ) : null}

      {meeting.audioPath ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Play className="h-4 w-4" />
              Recording
            </CardTitle>
          </CardHeader>
          <CardContent>
            <audio controls className="w-full" src={`/uploads/${meeting.audioPath}`} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
