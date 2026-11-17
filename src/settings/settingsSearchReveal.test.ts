// Conductor Rebuild: frozen actual-module and mounted search-target reveal regression.
// Original Conductor source is inert reference data, never evaluated by this test.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("../../evidence/settings/search-reveal/reveal.test.cjs");
