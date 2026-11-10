interface SectionEmoji {
  emoji: string;
  label: string;
  keywords: string;
}

const choices: readonly SectionEmoji[] = [
  { emoji: "🔥", label: "fire", keywords: "flame hot" },
  { emoji: "🚀", label: "rocket", keywords: "launch" },
  { emoji: "⭐", label: "star", keywords: "favorite" },
  { emoji: "✅", label: "check mark button", keywords: "done complete" },
  { emoji: "🐛", label: "bug", keywords: "insect" },
  { emoji: "🧪", label: "test tube", keywords: "lab experiment" },
  { emoji: "🛠️", label: "hammer and wrench", keywords: "tools" },
  { emoji: "📦", label: "package", keywords: "box" },
  { emoji: "🎨", label: "artist palette", keywords: "art design paint" },
  { emoji: "📝", label: "memo", keywords: "notes pencil" },
  { emoji: "💡", label: "light bulb", keywords: "idea" },
  { emoji: "🔒", label: "locked", keywords: "lock security" },
  { emoji: "⚡", label: "high voltage", keywords: "zap lightning bolt" },
  { emoji: "🌱", label: "seedling", keywords: "sprout plant" },
  { emoji: "🧹", label: "broom", keywords: "clean sweep" },
  { emoji: "📌", label: "pushpin", keywords: "pin" },
  { emoji: "🎯", label: "bullseye", keywords: "target" },
  { emoji: "🧭", label: "compass", keywords: "navigation" },
  { emoji: "🏗️", label: "building construction", keywords: "crane" },
  { emoji: "🔍", label: "magnifying glass tilted left", keywords: "search find" },
];

export const SECTION_EMOJIS = choices.map(({ emoji }) => emoji);

export function searchSectionEmoji(query: string): readonly SectionEmoji[] {
  const normalized = query.trim().toLowerCase();
  return normalized === "" ? choices : choices.filter(({ label, keywords }) => `${label} ${keywords}`.includes(normalized));
}
