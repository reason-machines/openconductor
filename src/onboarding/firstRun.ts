// First-run onboarding, as Conductor v0.87.6 decides and shows it. Byte
// offsets are into the decoded chunks (sha256 checked against
// evidence/frontend/tauri-assets-manifest.json); the full read is
// evidence/screens/first-run-onboarding.md.
//
// - The setting `first_time_onboarding_step` reads as `parseInt(value ?? "1")`
//   (index-BGEQ8YjU.js `w5t` @395554). Finishing writes 999 (`_5t` @395545)
//   and sets `onboarding_step` to done (`rI.DONE` = 4) (renderApp `Doa` @~10153000).
// - The auth guard (renderApp `Bxa` @~11099000) normalizes the step with the
//   repository list (`Pya` @11061033: no repositories -> the stored step,
//   otherwise 999) and shows the onboarding while it is at most 1 (`Ooa` @10151889).
// - `/first-run-onboarding` (renderApp `W7a` @11518989, component `BCa`
//   @11285034) shows the same screen with an "Exit onboarding" button; it sits
//   under the auth guard, so the gate above wins when it applies.

export const FIRST_RUN_ROUTE = "/first-run-onboarding";
/** `first_time_onboarding_step` once onboarding is finished (`_5t`). */
export const FIRST_RUN_DONE_STEP = 999;
/** The guard shows the onboarding while the normalized step is at most this (`Ooa`). */
export const LAST_FIRST_RUN_STEP = 1;

export const CONTINUE_LABEL = "Continue";
export const EXIT_LABEL = "Exit onboarding";
/** Toast when saving the finished state fails (`wBi` onError). */
export const FINISH_FAILED = "Couldn't finish setup. Please try again.";

/** The stored setting as the reference parses it: unset reads as 1; junk is NaN. */
export function parseFirstRunStep(raw: string | null | undefined): number {
  return parseInt(raw ?? "1");
}

/** `Pya`: with no repositories (or none known) the stored step counts; otherwise done. */
export function normalizedFirstRunStep(step: number, repoCount: number | undefined): number {
  return !repoCount ? step : FIRST_RUN_DONE_STEP;
}

/** True when the auth guard renders the onboarding instead of the app. NaN never does. */
export function showsFirstRun(step: number, repoCount: number | undefined): boolean {
  return normalizedFirstRunStep(step, repoCount) <= LAST_FIRST_RUN_STEP;
}

export type FirstRunView = "loading" | "onboarding" | "onboarding-route" | "app";

/**
 * What the window shows: the loader until the step and repositories are read,
 * then the gated onboarding, the `/first-run-onboarding` preview route, or the app.
 */
export function firstRunView(input: { loaded: boolean; step: number; repoCount: number | undefined; path: string }): FirstRunView {
  if (!input.loaded) return "loading";
  if (showsFirstRun(input.step, input.repoCount)) return "onboarding";
  return input.path === FIRST_RUN_ROUTE ? "onboarding-route" : "app";
}

export interface Slide {
  id: "repo" | "agents" | "conduct";
  title: string;
  description: string;
  src: string;
}

/** `y6e` slide copy, with original OpenConductor illustrations instead of proprietary videos. */
export const SLIDES: readonly Slide[] = [
  { id: "repo", title: "Get coding agents working in parallel", description: "Each agent you spin up gets an isolated workspace.", src: "/onboarding/workspaces.mp4" },
  { id: "agents", title: "See at a glance what each agent is working on", description: "See who's working, what needs attention, and what's planned.", src: "/onboarding/agents.mp4" },
  { id: "conduct", title: "Review changes and create PRs", description: "Review, comment, and merge from OpenConductor.", src: "/onboarding/review.mp4" },
];

/** `onboarding.nextSlide` and the end of a slide: the next one, wrapping to the first. */
export function nextSlideId(current: Slide["id"]): Slide["id"] {
  const i = SLIDES.findIndex((s) => s.id === current);
  return SLIDES[(i + 1) % SLIDES.length].id;
}
