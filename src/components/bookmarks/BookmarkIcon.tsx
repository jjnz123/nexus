"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { LUCIDE_ICON_MAP, resolveIconDisplay } from "@/lib/bookmarks/icons";
import type { BookmarkIconType } from "@/lib/db/schema";

type BookmarkIconProps = {
  title: string;
  icon?: string | null;
  iconType?: BookmarkIconType | null;
  iconValue?: string | null;
  accentColor?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function BookmarkIcon({
  title,
  icon,
  iconType,
  iconValue,
  accentColor = "#6366f1",
  className,
  size = "md",
}: BookmarkIconProps) {
  const resolved = resolveIconDisplay({ title, icon, iconType, iconValue });
  const LucideIcon = resolved.type === "lucide" ? LUCIDE_ICON_MAP[resolved.value] : null;

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border font-semibold uppercase",
        sizeMap[size],
        className
      )}
      style={{
        borderColor: `${accentColor}55`,
        backgroundColor: `${accentColor}22`,
        color: accentColor ?? undefined,
      }}
    >
      {resolved.type === "lucide" && LucideIcon ? (
        <LucideIcon className="h-4 w-4" />
      ) : resolved.type === "emoji" ? (
        <span className="text-lg normal-case">{resolved.value}</span>
      ) : resolved.type === "image" ? (
        <Image
          src={resolved.value.startsWith("http") ? resolved.value : `/uploads/${resolved.value}`}
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 rounded object-cover"
          unoptimized
        />
      ) : (
        resolved.value.slice(0, 2)
      )}
    </div>
  );
}
