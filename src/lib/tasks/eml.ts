export type ParsedEmlHeaders = {
  subject: string | null;
  from: string | null;
  sentAt: Date | null;
};

function decodeHeaderValue(value: string): string {
  const encoded = value.match(/^=\?([^?]+)\?([BQbq])\?([^?]+)\?=$/);
  if (!encoded) return value.trim();
  try {
    if (encoded[2].toUpperCase() === "B") {
      return Buffer.from(encoded[3], "base64").toString("utf8").trim();
    }
  } catch {
    return value.trim();
  }
  return value.trim();
}

export function parseEmlHeaders(text: string): ParsedEmlHeaders {
  const headerBlock = text.split(/\r?\n\r?\n/)[0] ?? text.slice(0, 8000);
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");

  const subjectMatch = unfolded.match(/^Subject:\s*(.+)$/im);
  const fromMatch = unfolded.match(/^From:\s*(.+)$/im);
  const dateMatch = unfolded.match(/^Date:\s*(.+)$/im);

  const subject = subjectMatch ? decodeHeaderValue(subjectMatch[1]) : null;
  const from = fromMatch ? decodeHeaderValue(fromMatch[1]) : null;
  const sentAt = dateMatch ? new Date(dateMatch[1].trim()) : null;

  return {
    subject,
    from,
    sentAt: sentAt && !Number.isNaN(sentAt.getTime()) ? sentAt : null,
  };
}

export async function parseEmlFile(file: File): Promise<ParsedEmlHeaders> {
  const slice = file.slice(0, 64_000);
  const text = await slice.text();
  return parseEmlHeaders(text);
}

export function isEmlFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".eml") ||
    file.type === "message/rfc822" ||
    file.type === "application/vnd.ms-outlook"
  );
}
