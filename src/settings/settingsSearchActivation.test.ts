// The frozen mounted regression loads the actual SettingsView and SettingsSearch.
// Its retained original-source contract is data only; no Conductor code is evaluated.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("../../evidence/settings/search-activation/activation.test.cjs");
