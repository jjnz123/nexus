"use client";

import { useRef, useState, useTransition } from "react";
import { Archive, Download, Mail, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { MAX_EMAIL_BACKUP_BYTES, formatBackupSize } from "@/lib/backup/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BackupRestorePanel({
  emailConfigured,
  defaultEmail,
}: {
  emailConfigured: boolean;
  defaultEmail: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [emailTo, setEmailTo] = useState(defaultEmail);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restorePasscode, setRestorePasscode] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDownloading, startDownload] = useTransition();
  const [isEmailing, startEmail] = useTransition();
  const [isRestoring, startRestore] = useTransition();

  const onDownload = () => {
    startDownload(async () => {
      try {
        const res = await fetch("/api/admin/backup");
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Download failed (${res.status})`);
        }

        const blob = await res.blob();
        const disposition = res.headers.get("Content-Disposition") ?? "";
        const match = disposition.match(/filename="([^"]+)"/);
        const filename = match?.[1] ?? "nexus-backup.tar.gz";
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        toast.success(`Backup downloaded (${formatBackupSize(blob.size)})`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Download failed");
      }
    });
  };

  const onEmailBackup = () => {
    startEmail(async () => {
      try {
        const res = await fetch("/api/admin/backup/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: emailTo.trim() }),
        });
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          filename?: string;
          size?: number;
        } | null;

        if (!res.ok) {
          throw new Error(body?.error ?? `Email failed (${res.status})`);
        }

        toast.success(
          `Backup emailed to ${emailTo.trim()} (${formatBackupSize(body?.size ?? 0)})`
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Email backup failed");
      }
    });
  };

  const onRestore = () => {
    if (!selectedFile) {
      toast.error("Choose a backup file first");
      return;
    }

    startRestore(async () => {
      try {
        const form = new FormData();
        form.append("file", selectedFile);
        form.append("passcode", restorePasscode.trim());

        const res = await fetch("/api/admin/backup/restore", {
          method: "POST",
          body: form,
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;

        if (!res.ok) {
          throw new Error(body?.error ?? `Restore failed (${res.status})`);
        }

        toast.success("Backup restored successfully. Reloading…");
        setRestoreOpen(false);
        setRestorePasscode("");
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        window.location.reload();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Restore failed");
      }
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Backup &amp; Restore
          </CardTitle>
          <CardDescription>
            Download a full Nexus backup (PostgreSQL database + uploads volume). Email is available
            for backups up to {formatBackupSize(MAX_EMAIL_BACKUP_BYTES)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">Create backup</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-2"
                disabled={isDownloading || isEmailing}
                onClick={onDownload}
              >
                <Download className="h-4 w-4" />
                {isDownloading ? "Creating backup…" : "Download backup"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Includes all portal data and uploaded files (avatars, task attachments, meeting
              audio). Large instances may take several minutes.
            </p>
          </div>

          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Email backup</p>
              {!emailConfigured ? <Badge variant="destructive">SMTP not configured</Badge> : null}
            </div>
            {emailConfigured ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="backup-email-to">Send to</Label>
                  <Input
                    id="backup-email-to"
                    type="email"
                    value={emailTo}
                    onChange={(event) => setEmailTo(event.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={isEmailing || isDownloading || !emailTo.trim()}
                  onClick={onEmailBackup}
                >
                  <Mail className="h-4 w-4" />
                  {isEmailing ? "Creating & sending…" : "Email backup"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Attachments over {formatBackupSize(MAX_EMAIL_BACKUP_BYTES)} must be downloaded
                  instead.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Configure SMTP2go in the stack environment to email backups.
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-destructive" />
              <p className="text-sm font-medium text-destructive">Restore backup</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Restoring replaces the entire database and uploads folder. This cannot be undone.
            </p>
            <div className="space-y-2">
              <Label htmlFor="backup-restore-file">Backup archive (.tar.gz)</Label>
              <Input
                id="backup-restore-file"
                ref={fileInputRef}
                type="file"
                accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={!selectedFile || isRestoring}
              onClick={() => {
                setRestorePasscode("");
                setRestoreOpen(true);
              }}
            >
              <Upload className="h-4 w-4" />
              Restore from backup…
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Nexus backup?</DialogTitle>
            <DialogDescription>
              This will permanently replace all current Nexus data with the contents of{" "}
              <strong>{selectedFile?.name ?? "the selected backup"}</strong>. All users, tasks,
              bookmarks, meetings, and uploads will be overwritten.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="restore-passcode">Enter restore passcode to proceed</Label>
            <Input
              id="restore-passcode"
              type="password"
              autoComplete="off"
              value={restorePasscode}
              onChange={(event) => setRestorePasscode(event.target.value)}
              placeholder="Passcode"
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setRestoreOpen(false)} disabled={isRestoring}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isRestoring || !restorePasscode.trim()}
              onClick={onRestore}
            >
              {isRestoring ? "Restoring…" : "Restore now"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
