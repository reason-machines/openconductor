import assert from "node:assert/strict";
import fs from "node:fs";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
const results = {};
try {
  for (const theme of ["dark", "light"]) {
    results[theme] = {};
    for (const side of ["ref", "oc"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: theme });
      await page.goto(`http://${side === "ref" ? "conductor.localhost" : "localhost"}:4682/?oc_scenario=populated&oc_theme=${theme}`);
      const footer = page.getByRole("button", { name: /cities visited/ });
      await footer.waitFor();
      await page.waitForTimeout(1500);
      results[theme][side] = await footer.evaluate((element) => {
        const props = (node, keys) => {
          const style = getComputedStyle(node);
          return Object.fromEntries(keys.map((key) => [key, style[key]]));
        };
        const box = element.getBoundingClientRect();
        const labels = ["Open project", "Open GitHub project", "Quick start"];
        return {
          text: element.textContent,
          footer: { x: box.x, y: box.y, width: box.width, height: box.height, ...props(element, ["fontSize", "fontWeight", "lineHeight", "paddingLeft", "paddingRight", "borderRadius", "color", "gap", "justifyContent", "letterSpacing"]) },
          icon: { ...props(element.querySelector("svg"), ["width", "height", "strokeWidth", "marginRight"]), ...props(element.querySelector("svg > *"), ["vectorEffect"]) },
          cards: labels.map((label) => {
            const caption = [...document.querySelectorAll("span")].find((node) => node.textContent === label);
            const card = caption.closest(".home-card, [data-slot=card]") ?? caption.parentElement.parentElement;
            const icon = card.querySelector("svg");
            return { label, ...props(icon, ["width", "height", "strokeWidth", "color"]), ...props(icon.firstElementChild, ["vectorEffect"]), caption: props(caption, ["fontSize", "fontWeight", "lineHeight", "color", "letterSpacing"]) };
          }),
        };
      });
      await footer.hover();
      await page.waitForTimeout(200);
      results[theme][side].hover = await footer.evaluate((element) => {
        const style = getComputedStyle(element);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d");
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);
        return { color: style.color, backgroundRgba: [...context.getImageData(0, 0, 1, 1).data] };
      });
      await page.close();
    }
  }
  fs.mkdirSync(process.env.SHELL_OUT ?? ".oc-tmp/main-shell", { recursive: true });
  fs.writeFileSync(`${process.env.SHELL_OUT ?? ".oc-tmp/main-shell"}/home-metrics.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (process.env.SHELL_MEASURE !== "1") {
    for (const [theme, { ref, oc }] of Object.entries(results)) {
      assert.equal(oc.text, ref.text, `${theme}: catalogue denominator and visited count`);
      assert.deepEqual(oc.footer, ref.footer, `${theme}: footer typography and button geometry`);
      assert.deepEqual(oc.icon, ref.icon, `${theme}: footer icon weight and spacing`);
      assert.deepEqual(oc.cards, ref.cards, `${theme}: card icon size and weight`);
      assert.deepEqual(oc.hover, ref.hover, `${theme}: footer hover colours`);
    }
    console.log("PASS Home city count, footer typography/geometry, footer and card icon weights in dark and light");
  }
} finally {
  await browser.close();
}
