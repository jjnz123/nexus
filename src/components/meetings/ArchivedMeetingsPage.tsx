"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Meeting, Project } from "@/lib/db/schema";
import { deleteMeeting } from "@/server/actions/meetings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

export function ArchivedMeetingsPage({
  initialMeetings,
  projects,
}: {
  initialMeetings: MeetingRow[];
  projects: Project[];
}) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
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

  const permanentlyDelete = (id: string, meetingTitle: string) => {
    if (
      !window.confirm(
        `Permanently delete "${meetingTitle}"? This cannot be undone and removes all transcripts, summaries, and action items.`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteMeeting(id);
        setMeetings((prev) => prev.filter((row) => row.meeting.id !== id));
        toast.success(`"${meetingTitle}" deleted`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to delete meeting");
      }
    });
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
        <Link href="/meetings">
          <ArrowLeft className="h-4 w-4" />
          Back to active meetings
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Archived meetings</h1>
        <p className="text-sm text-muted-foreground">
          Archived meetings are hidden from the main list. Delete them here to remove permanently.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search archived meetings..."
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
          <Card key={meeting.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <Link href={`/meetings/${meeting.id}`} className="min-w-0 flex-1">
                <p className="font-medium">{meeting.title}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(meeting.meetingAt), "MMM d, yyyy HH:mm")}
                  {meeting.archivedAt
                    ? ` · archived ${format(new Date(meeting.archivedAt), "MMM d, yyyy")}`
                    : ""}
                  {projectKey ? ` · ${projectKey}` : ""}
                </p>
              </Link>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant(meeting.status)}>{meeting.status}</Badge>
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1.5"
                  disabled={isPending}
                  onClick={() => permanentlyDelete(meeting.id, meeting.title)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No archived meetings.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
