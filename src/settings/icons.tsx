// Stroke icons for the settings navigation and rows, drawn for OpenConductor
// (no third-party icon assets). Each matches the role of the icon Conductor
// shows beside the same nav item or button.
type P = { size?: number };
const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const SlidersIcon = ({ size }: P) => (<svg {...base(size)}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>);
export const UserCircleIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.6 18.4a6.5 6.5 0 0 1 10.8 0" /></svg>);
export const PaletteIcon = ({ size }: P) => (<svg {...base(size)}><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.2-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></svg>);
export const KeyboardIcon = ({ size }: P) => (<svg {...base(size)}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>);
export const ChipIcon = ({ size }: P) => (<svg {...base(size)}><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></svg>);
export const GitIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="6" cy="18" r="2" /><circle cx="6" cy="6" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 8v8M18 10c0 4-5 4-11 7" /></svg>);
export const AgentIcon = ({ size }: P) => (<svg {...base(size)}><path d="M5 20h14M7 20v-6a5 5 0 0 1 10 0v6" /><path d="M10 5.5 12 3l2 2.5" /><path d="M12 3v6" /></svg>);
export const KeyIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="8" cy="15" r="4" /><path d="m10.8 12.2 8.7-8.7M16 7l2.5 2.5M14 9l1.5 1.5" /></svg>);
export const FlaskIcon = ({ size }: P) => (<svg {...base(size)}><path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" /><path d="M7.5 15h9" /></svg>);
export const DriveIcon = ({ size }: P) => (<svg {...base(size)}><path d="M3 13 6 5h12l3 8" /><rect x="3" y="13" width="18" height="6" rx="2" /><path d="M7 16h.01M11 16h.01" /></svg>);
export const TerminalIcon = ({ size }: P) => (<svg {...base(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M13 15h4" /></svg>);
export const BackIcon = ({ size = 14 }: P) => (<svg {...base(size)}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>);
export const VolumeIcon = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /></svg>);
export const SyncIcon = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>);
export const FolderIcon = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>);
export const PlusIcon = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const LogOutIcon = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>);
export const GitHubMarkIcon = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.5 6-6.6a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.7 0C5.6 1 4.5 1.3 4.5 1.3a4.8 4.8 0 0 0-.1 3.6A5.2 5.2 0 0 0 3 8.5c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.4V21" /></svg>);
export const LinkIcon = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>);
export const RefreshIcon = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M20 11a8 8 0 0 0-14.9-3.5M4 4v4h4M4 13a8 8 0 0 0 14.9 3.5M20 20v-4h-4" /></svg>);
export const CloseIcon = ({ size = 16 }: P) => (<svg {...base(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
