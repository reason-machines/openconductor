type Pending = { url: string; resolve: () => void; reject: (error: Error) => void };
export const requests: Pending[] = [];
export const errors: string[] = [];
export let closes = 0;
export function closed() { closes++; }
export function openUrl(url: string) {
  return new Promise<void>((resolve, reject) => { requests.push({ url, resolve, reject }); });
}
export function settle(kind: "resolve" | "reject") {
  const request = requests[requests.length - 1];
  if (!request) return;
  if (kind === "resolve") request.resolve();
  else request.reject(new Error("Synthetic opener rejection"));
}
window.addEventListener("error", (event) => errors.push(String(event.message)));
window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
