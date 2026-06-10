import { toast } from "sonner";
import { formatErrorMessage } from "@/lib/error-display";

export function toastError(error: unknown, fallback = "Something went wrong") {
  const message = formatErrorMessage(error);
  toast.error(message === "Something went wrong. Please try again." ? fallback : message);
}
