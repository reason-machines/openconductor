export interface PersistenceOwner {
  readonly revision: number;
  ready(): boolean;
  drain(): Promise<void>;
}

export interface WriteAcknowledgment {
  succeed(): void;
  fail(cause: unknown): void;
}

export class WriteBarrier implements PersistenceOwner {
  revision = 0;
  private pending = new Map<number, Promise<void>>();
  private failures = new Map<string, { revision: number; cause: unknown }>();
  private acknowledged = new Map<string, number>();

  private prepare: () => void;

  constructor(prepare: () => void = () => {}) { this.prepare = prepare; }

  begin(key = "value"): WriteAcknowledgment {
    const revision = ++this.revision;
    let finish: () => void = () => {};
    this.pending.set(revision, new Promise<void>((resolve) => { finish = resolve; }));
    let settled = false;
    const settle = (result: { kind: "success" } | { kind: "failure"; cause: unknown }) => {
      if (settled) return;
      settled = true;
      if (result.kind === "success") {
        this.acknowledged.set(key, Math.max(this.acknowledged.get(key) ?? 0, revision));
        if ((this.failures.get(key)?.revision ?? 0) < revision) this.failures.delete(key);
      } else if ((this.acknowledged.get(key) ?? 0) < revision && (this.failures.get(key)?.revision ?? 0) < revision) {
        this.failures.set(key, { revision, cause: result.cause });
      }
      this.pending.delete(revision);
      this.revision++;
      finish();
    };
    return { succeed: () => settle({ kind: "success" }), fail: (cause) => settle({ kind: "failure", cause }) };
  }

  async run<T>(operation: () => Promise<T>, success: (value: T) => boolean = () => true, key = "value"): Promise<T> {
    const acknowledgment = this.begin(key);
    try {
      const value = await operation();
      if (success(value)) acknowledgment.succeed();
      else acknowledgment.fail(new Error("Persistence write was refused"));
      return value;
    } catch (cause) {
      acknowledgment.fail(cause);
      throw cause;
    }
  }

  ready(): boolean { return this.pending.size === 0 && this.failures.size === 0; }

  async drain(): Promise<void> {
    this.prepare();
    while (this.pending.size) {
      await Promise.all([...this.pending.values()]);
      this.prepare();
    }
    const failure = this.failures.values().next();
    if (!failure.done) throw failure.value.cause;
  }
}
