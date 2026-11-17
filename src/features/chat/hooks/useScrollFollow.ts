import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";

/** Distance (px) from the bottom within which the container is considered "at the bottom". */
export const SCROLL_BOTTOM_THRESHOLD = 50;

/**
 * Returns true when `el` is scrolled to within {@link SCROLL_BOTTOM_THRESHOLD} px
 * of its bottom edge. Accepts a plain object so it is directly unit-testable.
 *
 * parity:chat.scroll-follow  BE7-17
 */
export function computeIsAtBottom(el: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_BOTTOM_THRESHOLD;
}

export interface ScrollFollowResult {
  /**
   * Ref whose `.current` is `true` when the container was last seen near its
   * bottom. Updated synchronously on each scroll event; starts as `true` so
   * a freshly mounted empty chat unconditionally receives its first scroll.
   */
  isAtBottomRef: MutableRefObject<boolean>;
}

/**
 * Attaches a passive scroll listener to `containerRef` and keeps
 * `isAtBottomRef.current` up-to-date.
 *
 * Usage:
 * ```ts
 * const containerRef = useRef<HTMLDivElement | null>(null);
 * const { isAtBottomRef } = useScrollFollow(containerRef);
 * ```
 *
 * parity:chat.scroll-follow  BE7-17
 */
export function useScrollFollow(containerRef: RefObject<HTMLElement | null>): ScrollFollowResult {
  const isAtBottomRef = useRef(true);

  // No dependency array: re-runs on every render so the listener always
  // tracks the current container element (handles chatId switches cleanly).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onScroll() {
      isAtBottomRef.current = computeIsAtBottom(el!);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    // Seed the initial value for this element.
    isAtBottomRef.current = computeIsAtBottom(el);
    return () => el.removeEventListener("scroll", onScroll);
  });

  return { isAtBottomRef };
}
