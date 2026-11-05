// Small inline stroke icons drawn for OpenConductor (no third-party icon assets).
type P = { size?: number; strokeWidth?: number };
const base = (size = 16, strokeWidth = 1.8) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const FolderIcon = ({ size }: P) => (<svg {...base(size)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>);
export const CloudIcon = ({ size }: P) => (<svg {...base(size)}><path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z" /><path d="M12 11v6m-3-3 3 3 3-3" /></svg>);
export const SparkIcon = ({ size }: P) => (<svg {...base(size)}><path d="M12 3c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7z" /></svg>);
export const HomeIcon = ({ size }: P) => (<svg {...base(size)}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>);
export const SidebarIcon = ({ size }: P) => (<svg {...base(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>);
export const PlusIcon = ({ size }: P) => (<svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const ChevronIcon = ({ size, open }: P & { open?: boolean }) => (<svg {...base(size)} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform .12s" }}><path d="m9 6 6 6-6 6" /></svg>);
export const BranchIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="7" r="2" /><path d="M6 7v10M18 9c0 5-6 4-12 8" /></svg>);
export const PaperclipIcon = ({ size }: P) => (<svg {...base(size)}><path d="m21 11-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.3-2.4l7.9-7.9" /></svg>);
export const SendIcon = ({ size }: P) => (<svg {...base(size)}><path d="M5 12h13M13 6l6 6-6 6" /></svg>);
export const FileIcon = ({ size }: P) => (<svg {...base(size)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>);
export const KeyboardIcon = ({ size }: P) => (<svg {...base(size)}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>);
export const SearchIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const CloseIcon = ({ size }: P) => (<svg {...base(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const LockIcon = ({ size }: P) => (<svg {...base(size)} aria-hidden><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>);
export const ArchiveIcon = ({ size }: P) => (<svg {...base(size)}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></svg>);
export const LogoMark = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <rect x="1" y="1" width="22" height="22" rx="6" fill="#262e40" />
    <path d="M12 5.5c.35 3.9 1.9 5.6 6.5 6.5-4.6.9-6.15 2.6-6.5 6.5-.35-3.9-1.9-5.6-6.5-6.5 4.6-.9 6.15-2.6 6.5-6.5z" fill="#f4efde" />
    <circle cx="16.6" cy="7.6" r="1" fill="#e8b04b" />
  </svg>
);
export const ArrowLeftIcon = ({ size }: P) => (<svg {...base(size)}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>);
export const ArrowRightIcon = ({ size }: P) => (<svg {...base(size)}><path d="M5 12h14M12 5l7 7-7 7" /></svg>);
export const MoreIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>);
export const ChevronDownIcon = ({ size }: P) => (<svg {...base(size)}><path d="m6 9 6 6 6-6" /></svg>);
export const HelpIcon = ({ size, strokeWidth }: P) => (<svg {...base(size, strokeWidth)}><circle cx="12" cy="12" r="9.5" /><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.5-2.7 4M12 17.6h.01" /></svg>);
export const SettingsIcon = ({ size, strokeWidth }: P) => (<svg {...base(size, strokeWidth)}><path d="M9.81 4.93L10.39 2.64L13.61 2.64L14.19 4.93L15.45 5.45L17.48 4.24L19.76 6.52L18.55 8.55L19.07 9.81L21.36 10.39L21.36 13.61L19.07 14.19L18.55 15.45L19.76 17.48L17.48 19.76L15.45 18.55L14.19 19.07L13.61 21.36L10.39 21.36L9.81 19.07L8.55 18.55L6.52 19.76L4.24 17.48L5.45 15.45L4.93 14.19L2.64 13.61L2.64 10.39L4.93 9.81L5.45 8.55L4.24 6.52L6.52 4.24L8.55 5.45Z" /><circle cx="12" cy="12" r="3" /></svg>);
export const BookIcon = ({ size }: P) => (<svg {...base(size)}><path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6.5a2.5 2.5 0 0 0 0 5H19v-5" /></svg>);
export const MessageIcon = ({ size }: P) => (<svg {...base(size)}><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
export const ExternalIcon = ({ size }: P) => (<svg {...base(size)}><path d="M7 17 17 7M8 7h9v9" /></svg>);
export const FileCodeIcon = ({ size }: P) => (<svg {...base(size)}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M10 12.5 8.5 14l1.5 1.5M14 12.5l1.5 1.5-1.5 1.5" /></svg>);
/** A plain circled "N" standing in for the Next.js template mark. */
export const NextMarkIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M9 16.5v-9l7.5 10M15 7.5v5.5" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const GlobeIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>);
export const FolderPlusIcon = ({ size }: P) => (<svg {...base(size)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 10.5v5M9.5 13h5" /></svg>);
