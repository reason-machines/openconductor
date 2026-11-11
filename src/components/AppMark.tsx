/** Official neutral Reason mark; the source SVG is kept byte-for-byte. */
export function AppMark({ size = 20 }: { size?: number }) {
  const mask = 'url("/app-brand/reason-mark-mask.svg") center / contain no-repeat';
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        flexShrink: 0,
        width: size,
        height: size,
        backgroundColor: "currentColor",
        mask,
        WebkitMask: mask,
      }}
    />
  );
}
