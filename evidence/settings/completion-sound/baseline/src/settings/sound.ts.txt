// The completion sound. Conductor ships its own recordings (`kue` in
// index-BGEQ8YjU.js: "No sound", "Chime", "Choo Choo", transit chimes); those
// are its assets, so OpenConductor offers "No sound" and a "Chime" it
// synthesizes with WebAudio.
import type { SoundType } from "./types";

export const SOUND_OPTIONS: { value: SoundType; label: string }[] = [
  { value: "none", label: "No sound" },
  { value: "default", label: "Chime" },
];

let ctx: AudioContext | null = null;

/** Two soft sine notes (E6 then A6); nothing for "none" or without WebAudio. */
export function playCompletionSound(sound: SoundType): void {
  if (sound === "none" || typeof AudioContext === "undefined") return;
  ctx ??= new AudioContext();
  const now = ctx.currentTime;
  [1318.5, 1760].forEach((freq, i) => {
    const start = now + i * 0.12;
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}
