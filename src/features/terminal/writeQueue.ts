type Send = (id: string, data: string) => Promise<void>;

export function createPtyWriter(send: Send): Send {
  const tails = new Map<string, Promise<void>>();

  return (id, data) => {
    const write = (tails.get(id) ?? Promise.resolve()).then(() => send(id, data));
    const tail = write.catch(() => {});
    tails.set(id, tail);
    void tail.then(() => {
      if (tails.get(id) === tail) tails.delete(id);
    });
    return write;
  };
}
