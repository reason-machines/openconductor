import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const run = promisify(execFile);
const output = path.resolve(process.env.SHELL_OUT ?? '.oc-tmp/sidebar-group');
fs.mkdirSync(output, { recursive: true });
const manifest = path.join(output, 'captures.json');
const captures = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, 'utf8')) : {};
for (const side of (process.env.GROUP_SIDES ?? 'oc').split(',')) {
  for (const theme of (process.env.SHELL_THEMES ?? 'dark,light').split(',')) {
    for (const state of (process.env.GROUP_STATES ?? 'menu,status,expanded,project').split(',')) {
      const click = (step_id, selector) => ({ step_id, action: 'click', locator: { kind: 'css', selector }, timeout_ms: 5000 });
      const name = `${side}-${state}-${theme}`;
      const input = {
        browser: { mode: 'launch', executable_path: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true },
        start_url: { url: `http://${side === 'ref' ? 'conductor.localhost' : 'localhost'}:4682/?oc_scenario=populated&oc_org=local&oc_sort_fixture=1&oc_group_fixture=1&oc_theme=${theme}` },
        environment: { viewport: { width: 1280, height: 820, device_scale_factor: 1 }, color_scheme: theme, locale: 'en-US', timezone: 'UTC' },
        actions: [
          { step_id: 'settle', action: 'wait_for_timeout', duration_ms: 3000 },
          click('header', 'button[aria-label="My workspaces actions"]'),
          click('group', '[role="menuitem"]:has-text("Group by")'),
          ...(state !== 'menu' ? [click('status', '[role="menuitemradio"]:has-text("Status")')] : []),
          ...(['expanded', 'project'].includes(state) ? [click('expand', 'aside span:text-is("In progress")')] : []),
          ...(state === 'project' ? [
            click('header-again', 'button[aria-label="My workspaces actions"]'),
            click('group-again', '[role="menuitem"]:has-text("Group by")'),
            click('project', '[role="menuitemradio"]:has-text("Project")'),
          ] : []),
          { step_id: 'final', action: 'wait_for_timeout', duration_ms: 500 },
        ],
        capture: { at_end: ['screenshot', 'dom', 'url'], events: ['console', 'page-errors'] },
      };
      const inputPath = path.join(output, `${name}.input.json`);
      fs.writeFileSync(inputPath, JSON.stringify(input, null, 2));
      let result;
      try {
        result = await run(process.env.REA ?? '/home/runner/rea/node_modules/.bin/rea', ['capture-browser-scenario', inputPath, '--format', 'json'], { maxBuffer: 32 * 1024 * 1024, timeout: 60000 });
      } catch (error) {
        fs.writeFileSync(path.join(output, `${name}.failure.json`), error.stdout || JSON.stringify({ error: error.message }));
        throw error;
      }
      const ev = JSON.parse(result.stdout);
      const artifacts = ev.normalized_result?.steps?.at(-1)?.artifacts;
      if (artifacts?.screenshot?.state !== 'captured') {
        fs.writeFileSync(path.join(output, `${name}.failure.json`), JSON.stringify(ev, null, 2));
        throw new Error(`${name}: screenshot not captured`);
      }
      const png = Buffer.from(artifacts.screenshot.value.data_base64, 'base64');
      fs.writeFileSync(path.join(output, `${name}.png`), png);
      fs.writeFileSync(path.join(output, `${name}.dom.json`), JSON.stringify(artifacts.dom, null, 2));
      captures[name] = { evidence_id: ev.evidence_id, sha256: createHash('sha256').update(png).digest('hex') };
      fs.writeFileSync(manifest, JSON.stringify(captures, null, 2));
      console.log(`${name}: ${ev.evidence_id}`);
    }
  }
}
