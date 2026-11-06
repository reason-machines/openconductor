import { useLayoutEffect, useRef, type RefObject } from "react";

/** Conductor's dialog kinds; see screens.css for the timing of each. */
export type DialogMotion = "dialog" | "alert" | "cmdk";

/**
 * Attributes the leaving snapshot drops so nothing treats it as the dialog:
 * ids (labels, focus targets), roles and ARIA (tests and screen readers),
 * autofocus, and data-dialog-id (the keybinding dispatcher's open dialog).
 */
export function isIdentityAttribute(name: string): boolean {
  return name === "id" || name === "role" || name === "autofocus" || name === "data-dialog-id" || name.startsWith("aria-");
}

/**
 * Ref for a dialog's backdrop (the element with data-dialog-motion). Enter
 * runs in CSS on mount. On unmount, by any path (Escape, a button, the
 * parent's state), an inert copy of the dialog stays where it was for the
 * exit animation, then removes itself; callers keep rendering dialogs
 * conditionally. Skipped when the user prefers reduced motion.
 */
export function useDialogMotion<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (el) leave(el);
    };
  }, []);
  return ref;
}

function leave(el: HTMLElement) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const parent = el.parentNode;
  if (!parent) return;
  const next = el.nextSibling;
  const ghost = snapshot(el);
  // React removes the node after this cleanup, in the same commit.
  queueMicrotask(() => {
    // Still attached: StrictMode's effect re-run, not a close. Parent gone: the whole screen went away.
    if (el.isConnected || !parent.isConnected) return;
    parent.insertBefore(ghost.root, next?.parentNode === parent ? next : null);
    ghost.restoreScroll();
    ghost.root.classList.add("oc-leaving");
    // Gone once its exit animations end (or are cancelled); at once if it has none. Looping ones (spinners) never end.
    const exits = ghost.root.getAnimations({ subtree: true }).filter((a) => a.effect?.getTiming().iterations !== Infinity);
    void Promise.allSettled(exits.map((a) => a.finished)).then(() => ghost.root.remove());
  });
}

/** Deep copy without identity, with form values; scroll offsets apply once it is in the document. */
function snapshot(el: HTMLElement) {
  const root = el.cloneNode(true) as HTMLElement;
  const from = [el, ...el.querySelectorAll<HTMLElement>("*")];
  const to = [root, ...root.querySelectorAll<HTMLElement>("*")];
  const scroll: [HTMLElement, number][] = [];
  from.forEach((src, i) => {
    const dst = to[i];
    if (!dst) return;
    for (const name of dst.getAttributeNames()) if (isIdentityAttribute(name)) dst.removeAttribute(name);
    if (src instanceof HTMLInputElement || src instanceof HTMLTextAreaElement || src instanceof HTMLSelectElement) (dst as typeof src).value = src.value;
    if (src.scrollTop > 0) scroll.push([dst, src.scrollTop]);
  });
  root.setAttribute("aria-hidden", "true");
  root.inert = true;
  return { root, restoreScroll: () => scroll.forEach(([dst, top]) => (dst.scrollTop = top)) };
}
