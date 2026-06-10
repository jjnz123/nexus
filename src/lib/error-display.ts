/**
 * When BETA_MODE or SHOW_DETAILED_ERRORS is enabled, surface full error messages
 * (and stack traces where available) instead of generic copy.
 *
 * Server: BETA_MODE=true or SHOW_DETAILED_ERRORS=true
 * Client: NEXT_PUBLIC_BETA_MODE=true or NEXT_PUBLIC_SHOW_DETAILED_ERRORS=true
 */

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

function readTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function showDetailedErrorsOnServer(): boolean {
  return (
    readTruthy(process.env.BETA_MODE) || readTruthy(process.env.SHOW_DETAILED_ERRORS)
  );
}

export function showDetailedErrorsOnClient(): boolean {
  if (typeof window === "undefined") return showDetailedErrorsOnServer();
  return (
    readTruthy(process.env.NEXT_PUBLIC_BETA_MODE) ||
    readTruthy(process.env.NEXT_PUBLIC_SHOW_DETAILED_ERRORS)
  );
}

export function formatErrorMessage(error: unknown, detailed = showDetailedErrorsOnClient()): string {
  if (!detailed) return GENERIC_MESSAGE;
  if (error instanceof Error) {
    return error.stack?.trim() || error.message || GENERIC_MESSAGE;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return GENERIC_MESSAGE;
  }
}

export function formatErrorSummary(error: unknown, detailed = showDetailedErrorsOnClient()): string {
  if (!detailed) return GENERIC_MESSAGE;
  if (error instanceof Error) return error.message || GENERIC_MESSAGE;
  if (typeof error === "string") return error;
  return GENERIC_MESSAGE;
}
