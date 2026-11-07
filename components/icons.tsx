/**
 * Inline icons.
 *
 * Hand-written rather than pulled from an icon package: there are nine of them,
 * they inherit `currentColor`, and it keeps the dependency list short.
 */

type IconProps = { className?: string };

const base = 'h-[1.1em] w-[1.1em] shrink-0';

function wrap(children: React.ReactNode, className?: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? base}
    >
      {children}
    </svg>
  );
}

export const IconGrid = ({ className }: IconProps) =>
  wrap(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>,
    className,
  );

export const IconSparkle = ({ className }: IconProps) =>
  wrap(
    <>
      <path d="M12 3l1.9 4.9L18.8 10l-4.9 2.1L12 17l-1.9-4.9L5.2 10l4.9-2.1z" />
      <path d="M19 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </>,
    className,
  );

export const IconList = ({ className }: IconProps) =>
  wrap(
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="3.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
    </>,
    className,
  );

export const IconSettings = ({ className }: IconProps) =>
  wrap(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.6 1.7 1.7 0 00-1.9.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1.1 1.7 1.7 0 00-.4-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </>,
    className,
  );

export const IconWallet = ({ className }: IconProps) =>
  wrap(
    <>
      <path d="M3 8a2 2 0 012-2h12a2 2 0 012 2" />
      <rect x="3" y="8" width="18" height="12" rx="2.5" />
      <path d="M16 14h2" />
    </>,
    className,
  );

export const IconSend = ({ className }: IconProps) =>
  wrap(<path d="M4.5 12l15.5-7.5-5 15.5-3.2-6.2z" />, className);

export const IconCheck = ({ className }: IconProps) =>
  wrap(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>,
    className,
  );

export const IconAlert = ({ className }: IconProps) =>
  wrap(
    <>
      <path d="M10.3 3.9L2.5 17.4A1.9 1.9 0 004.2 20h15.6a1.9 1.9 0 001.7-2.6L13.7 3.9a1.9 1.9 0 00-3.4 0z" />
      <path d="M12 9v4M12 16.5h.01" />
    </>,
    className,
  );

export const IconExternal = ({ className }: IconProps) =>
  wrap(
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M19 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h4" />
    </>,
    className,
  );

export const IconCopy = ({ className }: IconProps) =>
  wrap(
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7a2 2 0 002 2h3" />
    </>,
    className,
  );

export const IconShield = ({ className }: IconProps) =>
  wrap(
    <>
      <path d="M12 3l7.5 3v6c0 4.4-3.1 8.2-7.5 9.3C7.6 20.2 4.5 16.4 4.5 12V6z" />
      <path d="M9 12.2l2.2 2.2 3.8-4.2" />
    </>,
    className,
  );

export const IconRefresh = ({ className }: IconProps) =>
  wrap(
    <>
      <path d="M20 11a8 8 0 10-2.6 6.3" />
      <path d="M20 5v6h-6" />
    </>,
    className,
  );
