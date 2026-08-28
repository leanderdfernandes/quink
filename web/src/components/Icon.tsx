import type { CSSProperties, ReactNode } from 'react'

// Lucide paths, inlined — the app has no icon package and v2 keeps it that way. One shared
// stroke preset, currentColor always, round caps and joins. Stroke is 1.75, not 2: against
// 16px body copy a 2px stroke reads heavier than the text beside it.
//
// Sizes: 15 inline · 17 default · 19 nav · 22 feature tiles. Nothing larger — an icon that
// grows past 22 has become an illustration, and the product's imagery is the user's own
// screenshots.
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const PATHS: Record<string, ReactNode> = {
  book: <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
  box: <><path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z" /><path d="M3 7l9 4.5L21 7M12 11.5V21.5" /></>,
  palette: <><circle cx="13.5" cy="6.5" r=".6" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".6" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".6" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".6" fill="currentColor" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z" /></>,
  external: <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 4 9 15 15 0 0 1-4 9 15 15 0 0 1-4-9 15 15 0 0 1 4-9Z" /></>,
  people: <><path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" /><circle cx="9" cy="7.5" r="3.5" /><path d="M17 4.2a3.5 3.5 0 0 1 0 6.6M22 20v-1.5a4 4 0 0 0-3-3.87" /></>,
  search: <><circle cx="11" cy="11" r="7.5" /><path d="m21 21-4.6-4.6" /></>,
  folder: <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />,
  'folder-plus': <><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /><path d="M12 10.5v6M9 13.5h6" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  trash: <><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></>,
  dots: <><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  chevron: <path d="M6 9.5l6 6 6-6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  check: <path d="M20 6.5 9 17.5l-5-5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></>,
  film: <><rect x="2.5" y="4" width="19" height="16" rx="2.5" /><path d="M7 4v16M17 4v16M2.5 12h19M2.5 8h4.5M2.5 16h4.5M17 8h4.5M17 16h4.5" /></>,
  image: <><rect x="3" y="3.5" width="18" height="17" rx="2.5" /><circle cx="8.75" cy="9.25" r="1.75" /><path d="m21 15.5-4.35-4.35a2 2 0 0 0-2.83 0L3 21.5" /></>,
  file: <><path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8Z" /><path d="M14 2.5V8h5.5" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
  eye: <><path d="M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12s-3.6 6.5-9.5 6.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.75" /></>,
  'eye-off': <><path d="M3 3l18 18" /><path d="M10.6 5.7A9.9 9.9 0 0 1 12 5.5c5.9 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.4 3.3" /><path d="M6.6 7.4A16.7 16.7 0 0 0 2.5 12s3.6 6.5 9.5 6.5a9.6 9.6 0 0 0 3.9-.8" /><path d="M9.7 9.9a2.75 2.75 0 0 0 3.9 3.9" /></>,
  sparkle: <><path d="M12 3.5l1.7 4.6 4.6 1.7-4.6 1.7L12 16.1l-1.7-4.6L5.7 9.8l4.6-1.7Z" /><path d="M18.5 16.5l.65 1.7 1.7.65-1.7.65-.65 1.7-.65-1.7-1.7-.65 1.7-.65Z" /></>,
  arrow: <path d="M5 12h13M12.5 6l6 6-6 6" />,
  'arrow-left': <path d="M19 12H6M11.5 6l-6 6 6 6" />,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  // --- state glyphs: these replaced the coloured dots ---
  'check-circle': <><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-4.9" /></>,
  'dot-circle': <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></>,
  'arrow-up-circle': <><circle cx="12" cy="12" r="9" /><path d="M12 16V8.5M8.6 11.9 12 8.5l3.4 3.4" /></>,
  alert: <><path d="M12 3.8 2.8 19.5h18.4L12 3.8Z" /><path d="M12 9.5v4.2" /><circle cx="12" cy="16.6" r=".8" fill="currentColor" stroke="none" /></>,
  'draft-circle': <><circle cx="12" cy="12" r="9" strokeDasharray="3 3" /></>,
  grip: <><circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" /></>,
  bold: <><path d="M7 4.5h6a3.75 3.75 0 0 1 0 7.5H7Z" /><path d="M7 12h6.75a3.75 3.75 0 0 1 0 7.5H7Z" /></>,
  italic: <path d="M15.5 4.5h-6M14 19.5H8M14.5 4.5 10 19.5" />,
  split: <><path d="M3 12h18" strokeDasharray="3 3" /><path d="M8 7.5 12 3.5l4 4M8 16.5l4 4 4-4" /></>,
  merge: <><path d="M12 3.5v7M12 20.5v-7" /><path d="M8.5 7 12 3.5 15.5 7M8.5 17 12 20.5 15.5 17" /></>,
}

export type IconName = keyof typeof PATHS

export default function Icon({
  name,
  size = 17,
  strokeWidth = 1.75,
  rotate,
  style,
}: {
  name: string
  size?: number
  strokeWidth?: number
  rotate?: number
  style?: CSSProperties
}) {
  const glyph = PATHS[name]
  if (!glyph) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...stroke}
      strokeWidth={strokeWidth}
      aria-hidden
      style={{
        flex: 'none',
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
        transition: rotate != null ? 'transform var(--dur-3) var(--ease)' : undefined,
        ...style,
      }}
    >
      {glyph}
    </svg>
  )
}
