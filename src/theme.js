// Single source of truth for the app's design tokens — colors, typography,
// shape, elevation and spacing — mirrored from the web frontend's
// (light-only) design system so the two platforms stay visually consistent.
// Import from here instead of hardcoding values.
//
// NOTE ON KEEPING THIS IN SYNC: the web's index.css declares :root TWICE.
// The second block ("Construction dashboard palette") wins, and that is what
// these values mirror. Reading only the first block gives you the retired
// crimson/warm-grey theme, which is what this file used to (wrongly) copy.

export const colors = {
  // Accent / brand — construction blue
  accent: '#2F6FED',
  accentDark: '#1F5FD5',
  accentLight: '#EAF2FF',
  accentMid: '#BFD5FF',

  // Backgrounds
  bg: '#F7F9FC',
  surface: '#FFFFFF',
  surfaceHover: '#F1F5FB',
  surfaceSubtle: '#FBFCFE',

  // Text — deep navy rather than pure black
  text: '#13264B',
  textBody: '#344563',
  textMuted: '#64748B',
  placeholder: '#94A3B8',

  // Borders
  border: '#E3EAF3',
  borderDim: '#EDF1F6',
  borderStrong: '#CBD7E6',

  // Status — each has a text, background and border tone, matching the
  // web's pill badges (a badge uses all three together).
  success: '#16856F',
  successBg: '#EAF7F2',
  successBorder: '#BCE7DC',

  warning: '#C98012',
  warningBg: '#FFF6E5',
  warningBorder: '#F6D69D',

  danger: '#D96A32',
  dangerBg: '#FFF0EA',
  dangerBorder: '#F6C6AF',

  info: '#2F6FED',
  infoBg: '#EAF2FF',
  infoBorder: '#BFD5FF',

  // Fixed tones that are not theme-dependent
  onAccent: '#FFFFFF',  // text/icons sitting on an accent fill
  shadow: '#000000',
};

export const fonts = {
  heading: 'SpaceGrotesk_600SemiBold',
  headingBold: 'SpaceGrotesk_700Bold',
  headingMedium: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
};

export const radius = {
  card: 12,
  cardSm: 10,
  button: 8,
  input: 8,
  pill: 999,
};

// Matches the web's type scale. Headings use Space Grotesk with negative
// tracking; the uppercase `label` is the web's .label component.
export const type = {
  title: { fontSize: 22, fontFamily: fonts.headingBold, letterSpacing: -0.4, color: colors.text },
  heading: { fontSize: 17, fontFamily: fonts.heading, letterSpacing: -0.3, color: colors.text },
  subheading: { fontSize: 15, fontFamily: fonts.heading, letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 14, fontFamily: fonts.body, color: colors.textBody },
  bodyStrong: { fontSize: 14, fontFamily: fonts.bodySemiBold, color: colors.text },
  small: { fontSize: 13, fontFamily: fonts.body, color: colors.textBody },
  caption: { fontSize: 12, fontFamily: fonts.body, color: colors.textMuted },
  label: {
    fontSize: 11,
    fontFamily: fonts.bodyMedium,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
};

// The web uses two elevations only (shadow-card / shadow-card-md). Spreading
// these replaces the five-property shadow block that was copy-pasted into
// almost every StyleSheet in the app.
export const shadow = {
  card: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  soft: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
};

// 4pt scale — the spacings already used ad hoc across the screens.
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

// Ready-made surfaces so screens stop re-declaring the same card each time.
export const surfaces = {
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.lg,
    ...shadow.card,
  },
  cardSm: {
    backgroundColor: colors.surface,
    borderRadius: radius.cardSm,
    padding: space.md,
    ...shadow.soft,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: fonts.body,
    color: colors.text,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: radius.button,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.button,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
};

export default { colors, fonts, radius, type, shadow, space, surfaces };
