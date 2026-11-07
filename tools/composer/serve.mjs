// Keep the server and its browser checks in the same preview network namespace.
const reference = process.argv[2] === "reference";
if (reference) {
  process.env.HOST = "0.0.0.0";
  process.env.PORT ??= "4428";
  await import("../screens/server.mjs");
} else {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { host: "0.0.0.0", port: Number(process.env.PORT ?? 4427), strictPort: true } });
  await server.listen();
}
try {
  if (process.env.CHECK_COMPOSER === "1") {
    for (let pass = 0; pass < Number(process.env.CHECK_COMPOSER_REPEATS ?? 1); pass++) await import(`./check.mjs?pass=${pass}`);
  }
  if (process.env.CHECK_MODEL_SEARCH === "1") await import("./model-search.check.mjs");
  if (process.env.CAPTURE_COMPOSER === "1") await import("./capture.mjs");
} catch (error) {
  console.error(error);
}
