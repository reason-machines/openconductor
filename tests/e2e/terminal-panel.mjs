// Terminals live in the right panel's Setup / Run / Terminal strip, as in
// Conductor; the workspace opens with Run selected and no terminal. Terminal
// tests show one the way a user does: the strip's current terminal tab, or +
// ("New terminal") when the workspace has none yet. The strip is shown first
// if ⌘J hid it.
export async function showTerminalPanel(page) {
  await page.locator(".ws-header").waitFor();
  await page.locator(".ws-strip[data-terminals-ready]").waitFor();
  const show = page.getByRole("button", { name: "Show terminal panel" });
  if (await show.count()) await show.click();
  const current = page.locator(".ws-strip .term-tab[data-current]");
  if (await current.count()) await current.click();
  else await page.getByRole("button", { name: "New terminal" }).click();
  await page.locator(".terminal-panel").waitFor();
}
