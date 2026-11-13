export const SOUND_OPTIONS = [
  { value: "disabled", label: "No sound", group: "" },
  { value: "default", label: "Chime", group: "Classic" },
  { value: "choo-choo", label: "Choo Choo", group: "Classic" },
  { value: "odysseus-pluck", label: "Odysseus's Pluck", group: "Novelty" },
  { value: "fahhhh", label: "Fahhhh", group: "Novelty" },
  { value: "quack", label: "Quack", group: "Novelty" },
  { value: "sf-muni-inbound-train-chime", label: "Inbound train", group: "SF Muni" },
  { value: "sf-muni-new", label: "Gong", group: "SF Muni" },
  { value: "nyc-metro-door-chime", label: "Chime 1", group: "NYC MTA" },
  { value: "nyc-subway-door-chime", label: "Chime 2", group: "NYC MTA" },
  { value: "nyc-subway", label: "Stand clear", group: "NYC MTA" },
  { value: "paris-metro-chime", label: "Chime", group: "Paris Métro" },
  { value: "paris-metro-pickpockets", label: "Attention aux pickpockets", group: "Paris Métro" },
  { value: "sncf-jingle", label: "Jingle", group: "SNCF" },
] as const;

export type SoundType = (typeof SOUND_OPTIONS)[number]["value"];

let ctx: AudioContext | null = null;

/** Original recordings are not distributed; audible IDs use this synthesized fallback. */
export function playCompletionSound(sound: string): void {
  if (sound === "disabled" || sound === "none" || typeof AudioContext === "undefined") return;
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
    osc.connect(gain);
    gain.connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.65);
  });
}
