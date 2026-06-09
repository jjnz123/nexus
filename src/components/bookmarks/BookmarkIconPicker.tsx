"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ACCENT_COLORS,
  EMOJI_PRESETS,
  LUCIDE_ICON_MAP,
  LUCIDE_ICON_NAMES,
} from "@/lib/bookmarks/icons";
import type { BookmarkIconType } from "@/lib/db/schema";

type IconPickerValue = {
  iconType: BookmarkIconType;
  iconValue: string;
  accentColor: string;
};

type BookmarkIconPickerProps = {
  value: IconPickerValue;
  onChange: (value: IconPickerValue) => void;
  onUploadImage?: (file: File) => Promise<string>;
};

export function BookmarkIconPicker({ value, onChange, onUploadImage }: BookmarkIconPickerProps) {
  const [lucideQuery, setLucideQuery] = useState("");
  const filteredIcons = useMemo(() => {
    const q = lucideQuery.trim().toLowerCase();
    if (!q) return LUCIDE_ICON_NAMES;
    return LUCIDE_ICON_NAMES.filter((name) => name.toLowerCase().includes(q));
  }, [lucideQuery]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Accent colour</Label>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={cn(
                "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                value.accentColor === color ? "border-white" : "border-transparent"
              )}
              style={{ backgroundColor: color }}
              onClick={() => onChange({ ...value, accentColor: color })}
              aria-label={`Accent ${color}`}
            />
          ))}
        </div>
      </div>

      <Tabs
        value={value.iconType}
        onValueChange={(next) =>
          onChange({
            ...value,
            iconType: next as BookmarkIconType,
            iconValue: next === "text" ? value.iconValue.slice(0, 2) : value.iconValue,
          })
        }
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="lucide">Lucide</TabsTrigger>
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="image">Image</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
        </TabsList>

        <TabsContent value="lucide" className="space-y-2">
          <Input
            placeholder="Search icons..."
            value={lucideQuery}
            onChange={(e) => setLucideQuery(e.target.value)}
          />
          <div className="grid max-h-40 grid-cols-6 gap-2 overflow-y-auto rounded-md border p-2">
            {filteredIcons.map((name) => {
              const Icon = LUCIDE_ICON_MAP[name];
              return (
                <button
                  key={name}
                  type="button"
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent",
                    value.iconValue === name && value.iconType === "lucide" && "border-primary bg-primary/10"
                  )}
                  onClick={() => onChange({ ...value, iconType: "lucide", iconValue: name })}
                  title={name}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="emoji" className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {EMOJI_PRESETS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md border text-xl hover:bg-accent",
                  value.iconValue === emoji && value.iconType === "emoji" && "border-primary bg-primary/10"
                )}
                onClick={() => onChange({ ...value, iconType: "emoji", iconValue: emoji })}
              >
                {emoji}
              </button>
            ))}
          </div>
          <Input
            maxLength={4}
            placeholder="Custom emoji"
            value={value.iconType === "emoji" ? value.iconValue : ""}
            onChange={(e) => onChange({ ...value, iconType: "emoji", iconValue: e.target.value })}
          />
        </TabsContent>

        <TabsContent value="image" className="space-y-2">
          <Input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !onUploadImage) return;
              const path = await onUploadImage(file);
              onChange({ ...value, iconType: "image", iconValue: path });
            }}
          />
          {value.iconType === "image" && value.iconValue ? (
            <p className="text-xs text-muted-foreground">Uploaded: {value.iconValue}</p>
          ) : null}
        </TabsContent>

        <TabsContent value="text">
          <Input
            maxLength={2}
            placeholder="AB"
            value={value.iconType === "text" ? value.iconValue : ""}
            onChange={(e) =>
              onChange({ ...value, iconType: "text", iconValue: e.target.value.toUpperCase() })
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
