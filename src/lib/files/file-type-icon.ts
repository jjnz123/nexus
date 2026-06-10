import {
  File,
  FileSpreadsheet,
  FileText,
  FileType,
  ImageIcon,
  Mail,
  Presentation,
} from "lucide-react";

export type FileTypeIconComponent = typeof FileText;

export function getFileTypeIcon(
  filename: string,
  mimeType?: string | null
): FileTypeIconComponent {
  const lower = filename.toLowerCase();
  const mime = mimeType?.toLowerCase() ?? "";

  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(lower)) {
    return ImageIcon;
  }
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    /\.(xlsx?|csv)$/i.test(lower)
  ) {
    return FileSpreadsheet;
  }
  if (
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    /\.(pptx?|key)$/i.test(lower)
  ) {
    return Presentation;
  }
  if (mime.includes("pdf") || lower.endsWith(".pdf")) {
    return FileType;
  }
  if (mime.includes("message/rfc822") || lower.endsWith(".eml")) {
    return Mail;
  }
  if (
    mime.startsWith("text/") ||
    mime.includes("word") ||
    /\.(docx?|md|txt|rtf)$/i.test(lower)
  ) {
    return FileText;
  }
  return File;
}
