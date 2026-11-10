type Send = (id: string, data: string) => Promise<void>;

export function createPtyWriter(send: Send): Send {
  return (id, data) => send(id, data);
}
