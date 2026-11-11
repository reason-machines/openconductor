import { fileURLToPath } from "node:url";

process.env.OPENCONDUCTOR_SOURCE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = new URL("../../../tests/chat-disclosure/disclosureRemount.component.test.mjs", import.meta.url);
await import(fixture.href);
