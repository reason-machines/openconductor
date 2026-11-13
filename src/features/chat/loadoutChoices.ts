import type { LoadoutSlot } from "../../settings/agents/loadout.ts";
import type { ModelChoice } from "./composerModels.ts";

export function loadoutChoices(slots: readonly LoadoutSlot[]): (ModelChoice | null)[] {
  return slots.map((favorite) => favorite?.type === "built-in" ? {
    agent: favorite.agent,
    model: favorite.model,
    effort: favorite.thinkingLevel ?? null,
    fast: favorite.fastMode,
  } : null);
}

export function selectLoadoutSlot(slots: readonly (ModelChoice | null)[], index: number, onChange: (choice: ModelChoice) => void): void {
  const choice = slots[index];
  if (choice) onChange(choice);
}

export function sameModelChoice(a: ModelChoice, b: ModelChoice): boolean {
  return a.model === b.model && a.agent === b.agent && a.effort === b.effort && !!a.fast === !!b.fast;
}

export function orderedModelChoices(value: ModelChoice, favorites: readonly ModelChoice[], models: readonly ModelChoice[] = []): ModelChoice[] {
  const listed = [...favorites, value, ...models];
  return listed.filter((choice, index) => listed.findIndex((other) => sameModelChoice(choice, other)) === index);
}
