import { Skeleton } from "@/components/ui/skeleton";

export function BookmarksSkeleton({ layoutMode = "grid" }: { layoutMode?: "grid" | "list" }) {
  return (
    <div className={layoutMode === "list" ? "space-y-3" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
      {Array.from({ length: layoutMode === "list" ? 4 : 6 }).map((_, index) => (
        <div key={`bookmark-skeleton-${index}`} className="rounded-xl border border-zinc-800 p-4">
          <Skeleton className="mb-3 h-4 w-32" />
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
