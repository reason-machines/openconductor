import { WriteBarrier, type PersistenceOwner } from "./owner.ts";

export interface PersistenceReceipt { readonly revision: number }

export function createPersistenceRegistry() {
  const owners = new Set<PersistenceOwner>();
  const retired = new Set<PersistenceOwner>();
  const receipts = new WeakMap<PersistenceReceipt, ReadonlyMap<PersistenceOwner, number>>();
  let topology = 0;
  return {
    registerProducer(owner: PersistenceOwner) {
      owners.add(owner);
      topology++;
      return () => {
        retired.add(owner);
        if (owner.ready()) { owners.delete(owner); retired.delete(owner); topology++; }
      };
    },
    async drain(): Promise<PersistenceReceipt> {
      for (;;) {
        const before = topology;
        const participants = [...owners];
        await Promise.all(participants.map((owner) => owner.drain()));
        for (const owner of retired) if (owner.ready()) { owners.delete(owner); retired.delete(owner); topology++; }
        if (before !== topology || participants.some((owner) => !owner.ready())) continue;
        const receipt = { revision: topology };
        receipts.set(receipt, new Map(participants.map((owner) => [owner, owner.revision])));
        return receipt;
      }
    },
    isCurrent(receipt: PersistenceReceipt): boolean {
      const revisions = receipts.get(receipt);
      return receipt.revision === topology && revisions !== undefined && revisions.size === owners.size
        && [...owners].every((owner) => owner.ready() && revisions.get(owner) === owner.revision);
    },
  };
}

const registry = createPersistenceRegistry();
export const registerPersistenceOwner = registry.registerProducer;
export const restartPersistence = () => registry;

export function persistenceOwner(): WriteBarrier {
  const owner = new WriteBarrier();
  registerPersistenceOwner(owner);
  return owner;
}
