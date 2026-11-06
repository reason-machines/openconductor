// In-page recorder shared by the transition probes. Injected as a function
// body: window.__txStart() begins collecting every CSS transition and
// animation (and Web Animation) the page runs; window.__txStop() returns
// them with their timing, plus the longest frame gap and layout shift.
// Works in Chromium (Playwright) and WebKitGTK (WebDriver execute).
export const RECORDER = String(() => {
  const describe = (n) => {
    if (!n || n.nodeType !== 1) return String(n?.nodeName ?? "");
    const c = (n.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(".");
    const a = n.getAttribute("aria-label") ?? n.getAttribute("role") ?? "";
    return `${n.tagName.toLowerCase()}${c ? "." + c : ""}${a ? `[${a}]` : ""}`;
  };
  let state = null;
  window.__txStart = () => {
    state = { t0: performance.now(), last: performance.now(), gaps: [], anims: new Map(), shifts: 0, on: true };
    try {
      state.po = new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) state.shifts += e.value; });
      state.po.observe({ type: "layout-shift", buffered: false });
    } catch {}
    const tick = () => {
      if (!state?.on) return;
      const now = performance.now();
      state.gaps.push(now - state.last);
      state.last = now;
      for (const a of document.getAnimations()) {
        const tm = a.effect?.getTiming?.() ?? {};
        const kf = a.effect?.getKeyframes?.() ?? [];
        const name = a.animationName ?? a.transitionProperty ?? a.id ?? a.constructor.name;
        const key = `${a.constructor.name}|${name}|${describe(a.effect?.target)}`;
        if (state.anims.has(key)) continue;
        const strip = (k) => Object.fromEntries(Object.entries(k).filter(([p]) => !["computedOffset", "composite", "offset", "easing"].includes(p)));
        state.anims.set(key, {
          kind: a.constructor.name,
          name,
          target: describe(a.effect?.target),
          duration: tm.duration,
          delay: tm.delay,
          fill: tm.fill,
          easing: tm.easing !== "linear" ? tm.easing : (kf.find((k) => k.easing && k.easing !== "linear")?.easing ?? "linear"),
          from: kf.length ? strip(kf[0]) : null,
          to: kf.length ? strip(kf[kf.length - 1]) : null,
          first_seen_ms: Math.round(now - state.t0),
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  };
  window.__txStop = () => {
    if (!state) return null;
    state.on = false;
    state.po?.disconnect();
    const out = {
      animations: [...state.anims.values()],
      max_frame_gap_ms: Math.round(Math.max(0, ...state.gaps.slice(1))),
      layout_shift: Math.round(state.shifts * 1000) / 1000,
    };
    state = null;
    return out;
  };
});
