"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Archive, Mic, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Meeting, Project } from "@/lib/db/schema";
import { datetimeLocalToIso, nowDatetimeLocal } from "@/lib/meetings/datetime";
import { archiveMeeting, createMeeting } from "@/server/actions/meetings";
import { MeetingProjectSelect } from "@/components/meetings/MeetingProjectSelect";
import { AudioInputSelect } from "@/components/meetings/AudioInputSelect";
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

type MeetingRow = {
  meeting: Meeting;
  projectName: string | null;
  projectKey: string | null;
};

function statusVariant(status: Meeting["status"]) {
  if (status === "ready") return "default" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "processing") return "secondary" as const;
  return "outline" as const;
}

export function MeetingsPage({
  initialMeetings,
  projects: initialProjects,
  canCreateProject = false,
}: {
  initialMeetings: MeetingRow[];
  projects: Project[];
  canCreateProject?: boolean;
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [projects, setProjects] = useState(initialProjects);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [meetingAt, setMeetingAt] = useState(nowDatetimeLocal);
  const [projectId, setProjectId] = useState<string>("none");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const filtered = useMemo(() => {
    return meetings.filter(({ meeting, projectKey, projectName }) => {
      if (projectFilter !== "all" && meeting.projectId !== projectFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        meeting.title.toLowerCase().includes(q) ||
        meeting.summary?.toLowerCase().includes(q) ||
        meeting.transcript?.toLowerCase().includes(q) ||
        projectKey?.toLowerCase().includes(q) ||
        projectName?.toLowerCase().includes(q) ||
        (meeting.labels ?? []).some((l) => l.toLowerCase().includes(q))
      );
    });
  }, [meetings, projectFilter, search]);

  const createAndOpen = (mode: "record" | "upload") => {
    if (!title.trim()) {
      toast.error("Enter a meeting title");
      return;
    }
    startTransition(async () => {
      try {
        const meeting = await createMeeting({
          title: title.trim(),
          projectId: projectId === "none" ? null : projectId,
          meetingAt: datetimeLocalToIso(meetingAt),
        });
        router.push(`/meetings/${meeting.id}?mode=${mode}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create meeting");
      }
    });
  };

  const archive = (id: string, meetingTitle: string) => {
    startTransition(async () => {
      try {
        await archiveMeeting(id);
        setMeetings((prev) => prev.filter((row) => row.meeting.id !== id));
        toast.success(`"${meetingTitle}" archived`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to archive meeting");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meeting Assistant</h1>
          <p className="text-sm text-muted-foreground">
            Record or upload meetings, transcribe with Whisper, summarize with Grok.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/meetings/archived">Archived meetings</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New meeting</CardTitle>
          <CardDescription>
            Set the title, date, and project, then record or upload audio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 md:col-span-2 lg:col-span-1">
              <Label htmlFor="meeting-title">Title</Label>
              <Input
                id="meeting-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Weekly standup"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-at">Date & time</Label>
              <Input
                id="meeting-at"
                type="datetime-local"
                value={meetingAt}
                onChange={(e) => setMeetingAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Project</Label>
              <MeetingProjectSelect
                projects={projects}
                value={projectId}
                onChange={setProjectId}
                onProjectsChange={setProjects}
                canCreateProject={canCreateProject}
              />
            </div>
            <AudioInputSelect id="new-meeting-audio-input" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="gap-2" disabled={isPending} onClick={() => createAndOpen("record")}>
              <Mic className="h-4 w-4" />
              Record
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={isPending}
              onClick={() => createAndOpen("upload")}
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search meetings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} ({p.key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {filtered.map(({ meeting, projectKey }) => (
          <Card key={meeting.id} className="transition-colors hover:bg-accent/40">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <Link href={`/meetings/${meeting.id}`} className="min-w-0 flex-1">
                <p className="font-medium">{meeting.title}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(meeting.meetingAt), "MMM d, yyyy HH:mm")}
                  {projectKey ? ` · ${projectKey}` : ""}
                </p>
                {(meeting.labels ?? []).length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(meeting.labels ?? []).map((label) => (
                      <Badge key={label} variant="outline" className="text-[10px]">
                        {label}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </Link>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(meeting.status)}>{meeting.status}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Archive meeting"
                  disabled={isPending}
                  onClick={() => archive(meeting.id, meeting.title)}
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No active meetings. Create one above or check archived meetings.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
