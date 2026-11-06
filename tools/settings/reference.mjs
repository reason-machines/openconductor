// Start only through the supervised preview service; no extra server is spawned.
import "../screens/server.mjs";
if (process.env.CAPTURE_SETTINGS) {
  void import("./capture.mjs").catch((error) => console.error("SETTINGS_CAPTURE_FAILED", error));
}
