/** Maximum backup size to attach to email (SMTP2go practical limit). */
export const MAX_EMAIL_BACKUP_BYTES = 10 * 1024 * 1024;

export const BACKUP_FORMAT_VERSION = 1;

/** Restore confirmation passcode (admin UI). */
export const RESTORE_PASSCODE = "1234";

export type NexusBackupManifest = {
  formatVersion: number;
  nexusVersion: string;
  createdAt: string;
  uploadsFileCount: number;
};

export function formatBackupSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
