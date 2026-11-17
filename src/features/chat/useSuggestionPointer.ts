import { useEffect, useState } from "react";

export function useSuggestionPointer(focused: number, onFocus: (index: number) => void, enabled: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    const moved = () => setReady(true);
    document.addEventListener("mousemove", moved, { once: true });
    return () => document.removeEventListener("mousemove", moved);
  }, [ready]);
  useEffect(() => {
    if (enabled) setReady(false);
  }, [enabled]);
  return (index: number) => {
    if (ready && index !== focused) onFocus(index);
  };
}
