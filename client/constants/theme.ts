import { Platform } from 'react-native';
import { CATEGORY_COLORS } from './categories';

// Port of the Couplet "liquid glass" design tokens (tokens/*.css in the
// design-system bundle) into plain JS for RN StyleSheets. Canonical source
// is the CSS — this file mirrors it 1:1, translated for RN where CSS has no
// equivalent (backdrop-filter -> BlurView intensity, box-shadow -> platform
// shadow props).

export const colors = {
  coral100: '#FCE5DC',
  coral200: '#F9C9BB',
  coral300: '#F09A85',
  coral400: '#E8604C',
  coral500: '#D85A3C',
  coral600: '#B8452C',

  ink900: '#0F1620',
  ink800: '#141F2C',
  ink700: '#1A2332',
  ink600: '#2C3A4D',
  ink500: '#3A4759',

  cream050: '#FBF8F1',
  cream100: '#F5F0E6',
  cream200: '#EDE8DC',
  cream300: '#E0D8CA',
  cream400: '#C4B8A0',

  tan500: '#B0A085',
  tan600: '#A8997A',
  tan700: '#7A6A55',

  category: CATEGORY_COLORS,

  accentTeal: '#1F7A8C',
  accentViolet: '#7A4FB7',
  accentGreen: '#2E8B57',
  accentAmber: '#C77B30',
  accentBerry: '#B83A5E',
  accentTag: '#D6A77A',

  brand: '#E8604C',
  brandPress: '#D85A3C',
  brandQuiet: '#FCE5DC',
  brandGlow: 'rgba(232,96,76,.28)',

  textStrong: '#1A2332',
  textBody: '#2C3A4D',
  textMuted: '#A8997A',
  textQuiet: 'rgba(26,35,50,.45)',
  textOnBrand: '#FFFFFF',
  textLink: '#D85A3C',

  surfacePage: '#F5F0E6',
  surfaceSunken: '#EDE8DC',
  surfaceSolid: '#FFFFFF',
  surfaceInk: '#141F2C',

  lineHair: 'rgba(20,33,51,.08)',
  lineSoft: '#E0D8CA',
  lineStrong: '#C4B8A0',

  stateDanger: '#C0392B',
  stateDangerQuiet: 'rgba(192,57,43,.10)',
  stateSuccess: '#2E8B57',
  stateWarn: '#C77B30',
  stateDisabledFg: 'rgba(26,35,50,.32)',
};

// Glass tints — apply as an overlay View's backgroundColor inside a BlurView.
export const glass = {
  thin: 'rgba(255,255,255,.42)',
  regular: 'rgba(255,255,255,.58)',
  thick: 'rgba(255,255,255,.74)',
  ink: 'rgba(20,31,44,.58)',
  brand: 'rgba(232,96,76,.16)',

  edge: 'rgba(255,255,255,.72)',
  edgeLow: 'rgba(20,33,51,.06)',
  edgeInk: 'rgba(255,255,255,.14)',

  innerTop: 'rgba(255,255,255,.9)',
  sheenColors: ['rgba(255,255,255,.55)', 'rgba(255,255,255,.12)', 'rgba(255,255,255,0)'] as const,
  sheenInkColors: ['rgba(255,255,255,.22)', 'rgba(255,255,255,.04)', 'rgba(255,255,255,0)'] as const,
};

// CSS blur(Npx) -> BlurView intensity (0-100), per the design handoff's own mapping.
export const blur = {
  s: 25,
  m: 45,
  l: 70,
  xl: 95,
};

export const fontFamily = {
  display: 'Outfit_800ExtraBold',
  displaySemibold: 'Outfit_600SemiBold',
  ui: 'Manrope_500Medium',
  uiSemibold: 'Manrope_600SemiBold',
  uiBold: 'Manrope_700Bold',
  uiBlack: 'Manrope_800ExtraBold',
  mono: 'JetBrainsMono_700Bold',
  monoMedium: 'JetBrainsMono_500Medium',
};

export const fontSize = {
  displayXl: 56,
  displayL: 40,
  displayM: 32,
  displayS: 28,
  title: 22,
  heading: 19,
  subheading: 17,
  body: 15,
  bodyS: 14,
  caption: 13,
  micro: 12,
  nano: 11,
  code: 20,
};

export const lineHeight = {
  tight: 1.08,
  snug: 1.18,
  body: 1.45,
  loose: 1.6,
};

// Em-ratios (CSS letter-spacing scales with the font-size it's applied to —
// multiply by the actual fontSize in use, don't reuse a baked px value).
export const letterSpacingRatio = {
  display: -0.02,
  tight: -0.01,
  normal: 0,
  label: 0.08,
  logo: 0.07,
};

// Role shorthands. fontSize * lineHeight multiplier gives RN's lineHeight (px).
export const type = {
  display: { fontFamily: fontFamily.display, fontSize: fontSize.displayL, lineHeight: Math.round(fontSize.displayL * lineHeight.tight), letterSpacing: -0.02 * fontSize.displayL },
  screenTitle: { fontFamily: fontFamily.display, fontSize: fontSize.displayS, lineHeight: Math.round(fontSize.displayS * lineHeight.snug), letterSpacing: -0.02 * fontSize.displayS },
  cardTitle: { fontFamily: fontFamily.uiBold, fontSize: fontSize.subheading, lineHeight: Math.round(fontSize.subheading * 1.25) },
  body: { fontFamily: fontFamily.ui, fontSize: fontSize.body, lineHeight: Math.round(fontSize.body * lineHeight.body) },
  caption: { fontFamily: fontFamily.ui, fontSize: fontSize.caption, lineHeight: Math.round(fontSize.caption * 1.4) },
  label: { fontFamily: fontFamily.uiBold, fontSize: fontSize.caption, lineHeight: fontSize.caption, letterSpacing: 0.08 * fontSize.caption, textTransform: 'uppercase' as const },
  code: { fontFamily: fontFamily.mono, fontSize: fontSize.code, lineHeight: Math.round(fontSize.code * 1.2) },
};

export const radius = {
  xs: 6,
  s: 10,
  m: 12,
  l: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 36,
  pill: 999,
  card: 16,
  tile: 12,
  sheet: 24,
  button: 999,
};

export const spacing = {
  s1: 2, s2: 4, s3: 6, s4: 8, s5: 10, s6: 12, s7: 14,
  s8: 16, s9: 18, s10: 20, s12: 24, s14: 28, s16: 32,
  s20: 40, s24: 48, s28: 56, s32: 64, s40: 80,

  gutterScreen: 20,
  gutterCard: 14,
  gutterCardDense: 12,
  stackCard: 7,
  tapMin: 44,
};

// Elevation: ink-tinted shadows. iOS reads shadow*; Android reads elevation.
// shadowColor is always ink (#0F1620/#1A2332), never neutral black.
function shadow(iosOpacity: number, iosRadius: number, iosOffsetY: number, androidElevation: number, color = colors.ink700) {
  return Platform.select({
    ios: { shadowColor: color, shadowOpacity: iosOpacity, shadowRadius: iosRadius, shadowOffset: { width: 0, height: iosOffsetY } },
    android: { elevation: androidElevation },
    default: { shadowColor: color, shadowOpacity: iosOpacity, shadowRadius: iosRadius, shadowOffset: { width: 0, height: iosOffsetY } },
  });
}

export const elevation = {
  hair: shadow(0.04, 2, 1, 1, '#000000'),
  card: shadow(0.05, 6, 2, 2),
  raised: shadow(0.08, 8, 2, 3),
  panel: shadow(0.10, 16, 8, 6),
  float: shadow(0.16, 24, 18, 10, colors.ink900),
  brand: shadow(0.28, 10, 8, 6, '#E76F51'),
  brandHover: shadow(0.34, 14, 12, 8, '#E76F51'),
};

export const motion = {
  durInstant: 120,
  durFast: 200,
  durBase: 260,
  durSlow: 400,
  durCinema: 550,
  liftHover: -1,
  pressScale: 0.975,
};

const theme = { colors, glass, blur, fontFamily, fontSize, lineHeight, letterSpacingRatio, type, radius, spacing, elevation, motion };
export default theme;
