// Small inline stroke icons drawn for OpenConductor (no third-party icon assets).
type P = { size?: number };
const base = (size = 16) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const FolderIcon = ({ size }: P) => (<svg {...base(size)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>);
export const CloudIcon = ({ size }: P) => (<svg {...base(size)}><path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z" /><path d="M12 11v6m-3-3 3 3 3-3" /></svg>);
export const SparkIcon = ({ size }: P) => (<svg {...base(size)}><path d="M12 3c.6 4.8 2.2 6.4 7 7-4.8.6-6.4 2.2-7 7-.6-4.8-2.2-6.4-7-7 4.8-.6 6.4-2.2 7-7z" /></svg>);
export const HomeIcon = ({ size }: P) => (<svg {...base(size)}><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></svg>);
export const SidebarIcon = ({ size }: P) => (<svg {...base(size)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>);
export const PlusIcon = ({ size }: P) => (<svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>);
export const ChevronIcon = ({ size, open }: P & { open?: boolean }) => (<svg {...base(size)} style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform .12s" }}><path d="m9 6 6 6-6 6" /></svg>);
export const BranchIcon = ({ size }: P) => (<svg {...base(size)}><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="7" r="2" /><path d="M6 7v10M18 9c0 5-6 4-12 8" /></svg>);
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
