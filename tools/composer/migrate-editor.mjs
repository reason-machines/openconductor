// Mechanical driver migration; --write applies it, otherwise fails on pending changes.
import fs from "node:fs";
import path from "node:path";
const write = process.argv.includes("--write");
const changed = [];
for (const folder of ["tools/e2e", "tests/e2e"]) {
  for (const name of fs.readdirSync(folder).filter((name) => name.endsWith(".mjs"))) {
    const file = path.join(folder, name);
    const before = fs.readFileSync(file, "utf8");
    let after = before.replaceAll(".composer textarea, .composer [contenteditable=true]", ".composer [contenteditable=true]")
      .replaceAll(".composer textarea", ".composer [contenteditable=true]")
      .replaceAll(".composer-wrap textarea", ".composer-wrap [contenteditable=true]")
      .replaceAll(".chat textarea", ".chat [contenteditable=true]");
    if (["reason-chat.e2e.mjs", "slash-menu.e2e.mjs"].includes(name)) after = after.replace("return t ? t.value : null", "return t ? t.textContent : null");
    if (name === "reason-chat.e2e.mjs") after = after.replace('assert.equal(focus, "composer textarea"', 'assert.equal(focus, "composer div"');
    if (name === "terminal-focus.e2e.mjs") after = after.replace("box.inputValue()", "box.textContent()");
    if (name === "chat-status.browser.mjs") after = after.replaceAll('box.getAttribute("placeholder")', 'box.getAttribute("data-placeholder")');
    if (name === "slash-menu.e2e.mjs") after = after.replace("Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, '');\n    t.dispatchEvent(new Event('input', { bubbles: true }));", "t.focus(); const selection = getSelection(); selection.selectAllChildren(t);\n    document.execCommand('delete');");
    if (name === "transcript-parity.e2e.mjs") {
      after = after.replace("Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, arguments[0]);\n     ta.dispatchEvent(new Event('input', { bubbles: true }));", "ta.focus(); const selection = getSelection(); selection.selectAllChildren(ta);\n     document.execCommand('insertText', false, arguments[0]);");
      after = after.replace("[contenteditable=true]').value ===", "[contenteditable=true]').textContent ===");
      after = after.replace("Sets the composer's text through React's native value setter and an input\n * event", "Sets the composer's text through a normal contenteditable insertText edit");
    }
    if (after !== before) { changed.push(file); if (write) fs.writeFileSync(file, after); }
  }
}
console.log(JSON.stringify({ mode: write ? "write" : "check", changed }, null, 2));
if (!write && changed.length) process.exitCode = 1;
