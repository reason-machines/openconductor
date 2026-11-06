const reference = process.argv[2] === "reference";
process.env.PORT ??= reference ? "4438" : "4437";
if (reference) {
  process.env.HOST = "0.0.0.0";
  await import("../screens/server.mjs");
} else {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { host: "0.0.0.0", port: Number(process.env.PORT), strictPort: true } });
  await server.listen();
}
try {
  if (process.env.CAPTURE_LINKED_DIRECTORY === "1") await import("./capture.mjs");
  if (process.env.CHECK_LINKED_DIRECTORY === "1") await import("./check.mjs");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
