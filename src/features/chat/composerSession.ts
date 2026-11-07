import type { ComposerDrafts } from "../../lib/local-storage/composerDrafts.ts";
import { attachmentPath, promptText, randomDir, rejectReason, restoreComposerAttachments, type ComposerAttachment } from "./composerAttachments.ts";

type DraftStore = Pick<ComposerDrafts, "load" | "save" | "clear">;
type Update<T> = T | ((current: T) => T);
type PickedFile = { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
interface Snapshot {
  draft: string;
  attachments: ComposerAttachment[];
  error: string | null;
}

/** One chat's draft and in-flight work; native staging still belongs to its workspace. */
export class ComposerSession {
  private state: Snapshot = { draft: "", attachments: [], error: null };
  private listeners = new Set<() => void>();
  private loading: Promise<void> | undefined;
  private loaded = false;
  private textEdited = false;
  private attachmentsEdited = false;
  private dirty = false;
  private active = false;
  private generation = 0;
  private pendingFiles = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  sending = false;

  private readonly chatId: string;
  private readonly store: DraftStore;

  constructor(chatId: string, store: DraftStore) {
    this.chatId = chatId;
    this.store = store;
  }

  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(patch: Partial<Snapshot>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private changed() {
    this.dirty = true;
    clearTimeout(this.timer);
    if (this.active) this.timer = setTimeout(() => this.flush(), 300);
    else this.flush();
  }

  flush = () => {
    clearTimeout(this.timer);
    if (!this.loaded || !this.dirty) return;
    this.dirty = false;
    const { draft, attachments } = this.state;
    void (draft === "" && attachments.length === 0 ? this.store.clear(this.chatId) : this.store.save(this.chatId, draft, attachments));
  };

  connect() {
    this.active = true;
    if (!this.loading) {
      this.loading = this.store.load(this.chatId).then((saved) => {
        this.publish({
          ...(!this.textEdited ? { draft: typeof saved === "string" ? saved : saved.message } : {}),
          ...(!this.attachmentsEdited ? { attachments: restoreComposerAttachments(typeof saved === "string" ? [] : saved.attachments) } : {}),
        });
      }, () => undefined).then(() => {
        this.loaded = true;
        this.flush();
      });
    }
    return this.loading;
  }

  disconnect() {
    this.active = false;
    this.generation++;
    this.flush();
  }

  setDraft = (update: Update<string>) => {
    this.textEdited = true;
    this.publish({ draft: typeof update === "function" ? update(this.state.draft) : update });
    this.changed();
  };

  setAttachments = (update: Update<ComposerAttachment[]>) => {
    this.attachmentsEdited = true;
    this.publish({ attachments: typeof update === "function" ? update(this.state.attachments) : update });
    this.changed();
  };

  async attach(files: readonly PickedFile[], write?: (path: string, bytes: Uint8Array) => Promise<unknown>) {
    if (this.sending) {
      this.publish({ error: "Wait for this send to finish, then attach the files again." });
      return;
    }
    this.pendingFiles++;
    this.publish({ error: null });
    try {
      for (const file of files) {
        const why = rejectReason(file);
        if (why) { this.publish({ error: why }); continue; }
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const path = attachmentPath(file.name, randomDir());
          if (write) await write(path, bytes);
          this.setAttachments((list) => [...list, { name: path, label: file.name, text: promptText(bytes, path), ...(write ? { staged: path } : {}) }]);
        } catch (error) {
          this.publish({ error: `Failed to attach ${file.name}: ${error instanceof Error ? error.message : String(error)}. Please retry.` });
        }
      }
    } finally {
      this.pendingFiles--;
    }
  }

  async send(copy: (path: string) => Promise<unknown>, deliver: (attachments: readonly ComposerAttachment[]) => void): Promise<boolean> {
    if (this.sending) return false;
    if (!this.loaded || this.pendingFiles > 0) {
      this.publish({ error: "Wait for the draft and selected files to finish loading, then send again." });
      return false;
    }
    this.sending = true;
    const generation = this.generation;
    const draft = this.state.draft;
    const sending = [...this.state.attachments];
    this.publish({ error: null });
    try {
      for (let i = 0; i < sending.length; i++) {
        const attachment = sending[i]!;
        if (!attachment.staged) continue;
        await copy(attachment.staged);
        const { staged: _staged, ...copied } = attachment;
        sending[i] = copied;
        this.setAttachments((list) => list.map((a) => a === attachment ? copied : a));
        this.flush();
        if (!this.active || this.generation !== generation) {
          this.publish({ error: "Send stopped after switching chats. Your draft is ready to retry." });
          return false;
        }
      }
      if (!this.active || this.generation !== generation) return false;
      deliver(sending);
      this.setAttachments((list) => list.filter((a) => !sending.includes(a)));
      if (this.state.draft === draft) this.setDraft("");
      this.flush();
      return true;
    } catch (error) {
      this.publish({ error: `Message not sent: ${error instanceof Error ? error.message : String(error)}. Your draft and attachments are kept; retry the send.` });
      return false;
    } finally {
      this.sending = false;
    }
  }
}

const sessions = new WeakMap<DraftStore, Map<string, ComposerSession>>();

/** Keep pending file work with its chat even if the workspace view unmounts. */
export function composerSessionFor(chatId: string, store: DraftStore): ComposerSession {
  let chats = sessions.get(store);
  if (!chats) {
    chats = new Map();
    sessions.set(store, chats);
  }
  let session = chats.get(chatId);
  if (!session) {
    session = new ComposerSession(chatId, store);
    chats.set(chatId, session);
  }
  return session;
}
