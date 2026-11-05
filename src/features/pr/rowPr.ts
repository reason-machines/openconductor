// The slice of a PR lookup the sidebar row's status icon reads (Conductor's `DXo`).
import type { RowPr } from "../../state/rowStatus.ts";
import type { PrInfo } from "./types.ts";

export function rowPrOf(info: PrInfo, optionalChecksBlock: boolean): RowPr {
  return {
    number: info.number,
    isMerged: info.isMerged,
    isDraft: info.isDraft,
    inMergeQueue: info.mergeQueue !== null,
    mergeState: info.status?.mergeState ?? null,
    checks: info.status?.checks.status ?? null,
    failingChecks: info.status?.checks.failing.length ?? 0,
    viewerCanMerge: info.viewerCanMerge,
    optionalChecksBlock,
  };
}
