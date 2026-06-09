"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Mic, Play, Square, Upload } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import type { Meeting, MeetingActionItem, MeetingMessage, Project, Task } from "@/lib/db/schema";
import {
  askMeetingQuestion,
  attachMeetingAudio,
  convertActionItemToTask,
  reprocessMeeting,
} from "@/server/actions/meetings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MeetingDetailProps = {
  meeting: Meeting;
  projectName: string | null;
  projectKey: string | null;
  actionItems: MeetingActionItem[];
  messages: MeetingMessage[];
  projects: Project[];
};

export function MeetingDetailView({
  meeting: initialMeeting,
  projectName,
  projectKey,
  actionItems: initialActionItems,
  messages: initialMessages,
  projects,
}: MeetingDetailProps) {
  const [meeting, setMeeting] = useState(initialMeeting);
  const [actionItems, setActionItems] = useState(initialActionItems);
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "upload") fileInputRef.current?.click();
    if (mode === "record" && meeting.status === "recording") startRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (meeting.status !== "processing") return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [meeting.status, router]);

  async function uploadBlob(blob: Blob, filename: string) {
    const form = new FormData();
    form.append("file", blob, filename);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    if (!res.ok) throw new Error("Upload failed");
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
  }

  function startRecording() {
    void navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        startTransition(async () => {
          try {
            await uploadBlob(blob, `meeting-${Date.now()}.webm`);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Upload failed");
          }
        });
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    }).catch(() => toast.error("Microphone access denied"));
  }

  function stopRecording() {
    mediaRecorder?.stop();
    setMediaRecorder(null);
    setRecording(false);
  }

  function onFileSelected(file: File | null) {
    if (!file) return;
    startTransition(async () => {
      try {
        await uploadBlob(file, file.name);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      }
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

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
        <Link href="/meetings">
          <ArrowLeft className="h-4 w-4" />
          Back to meetings
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(meeting.createdAt), "MMM d, yyyy HH:mm")}
            {projectKey ? ` · ${projectName} (${projectKey})` : ""}
          </p>
        </div>
        <Badge>{meeting.status}</Badge>
      </div>

      {meeting.status === "recording" ? (
        <Card>
          <CardHeader>
            <CardTitle>Capture audio</CardTitle>
            <CardDescription>Record in the browser or upload an audio file.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {!recording ? (
              <Button className="gap-2" onClick={startRecording}>
                <Mic className="h-4 w-4" />
                Start recording
              </Button>
            ) : (
              <Button variant="destructive" className="gap-2" onClick={stopRecording}>
                <Square className="h-4 w-4" />
                Stop & process
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
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
          </CardContent>
        </Card>
      ) : null}

      {meeting.status === "processing" ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Processing… transcribing with Whisper and summarizing with Grok.
          </CardContent>
        </Card>
      ) : null}

      {meeting.status === "failed" ? (
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
            <TabsTrigger value="chat">Ask AI</TabsTrigger>
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
                      <p className="mt-1 text-xs text-muted-foreground">Assignee: {item.assigneeHint}</p>
                    ) : null}
                  </div>
                  {item.convertedTaskId ? (
                    <Badge>Converted</Badge>
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
