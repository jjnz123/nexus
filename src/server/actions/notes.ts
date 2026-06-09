"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userNotes, type NoteLanguage } from "@/lib/db/schema";
import { indexUserNote } from "@/lib/rag/indexer";
import { deleteRagSource } from "@/lib/rag/store";
import { RAG_SOURCE_TYPES } from "@/lib/rag/types";

const noteLanguageSchema = z.enum([
  "plaintext",
  "markdown",
  "shell",
  "javascript",
  "typescript",
  "python",
  "json",
  "yaml",
  "sql",
  "html",
  "css",
]);

const createNoteSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  language: noteLanguageSchema.optional(),
});

const updateNoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(500_000).optional(),
  language: noteLanguageSchema.optional(),
});

export async function getUserNotes() {
  const session = await requireAuth();
  return db
    .select()
    .from(userNotes)
    .where(eq(userNotes.userId, session.user.id))
    .orderBy(asc(userNotes.sortOrder), desc(userNotes.updatedAt));
}

export async function getUserNote(id: string) {
  const session = await requireAuth();
  const [note] = await db
    .select()
    .from(userNotes)
    .where(and(eq(userNotes.id, id), eq(userNotes.userId, session.user.id)))
    .limit(1);
  return note ?? null;
}

export async function createUserNote(input?: unknown) {
  const session = await requireAuth();
  const data = createNoteSchema.parse(input ?? {});
  const existing = await db
    .select({ sortOrder: userNotes.sortOrder })
    .from(userNotes)
    .where(eq(userNotes.userId, session.user.id));

  const [note] = await db
    .insert(userNotes)
    .values({
      userId: session.user.id,
      title: data.title ?? "Untitled",
      language: (data.language ?? "plaintext") as NoteLanguage,
      sortOrder: existing.length,
    })
    .returning();

  revalidatePath("/notes");
  void indexUserNote(note).catch(() => undefined);
  return note;
}

export async function updateUserNote(input: unknown) {
  const session = await requireAuth();
  const data = updateNoteSchema.parse(input);

  const [note] = await db
    .update(userNotes)
    .set({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.language !== undefined ? { language: data.language } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(userNotes.id, data.id), eq(userNotes.userId, session.user.id)))
    .returning();

  if (!note) throw new Error("Note not found");
  revalidatePath("/notes");
  void indexUserNote(note).catch(() => undefined);
  return note;
}

export async function deleteUserNote(id: string) {
  const session = await requireAuth();
  await db
    .delete(userNotes)
    .where(and(eq(userNotes.id, id), eq(userNotes.userId, session.user.id)));
  await deleteRagSource(RAG_SOURCE_TYPES.USER_NOTE, id);
  revalidatePath("/notes");
  return { success: true };
}

export async function renameUserNote(id: string, title: string) {
  return updateUserNote({ id, title });
}
