import { useEffect, useMemo } from "react";
import { WriteBarrier, type WriteAcknowledgment } from "./owner.ts";
import { registerPersistenceOwner } from "./restartPersistence.ts";

export function usePersistenceProducer() {
  const owner = useMemo(() => new WriteBarrier(), []);
  useEffect(() => registerPersistenceOwner(owner), [owner]);
  return owner;
}

export class PendingEdit<T> {
  private latest: { value: T; acknowledgment: WriteAcknowledgment } | undefined;
  readonly writes = new WriteBarrier(() => { this.flush(); });

  constructor(private save: (value: T) => Promise<unknown>, private cancelTimer: () => void) {}

  change(value: T): void {
    this.latest = { value, acknowledgment: this.latest?.acknowledgment ?? this.writes.begin() };
  }

  flush(): void {
    this.cancelTimer();
    const pending = this.latest;
    this.latest = undefined;
    if (!pending) return;
    void Promise.resolve().then(() => this.save(pending.value)).then((result) => {
      if (result === false) pending.acknowledgment.fail(new Error("Persistence write was refused"));
      else pending.acknowledgment.succeed();
    }, (error) => pending.acknowledgment.fail(error));
  }

  abandon(): void {
    this.cancelTimer();
    const pending = this.latest;
    this.latest = undefined;
    pending?.acknowledgment.fail(new Error("Unsaved editor was unmounted"));
  }
}

export function usePendingEdit<T>(scope: string, save: (value: T) => Promise<unknown>, cancelTimer: () => void, flushOnUnmount = false) {
  const callbacks = useMemo(() => ({ save, cancelTimer }), [scope]);
  callbacks.save = save;
  callbacks.cancelTimer = cancelTimer;
  const edit = useMemo(() => new PendingEdit<T>((value) => callbacks.save(value), () => callbacks.cancelTimer()), [callbacks]);
  useEffect(() => {
    const release = registerPersistenceOwner(edit.writes);
    return () => {
      if (flushOnUnmount) edit.flush(); else edit.abandon();
      release();
    };
  }, [edit, flushOnUnmount]);
  return edit;
}
