// Vite's `?worker` import of Pierre's worker script: a constructor for a module Worker.
declare module "@pierre/diffs/worker/worker.js?worker" {
  const PierreWorker: new (options?: { name?: string }) => Worker;
  export default PierreWorker;
}
