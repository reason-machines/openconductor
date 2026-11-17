# Official xterm web-link API grounding

Task: add the existing official plain-text HTTP(S) provider to the ordinary terminal, separately from encoded OSC8 links.

Sources read (xterm.js 6.0.0 tag):
- https://raw.githubusercontent.com/xtermjs/xterm.js/6.0.0/addons/addon-web-links/README.md — supports xterm v4+, load via Terminal.loadAddon.
- https://raw.githubusercontent.com/xtermjs/xterm.js/6.0.0/addons/addon-web-links/typings/addon-web-links.d.ts — constructor(handler?: (event: MouseEvent, uri: string) => void, options?: ILinkProviderOptions), activate(Terminal), dispose().
- https://raw.githubusercontent.com/xtermjs/xterm.js/6.0.0/addons/addon-web-links/src/WebLinksAddon.ts — default HTTP(S) regex matches retained HJs; activation registers WebLinkProvider; disposal unregisters it. Supply a handler to avoid default window.open.
- npm registry metadata for @xterm/addon-web-links@0.12.0 — official xtermjs/xterm.js package, no runtime dependencies. Integrity recorded in addon-metadata.json. Existing app xterm version is 6.0.0.

Retained Conductor lno explicitly supplies Meta-gated direct vs opener for WJs, separate from warning-based encoded linkHandler. Reuse openUrl bridge and catch rejection; do not use default browser window.open, confirmation, a generic bridge or custom URL detector. Native hit-testing and browser behavior remain unverified.
