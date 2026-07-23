/** Professional inline SVG icons — no emoji, consistent stroke style. */

type IconProps = { size?: number; className?: string };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconFolder({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2L11 8.5h8.5A1.5 1.5 0 0 1 21 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-10Z" />
    </svg>
  );
}

export function IconFile({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M7 3.5h6.5L19 9v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z" />
      <path {...stroke} d="M13.5 3.5V9H19" />
    </svg>
  );
}

export function IconDevices({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect {...stroke} x="2.5" y="5" width="8" height="12" rx="1.5" />
      <rect {...stroke} x="13.5" y="7" width="8" height="12" rx="1.5" />
      <path {...stroke} d="M10.5 11h3" />
    </svg>
  );
}

export function IconCopy({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect {...stroke} x="8" y="8" width="12" height="12" rx="2" />
      <path {...stroke} d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconSettings({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle {...stroke} cx="12" cy="12" r="3" />
      <path
        {...stroke}
        d="M12 3.5v2.2M12 18.3V20.5M4.9 6.5l1.6 1.6M17.5 15.9l1.6 1.6M3.5 12h2.2M18.3 12H20.5M4.9 17.5l1.6-1.6M17.5 8.1l1.6-1.6"
      />
    </svg>
  );
}

export function IconActivity({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M3 12h4l2.5-6 3 12L15.5 12H21" />
    </svg>
  );
}

export function IconSleep({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M16 4a8 8 0 1 0 4 12.5A7 7 0 0 1 16 4Z" />
    </svg>
  );
}

export function IconWake({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle {...stroke} cx="12" cy="12" r="4" />
      <path {...stroke} d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2l1.8 1.8M17 17l1.8 1.8M5.2 18.8l1.8-1.8M17 7l1.8-1.8" />
    </svg>
  );
}

export function IconShield({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="M12 3 5 6.5v5.2c0 4.2 2.9 7.2 7 8.3 4.1-1.1 7-4.1 7-8.3V6.5L12 3Z" />
      <path {...stroke} d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconCheck({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path {...stroke} d="m5 12 5 5L20 7" />
    </svg>
  );
}

export function IconPorterMark({ size = 40, className }: IconProps) {
  // Vector mark — stays sharp at any DPI (PNG was blurry when upscaled from 32px)
  const r = Math.max(6, size * 0.22);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
      style={{ borderRadius: r, display: "block", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="porterGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#187868" />
          <stop offset="100%" stopColor="#084840" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#porterGrad)" />
      <rect x="12" y="18" width="14" height="28" rx="3" fill="none" stroke="#FFFCF7" strokeWidth="2.5" />
      <rect x="38" y="18" width="14" height="28" rx="3" fill="none" stroke="#FFFCF7" strokeWidth="2.5" />
      <rect x="14.5" y="21" width="9" height="5" rx="1.2" fill="#FFFCF7" opacity="0.35" />
      <rect x="40.5" y="21" width="9" height="5" rx="1.2" fill="#FFFCF7" opacity="0.35" />
      <line x1="26" y1="32" x2="38" y2="32" stroke="#FFFCF7" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="3.2" fill="#FFFCF7" />
    </svg>
  );
}
