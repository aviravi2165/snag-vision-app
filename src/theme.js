// Single source of truth for the app's design tokens — colors, typography,
// and shape — mirrored from the SnagVision web frontend's (light-only)
// design system. Import from here instead of hardcoding hex values so the
// mobile app and web app stay visually consistent.

export const colors = {
  // Accent / brand
  accent: '#D32F2F',
  accentDark: '#B71C1C',
  accentLight: '#FFEBEE',
  accentMid: '#FFCDD2',

  // Backgrounds
  bg: '#F8F7F4',
  surface: '#FFFFFF',
  surfaceHover: '#FAFAF8',

  // Text
  text: '#111111',
  textBody: '#444444',
  textMuted: '#666666',
  placeholder: '#999999',

  // Borders
  border: '#E5E5E5',
  borderDim: '#EBEAE6',
  borderStrong: '#D4D3CF',

  // Status
  success: '#2E7D32',
  successBg: '#E8F5E9',
  warning: '#E65100',
  warningBg: '#FFF8E1',
  danger: '#C62828',
  dangerBg: '#FFEBEE',
  info: '#1565C0',
  infoBg: '#E3F2FD',
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
  button: 8,
  pill: 999,
};

export default { colors, fonts, radius };
