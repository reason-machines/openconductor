// Dumps every visible element with a transition or animation (computed style).
import { openSide } from "./sides.mjs";
const [side = "conductor", dist, out = ".anim-work/x.png"] = process.argv.slice(2);
const { page, close } = await openSide(side, { dist });
if (process.env.PRE) await eval(`(async () => { ${process.env.PRE} })()`);
const rows = await page.evaluate(() => {
  const o = [];
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    const t = cs.transitionDuration.split(",").some((d) => parseFloat(d) > 0) ? `${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction} ${cs.transitionDelay}` : "";
    const a = cs.animationName !== "none" ? `${cs.animationName} ${cs.animationDuration} ${cs.animationTimingFunction}` : "";
    if (!t && !a) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    o.push({ tag: el.tagName, cls: (el.getAttribute("class") || "").slice(0, 140), aria: el.getAttribute("aria-label") || el.getAttribute("role") || "", text: (el.textContent || "").trim().slice(0, 30), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), t, a });
  }
  return o;
});
for (const r of rows) console.log(JSON.stringify(r));
await page.screenshot({ path: out });
await close();
