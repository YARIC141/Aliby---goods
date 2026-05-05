// Aliby brand marks + iconography
// Exports to window: AlibyMark, AlibyWordmark, AlibyLockup, Icon

function AlibyMark({ size = 48, color = 'currentColor', bg = 'transparent' }) {
  // Stylized A inside a rounded square. Simple but premium.
  const r = size * 0.22;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-label="Aliby">
      {bg !== 'transparent' && <rect width="64" height="64" rx={r} fill={bg} />}
      {/* triangle silhouette letter A with crossbar slot, plus a 'period' dot — alibi/proof glyph */}
      <path
        d="M14 48 L30 14 C31 12 33 12 34 14 L50 48"
        fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round"
      />
      <line x1="22" y1="36" x2="42" y2="36" stroke={color} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="50" cy="48" r="2.6" fill={color} />
    </svg>
  );
}

function AlibyWordmark({ size = 28, color = 'currentColor' }) {
  // Wordmark uses Instrument Serif for warmth + a small dot punctuation.
  return (
    <span style={{
      fontFamily: 'Instrument Serif, Georgia, serif',
      fontSize: size, lineHeight: 1, color, letterSpacing: '-0.01em',
      display: 'inline-flex', alignItems: 'baseline', gap: size * 0.05,
    }}>
      <span>Aliby</span>
      <span style={{
        width: size * 0.12, height: size * 0.12, borderRadius: '50%',
        background: 'var(--accent)', alignSelf: 'flex-end', marginBottom: size * 0.08,
      }} />
    </span>
  );
}

function AlibyLockup({ size = 40, tagline = 'food, with proof', color = 'currentColor' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.32 }}>
      <AlibyMark size={size} color="var(--accent)" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, color }}>
        <AlibyWordmark size={size * 0.78} color={color} />
        {tagline && (
          <span style={{
            font: '400 ' + (size * 0.22) + 'px/1.2 JetBrains Mono, ui-monospace, monospace',
            color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'lowercase',
          }}>{tagline}</span>
        )}
      </div>
    </div>
  );
}

// Lightweight line-icon set — 1.5px stroke, 24px viewBox.
const ICON_PATHS = {
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14',
  store: 'M3 9l1-5h16l1 5M5 9v11h14V9M9 13h6',
  menu: 'M4 6h16M4 12h16M4 18h10',
  cart: 'M4 5h2l3 11h11l2-8H7M10 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  ticket: 'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V9zM10 7v10',
  box: 'M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M12 11v10',
  user: 'M5 21a7 7 0 0 1 14 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  bell: 'M6 9a6 6 0 0 1 12 0c0 5 2 7 2 7H4s2-2 2-7zm4 11a2 2 0 0 0 4 0',
  search: 'M21 21l-5-5M16.5 11a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M6 18L18 6',
  check: 'M5 12l5 5L20 7',
  arrowR: 'M5 12h14M13 6l6 6-6 6',
  arrowL: 'M19 12H5M11 6l-6 6 6 6',
  back: 'M5 12h14M11 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  star: 'M12 3l2.7 6 6.3.6-4.8 4.4 1.5 6.5L12 17l-5.7 3.5L7.8 14 3 9.6l6.3-.6L12 3z',
  heart: 'M12 20s-7-4.5-7-11a4 4 0 0 1 7-2.6A4 4 0 0 1 19 9c0 6.5-7 11-7 11z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  geo: 'M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  filter: 'M4 6h16M7 12h10M10 18h4',
  sun: 'M12 4V2m0 20v-2M4 12H2m20 0h-2M6 6L5 5m14 14l-1-1M6 18l-1 1M19 5l-1 1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  moon: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9.4 4l-2-1.2.4-2.3-2-1.1-1.7 1.5L14 8 13.5 6h-3L10 8l-2 .9-1.7-1.5-2 1.1.4 2.3-2 1.2 2 1.2-.4 2.3 2 1.1 1.7-1.5L10 16l.5 2h3l.5-2 2-.9 1.7 1.5 2-1.1-.4-2.3 2-1.2z',
  trash: 'M5 7h14M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13',
  edit: 'M4 20l4-1 11-11-3-3L5 16l-1 4zm10-13l3 3',
  card: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8zm0 4h18',
  layers: 'M12 2l9 5-9 5-9-5 9-5zm-9 9l9 5 9-5m-18 4l9 5 9-5',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  flame: 'M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 1.5-2 2-3 1 0-2-1-4-3-6-1 4-5 6-5 11 0 5 3 8 7 8z',
  trend: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zm5 0h2v2h-2zm-2 5h2v2h-2zm4 0h2v2h-2zm0-3h2v2h-2z',
  copy: 'M9 3h10a2 2 0 0 1 2 2v10M5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M4 19h16',
  upload: 'M12 21V9m0 0l-4 4m4-4l4 4M4 5h16',
  warn: 'M12 3l10 18H2L12 3zm0 7v5m0 3v.5',
  info: 'M12 8h.01M11 12h1v5h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  pin: 'M12 22s-7-7-7-12a7 7 0 1 1 14 0c0 5-7 12-7 12z',
};

function Icon({ name, size = 20, stroke = 1.6, color = 'currentColor', style }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

Object.assign(window, { AlibyMark, AlibyWordmark, AlibyLockup, Icon, ICON_PATHS });
