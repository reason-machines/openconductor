export function outputUpdate(previous: string, next: string): { reset: boolean; data: string } {
  return next.startsWith(previous)
    ? { reset: false, data: next.slice(previous.length) }
    : { reset: true, data: next };
}
