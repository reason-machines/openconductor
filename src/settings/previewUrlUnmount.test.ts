// Conductor Rebuild: actual-row lifecycle callbacks with synthetic IPC/timers.
// Retained original JavaScript is inert reference data, never evaluated here.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("../../evidence/settings/preview-url-unmount/unmount.test.cjs");
require("../../evidence/settings/preview-url-unmount/ownership.test.cjs");
require("../../evidence/settings/preview-url-unmount/lifecycle.test.cjs");
require("../../evidence/settings/preview-url-unmount/cancellation.test.cjs");
