// Composer drafts kept between launches in the `composer-drafts` subsystem,
// one entry per chat session, as the reference's composer service does
// (evidence/persistence/local-storage/NOTES.md): the value is the draft text,
// or `{ message, attachments }` when it has attachments; clearing a draft
// (sending it) removes the entry; a value equal to the last one written is
// not written again; writes for one store run one at a time.

import type { LocalStorageClient } from "./client.ts";
import { COMPOSER_DRAFTS } from "./subsystems.ts";

export type StoredDraft = string | { message: string; attachments: unknown[] };

/** The draft text of a stored value, or undefined when it is not a draft. */
export function draftMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { message?: unknown }).message === "string") {
    const attachments = (value as { attachments?: unknown }).attachments;
    if (Array.isArray(attachments)) return (value as { message: string }).message;
  }
  return undefined;
}

export class ComposerDrafts {
  private readonly client: LocalStorageClient;
  private readonly lastSerialized = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly log: (msg: string) => void;

  constructor(client: LocalStorageClient, log: (msg: string) => void = (m) => console.error(m)) {
    this.client = client;
    this.log = log;
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => undefined).then(task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The saved draft text for a session ("" when there is none or it is unreadable). */
  load(sessionId: string): Promise<string> {
    return this.run(async () => {
      const value = await this.client.getEntry({ subsystem: COMPOSER_DRAFTS.name, id: sessionId });
      if (value === undefined) return "";
      const message = draftMessage(value);
      if (message === undefined) {
        this.log(`[composer-drafts] Dropping unparseable persisted composer draft for ${sessionId}`);
        return "";
      }
      this.lastSerialized.set(sessionId, JSON.stringify(value));
      return message;
    });
  }

  /** Saves the draft text; resolves false when the store refused it. */
  save(sessionId: string, message: string): Promise<boolean> {
    return this.run(async () => {
      const serialized = JSON.stringify(message);
      if (this.lastSerialized.get(sessionId) === serialized) return true;
      const r = await this.client.setEntry({
        subsystem: COMPOSER_DRAFTS.name,
        sizeLimit: COMPOSER_DRAFTS.sizeLimit,
        id: sessionId,
        content: message,
      });
      if (!r.success) {
        this.log(`[composer-drafts] Failed to persist composer draft for session ${sessionId}: ${r.reason}`);
        return false;
      }
      this.lastSerialized.set(sessionId, serialized);
      return true;
    });
  }

  /** Forgets the session's draft (after it is sent). */
  clear(sessionId: string): Promise<void> {
    return this.run(async () => {
      if (!this.lastSerialized.has(sessionId)) return;
      await this.client.removeEntry({ subsystem: COMPOSER_DRAFTS.name, id: sessionId });
      this.lastSerialized.delete(sessionId);
    });
  }
}
