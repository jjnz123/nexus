"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Mic, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Meeting, Project } from "@/lib/db/schema";
import { createMeeting } from "@/server/actions/meetings";
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
  projects,
}: {
  initialMeetings: MeetingRow[];
  projects: Project[];
}) {
  const [meetings] = useState(initialMeetings);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return meetings.filter(({ meeting, projectKey }) => {
      if (projectFilter !== "all" && meeting.projectId !== projectFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        meeting.title.toLowerCase().includes(q) ||
        meeting.summary?.toLowerCase().includes(q) ||
        meeting.transcript?.toLowerCase().includes(q) ||
        projectKey?.toLowerCase().includes(q) ||
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
        });
        router.push(`/meetings/${meeting.id}?mode=${mode}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to create meeting");
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New meeting</CardTitle>
          <CardDescription>Start a browser recording or upload an audio file.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="meeting-title">Title</Label>
            <Input
              id="meeting-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Weekly standup"
            />
          </div>
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Optional project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                {p.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3">
        {filtered.map(({ meeting, projectKey }) => (
          <Link key={meeting.id} href={`/meetings/${meeting.id}`}>
            <Card className="transition-colors hover:bg-accent/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{meeting.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(meeting.createdAt), "MMM d, yyyy HH:mm")}
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
                </div>
                <Badge variant={statusVariant(meeting.status)}>{meeting.status}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No meetings yet. Create one above to get started.
            </CardContent>
          </Card>
        ) : null}
      </div>
      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" />
    </div>
  );
}
