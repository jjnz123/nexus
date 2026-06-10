"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateColorTheme } from "@/server/actions/preferences";
import type { ColorTheme } from "@/lib/theme";
import { applyColorTheme } from "@/lib/theme";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppearanceSettings({ initialTheme }: { initialTheme: ColorTheme }) {
  const [theme, setTheme] = useState<ColorTheme>(initialTheme);
  const [isPending, startTransition] = useTransition();

  function onThemeChange(value: ColorTheme) {
    const previous = theme;
    setTheme(value);
    applyColorTheme(value);

    startTransition(async () => {
      try {
        await updateColorTheme(value);
        toast.success(value === "light" ? "Light theme enabled" : "Dark theme enabled");
      } catch (error) {
        setTheme(previous);
        applyColorTheme(previous);
        toast.error(error instanceof Error ? error.message : "Unable to update theme");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how Nexus looks on your devices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="color-theme">Theme</Label>
        <Select
          value={theme}
          onValueChange={(value) => onThemeChange(value as ColorTheme)}
          disabled={isPending}
        >
          <SelectTrigger id="color-theme" className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Saved to your profile and applied automatically on your next visit.
        </p>
      </CardContent>
    </Card>
  );
}
