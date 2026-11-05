// Emoji offered by the repository icon picker, with search names. Conductor's
// picker loads a full emoji dataset; this is a curated subset for now.
export const REPO_EMOJI: [emoji: string, name: string][] = [
  ["🚀", "rocket launch"], ["⚡", "zap lightning bolt"], ["🔥", "fire flame"], ["✨", "sparkles"], ["⭐", "star"], ["🌟", "glowing star"],
  ["💎", "gem diamond"], ["🎯", "target bullseye"], ["🧠", "brain"], ["🤖", "robot bot"], ["👾", "alien monster game"], ["🎮", "video game controller"],
  ["🧪", "test tube lab"], ["🔬", "microscope science"], ["🧬", "dna"], ["⚙️", "gear settings"], ["🔧", "wrench tool"], ["🔨", "hammer"],
  ["🛠️", "hammer and wrench tools"], ["🧰", "toolbox"], ["🔌", "plug"], ["💡", "light bulb idea"], ["🔋", "battery"], ["🖥️", "desktop computer"],
  ["💻", "laptop computer"], ["⌨️", "keyboard"], ["🖱️", "mouse"], ["📱", "mobile phone"], ["📦", "package box"], ["📚", "books library"],
  ["📖", "open book docs"], ["📝", "memo notes"], ["📊", "bar chart"], ["📈", "chart increasing"], ["🗂️", "card index dividers"], ["📁", "folder"],
  ["🗄️", "file cabinet"], ["🗃️", "card file box"], ["🔒", "lock"], ["🔑", "key"], ["🛡️", "shield security"], ["🧩", "puzzle piece"],
  ["🎨", "palette art design"], ["🖌️", "paintbrush"], ["✏️", "pencil"], ["🖋️", "pen"], ["📐", "triangular ruler"], ["📏", "ruler"],
  ["🌍", "globe earth"], ["🌐", "globe network web"], ["🗺️", "map"], ["🧭", "compass"], ["🏠", "house home"], ["🏗️", "construction building"],
  ["🏢", "office building"], ["🏭", "factory"], ["🏰", "castle"], ["⛺", "tent"], ["🌲", "evergreen tree"], ["🌴", "palm tree"],
  ["🌱", "seedling sprout"], ["🍀", "four leaf clover"], ["🌸", "cherry blossom flower"], ["🌻", "sunflower"], ["🍄", "mushroom"], ["🌊", "wave water"],
  ["☀️", "sun"], ["🌙", "moon"], ["⛅", "cloud sun"], ["❄️", "snowflake"], ["🌈", "rainbow"], ["☁️", "cloud"],
  ["🐙", "octopus"], ["🐳", "whale docker"], ["🐍", "snake python"], ["🦀", "crab rust"], ["🐹", "hamster"], ["🦊", "fox"],
  ["🐶", "dog"], ["🐱", "cat"], ["🐼", "panda"], ["🦉", "owl"], ["🐝", "bee"], ["🦋", "butterfly"],
  ["🐢", "turtle"], ["🦄", "unicorn"], ["🐉", "dragon"], ["🦖", "dinosaur t-rex"], ["🐧", "penguin linux"], ["🦜", "parrot"],
  ["🍎", "apple"], ["🍋", "lemon"], ["🍕", "pizza"], ["🍔", "hamburger"], ["🌮", "taco"], ["🍩", "doughnut"],
  ["🍪", "cookie"], ["☕", "coffee"], ["🍵", "tea"], ["🍺", "beer"], ["🧁", "cupcake"], ["🍿", "popcorn"],
  ["⚽", "soccer ball"], ["🏀", "basketball"], ["🎲", "game die"], ["♟️", "chess pawn"], ["🎸", "guitar music"], ["🎹", "piano music"],
  ["🎧", "headphones audio"], ["🎤", "microphone"], ["🎬", "clapper film"], ["📷", "camera photo"], ["🎵", "music note"], ["🔔", "bell notification"],
  ["💬", "speech bubble chat"], ["📣", "megaphone"], ["✉️", "envelope mail"], ["📮", "postbox"], ["📡", "satellite antenna"], ["🛰️", "satellite"],
  ["✈️", "airplane"], ["🚗", "car"], ["🚂", "locomotive train"], ["🚢", "ship"], ["⛵", "sailboat"], ["🚲", "bicycle"],
  ["💰", "money bag"], ["💳", "credit card"], ["🏦", "bank"], ["🛒", "shopping cart"], ["🎁", "gift"], ["🏆", "trophy"],
  ["❤️", "red heart"], ["💜", "purple heart"], ["💙", "blue heart"], ["💚", "green heart"], ["🧡", "orange heart"], ["🖤", "black heart"],
  ["✅", "check mark done"], ["❌", "cross mark"], ["⚠️", "warning"], ["🚧", "construction sign"], ["♻️", "recycle"], ["🔮", "crystal ball"],
  ["😀", "grinning face smile"], ["😎", "sunglasses cool"], ["🤓", "nerd face"], ["🥳", "party face"], ["👻", "ghost"], ["💀", "skull"],
];

export function searchEmoji(query: string): [string, string][] {
  const q = query.trim().toLowerCase();
  return q ? REPO_EMOJI.filter(([, name]) => name.includes(q)) : REPO_EMOJI;
}
