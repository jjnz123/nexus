"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatErrorMessage, showDetailedErrorsOnClient } from "@/lib/error-display";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const detailed = showDetailedErrorsOnClient();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="max-w-2xl space-y-2">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground">
          {detailed
            ? "Detailed error information is shown below because beta debugging is enabled."
            : "An unexpected error occurred while loading this page."}
        </p>
      </div>
      {detailed ? (
        <pre className="max-h-64 w-full max-w-2xl overflow-auto rounded-lg border bg-muted/40 p-4 text-left text-xs whitespace-pre-wrap">
          {formatErrorMessage(error, true)}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
      ) : error.digest ? (
        <p className="text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
    </div>
  );
}
