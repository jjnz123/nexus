/** True when the client bundle references a Server Action id the server no longer has (stale tab after deploy). */
export function isStaleServerActionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to find server action/i.test(error.message);
}

export function staleServerActionMessage(): string {
  return "The app was updated. Please refresh the page and try again.";
}
