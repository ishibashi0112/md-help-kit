// UI のアイコン。線の太さと形は reference/ の見本に合わせる
import type { ReactNode } from "react";

function Icon({ size = 18, children }: { size?: number; children: ReactNode }): ReactNode {
  return (
    <svg
      className="mhk-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const BackIcon = () => (
  <Icon>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);

export const ContentsIcon = () => (
  <Icon>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon size={16}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Icon>
);

export const HelpIcon = () => (
  <Icon size={20}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5" />
  </Icon>
);

/** 注意書きの種別ごとのアイコン（6.3節） */
export const alertIcons: Record<string, () => ReactNode> = {
  note: () => (
    <Icon size={16}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.5" />
    </Icon>
  ),
  tip: () => (
    <Icon size={16}>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </Icon>
  ),
  important: () => (
    <Icon size={16}>
      <path d="M5 4h14v12H10l-5 4z" />
      <path d="M12 7.5v3.5M12 13.5v.5" />
    </Icon>
  ),
  warning: () => (
    <Icon size={16}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.5" />
    </Icon>
  ),
  caution: () => (
    <Icon size={16}>
      <path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" />
      <path d="M12 8v5M12 16v.5" />
    </Icon>
  ),
};
