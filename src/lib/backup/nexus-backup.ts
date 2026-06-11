import { randomUUID } from "crypto";
import { execFile } from "child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { promisify } from "util";
import {
  BACKUP_FORMAT_VERSION,
  type NexusBackupManifest,
} from "@/lib/backup/constants";

const execFileAsync = promisify(execFile);

async function countFiles(dir: string): Promise<number> {
  try {
    let count = 0;
    async function walk(current: string) {
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) await walk(fullPath);
        else count += 1;
      }
    }
    await walk(dir);
    return count;
  } catch {
    return 0;
  }
}

async function copyUploads(sourceDir: string, targetDir: string) {
  await mkdir(targetDir, { recursive: true });
  try {
    await stat(sourceDir);
  } catch {
    return;
  }
  await cp(sourceDir, targetDir, { recursive: true, force: true });
}

export async function createNexusBackupArchive(): Promise<{
  buffer: Buffer;
  filename: string;
  size: number;
  manifest: NexusBackupManifest;
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  const workId = randomUUID();
  const workDir = path.join("/tmp", `nexus-backup-${workId}`);
  const archivePath = `${workDir}.tar.gz`;

  await mkdir(workDir, { recursive: true });

  try {
    await execFileAsync("pg_dump", [
      `--dbname=${databaseUrl}`,
      "--no-owner",
      "--no-acl",
      "--clean",
      "--if-exists",
      "-F",
      "p",
      "-f",
      path.join(workDir, "database.sql"),
    ]);

    await copyUploads(uploadDir, path.join(workDir, "uploads"));
    const uploadsFileCount = await countFiles(path.join(workDir, "uploads"));

    const manifest: NexusBackupManifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      nexusVersion: process.env.NEXT_PUBLIC_NEXUS_VERSION ?? "unknown",
      createdAt: new Date().toISOString(),
      uploadsFileCount,
    };

    await writeFile(path.join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    await execFileAsync("tar", ["-czf", archivePath, "-C", workDir, "."]);

    const buffer = await readFile(archivePath);
    const filename = `nexus-backup-${manifest.createdAt.slice(0, 10)}.tar.gz`;

    return { buffer, filename, size: buffer.length, manifest };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    await rm(archivePath, { force: true }).catch(() => undefined);
  }
}

export async function restoreNexusBackupArchive(buffer: Buffer) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
  const workId = randomUUID();
  const archivePath = path.join("/tmp", `nexus-restore-${workId}.tar.gz`);
  const extractDir = path.join("/tmp", `nexus-restore-${workId}`);

  await writeFile(archivePath, buffer);
  await mkdir(extractDir, { recursive: true });

  try {
    await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir]);

    const manifestRaw = await readFile(path.join(extractDir, "manifest.json"), "utf8");
    const manifest = JSON.parse(manifestRaw) as NexusBackupManifest;
    if (manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
      throw new Error("Unsupported backup format version");
    }

    const sqlPath = path.join(extractDir, "database.sql");
    await stat(sqlPath);

    await execFileAsync("psql", [
      `--dbname=${databaseUrl}`,
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      sqlPath,
    ]);

    await rm(uploadDir, { recursive: true, force: true }).catch(() => undefined);
    await mkdir(uploadDir, { recursive: true });
    await copyUploads(path.join(extractDir, "uploads"), uploadDir);

    return manifest;
  } finally {
    await rm(archivePath, { force: true }).catch(() => undefined);
    await rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
