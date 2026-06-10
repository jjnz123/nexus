"use client";

import { useState } from "react";
import { ChevronDown, Filter } from "lucide-react";
import type { RagSearchScope } from "@/lib/db/schema";
import {
  DEFAULT_RAG_SEARCH_SCOPES,
  type RagSearchFilters,
} from "@/lib/rag/types";
import { hasActiveRagFilters } from "@/lib/rag/chat-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SCOPE_LABELS: Record<RagSearchScope, string> = {
  files: "Files",
  notes: "Notes",
  meetings: "Meetings",
  tasks: "Tasks",
};

const NOTE_LANGUAGES = [
  { value: "markdown", label: "Markdown" },
  { value: "plaintext", label: "Plain text" },
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "shell", label: "Shell" },
];

export function ChatRagControls({
  scopes,
  filters,
  kanbanProjects,
  lockedProjectId = null,
  lockedProjectName,
  generalOnly = false,
  onScopesChange,
  onFiltersChange,
}: {
  scopes: RagSearchScope[];
  filters: RagSearchFilters;
  kanbanProjects: Array<{ id: string; name: string }>;
  lockedProjectId?: string | null;
  lockedProjectName?: string | null;
  generalOnly?: boolean;
  onScopesChange: (scopes: RagSearchScope[]) => void;
  onFiltersChange: (filters: RagSearchFilters) => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersActive = hasActiveRagFilters(filters);

  function toggle(scope: RagSearchScope) {
    if (scopes.includes(scope)) {
      const next = scopes.filter((item) => item !== scope);
      onScopesChange(next.length ? next : [...DEFAULT_RAG_SEARCH_SCOPES]);
      return;
    }
    onScopesChange([...scopes, scope]);
  }

  function updateFilter<K extends keyof RagSearchFilters>(key: K, value: RagSearchFilters[K]) {
    onFiltersChange({ ...filters, [key]: value });
  }

  function clearFilters() {
    onFiltersChange({
      kanbanProjectId: null,
      meetingDateFrom: null,
      meetingDateTo: null,
      meetingLabels: [],
      noteLanguage: null,
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">Knowledge search</span>
        {(Object.keys(SCOPE_LABELS) as RagSearchScope[]).map((scope) => {
          const active = scopes.includes(scope);
          const disabled = generalOnly && scope !== "files";
          return (
            <button
              key={scope}
              type="button"
              disabled={disabled}
              onClick={() => toggle(scope)}
              className="focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Badge
                variant={active ? "default" : "outline"}
                className={cn("cursor-pointer text-xs", !active && "opacity-60")}
              >
                {SCOPE_LABELS[scope]}
              </Badge>
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          {lockedProjectId || generalOnly ? (
            <Badge variant="secondary" className="text-[10px]">
              {generalOnly
                ? "General — conversation files only"
                : `Project: ${lockedProjectName ?? "This project"}`}
            </Badge>
          ) : null}
          {filtersActive ? <Badge variant="secondary">Filters on</Badge> : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            <ChevronDown className={cn("h-3.5 w-3.5 transition", filtersOpen && "rotate-180")} />
          </Button>
        </div>
      </div>

      {filtersOpen ? (
        <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4">
          {kanbanProjects.length && !lockedProjectId ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Kanban project</Label>
              <Select
                value={filters.kanbanProjectId ?? "all"}
                onValueChange={(value) =>
                  updateFilter("kanbanProjectId", value === "all" ? null : value)
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {kanbanProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-xs">Meeting from</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.meetingDateFrom?.slice(0, 10) ?? ""}
              onChange={(event) =>
                updateFilter(
                  "meetingDateFrom",
                  event.target.value ? `${event.target.value}T00:00:00.000Z` : null
                )
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Meeting to</Label>
            <Input
              type="date"
              className="h-8 text-xs"
              value={filters.meetingDateTo?.slice(0, 10) ?? ""}
              onChange={(event) =>
                updateFilter(
                  "meetingDateTo",
                  event.target.value ? `${event.target.value}T23:59:59.999Z` : null
                )
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Note language</Label>
            <Select
              value={filters.noteLanguage ?? "all"}
              onValueChange={(value) =>
                updateFilter("noteLanguage", value === "all" ? null : value)
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Any language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any language</SelectItem>
                {NOTE_LANGUAGES.map((language) => (
                  <SelectItem key={language.value} value={language.value}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Meeting label</Label>
            <Input
              className="h-8 text-xs"
              placeholder="e.g. standup"
              value={filters.meetingLabels?.[0] ?? ""}
              onChange={(event) =>
                updateFilter(
                  "meetingLabels",
                  event.target.value.trim() ? [event.target.value.trim()] : []
                )
              }
            />
          </div>

          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
