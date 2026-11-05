// Conductor shows no terminal in its default workspace layout; ⌘J
// (view.toggleTerminalPanel) shows the terminal panel. Terminal tests open it
// that way before they look for a terminal.
export async function showTerminalPanel(page) {
  await page.locator(".ws-header").waitFor();
  await page.keyboard.press("Meta+j");
  await page.locator(".terminal-panel").waitFor();
}
