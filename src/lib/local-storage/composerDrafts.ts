// Composer drafts kept between launches in the `composer-drafts` subsystem,
// one entry per chat session, as the reference's composer service does
// (evidence/persistence/local-storage/NOTES.md): the value is the draft text,
// or `{ message, attachments }` when it has attachments; clearing a draft
// (sending it) removes the entry; a value equal to the last one written is
// not written again; writes for one store run one at a time.

import { WriteBarrier } from "../persistence/owner.ts";
import { registerPersistenceOwner } from "../persistence/restartPersistence.ts";
import type { LocalStorageClient } from "./client.ts";
import { COMPOSER_DRAFTS } from "./subsystems.ts";

export type StoredDraft = string | { message: string; attachments: unknown[] };

/** Parses the storage envelope; attachment contents are validated by their consumer. */
export function storedDraft(value: unknown): StoredDraft | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value && typeof value.message === "string" && "attachments" in value && Array.isArray(value.attachments)) {
    return { message: value.message, attachments: value.attachments };
  }
  return undefined;
}

/** The draft text of a stored value, or undefined when it is not a draft. */
export function draftMessage(value: unknown): string | undefined {
  const draft = storedDraft(value);
  return typeof draft === "string" ? draft : draft?.message;
}

export class ComposerDrafts {
  private readonly client: LocalStorageClient;
  private readonly lastSerialized = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly writes = new WriteBarrier();
  private readonly log: (msg: string) => void;

  constructor(client: LocalStorageClient, log: (msg: string) => void = (m) => console.error(m)) {
    this.client = client;
    this.log = log;
    registerPersistenceOwner(this.writes);
  }

  drain(): Promise<void> { return this.writes.drain(); }

  private run<T>(task: () => Promise<T>, key?: string): Promise<T> {
    const queued = () => this.queue.catch(() => undefined).then(task);
    const next = key === undefined ? queued() : this.writes.run(queued, (result) => result !== false, key);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The saved draft, including attachments ("" when missing or unreadable). */
  load(sessionId: string): Promise<StoredDraft> {
    return this.run(async () => {
      const value = await this.client.getEntry({ subsystem: COMPOSER_DRAFTS.name, id: sessionId });
      if (value === undefined) return "";
      const draft = storedDraft(value);
      if (draft === undefined) {
        this.log(`[composer-drafts] Dropping unparseable persisted composer draft for ${sessionId}`);
        return "";
      }
      this.lastSerialized.set(sessionId, JSON.stringify(value));
      return draft;
    });
  }

  /** Saves text and attachment metadata together; false when the store refused it. */
  save(sessionId: string, message: string, attachments: readonly unknown[] = []): Promise<boolean> {
    const content: StoredDraft = attachments.length ? { message, attachments: [...attachments] } : message;
    return this.run(async () => {
      const serialized = JSON.stringify(content);
      if (this.lastSerialized.get(sessionId) === serialized) return true;
      const r = await this.client.setEntry({
        subsystem: COMPOSER_DRAFTS.name,
        sizeLimit: COMPOSER_DRAFTS.sizeLimit,
        id: sessionId,
        content,
      });
      if (!r.success) {
        this.log(`[composer-drafts] Failed to persist composer draft for session ${sessionId}: ${r.reason}`);
        return false;
      }
      this.lastSerialized.set(sessionId, serialized);
      return true;
    }, sessionId);
  }

  /** Forgets the session's draft (after it is sent). */
  clear(sessionId: string): Promise<void> {
    return this.run(async () => {
      if (!this.lastSerialized.has(sessionId)) return;
      await this.client.removeEntry({ subsystem: COMPOSER_DRAFTS.name, id: sessionId });
      this.lastSerialized.delete(sessionId);
    }, sessionId);
  }
}
