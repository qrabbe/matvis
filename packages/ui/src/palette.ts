/**
 * Single source of truth for the Matvis theme — the adopted taichi/bucaastudio
 * palette (https://taichi.bucaastudio.com), dark mode.
 *
 * `@wordpress/theme`'s `ThemeProvider` only accepts two seed inputs
 * (`primary` + `background`) and *derives* the rest of the `--wpds-*` ramp. To pin
 * the exact palette we also override the semantic tokens directly (the design
 * system discourages this, but it's the only way to control individual colors).
 * Both the seed and those overrides are derived from `dark` below, so they can't
 * drift: edit one value here and everything follows.
 *
 * `theme.tsx` feeds `matvisSeed` to `<ThemeProvider>` and injects `matvisPinsCss`.
 */

/** Semantic dark-mode palette. `bg` is lifted from the palette's pure `#000000`
 * to a soft near-black; `textMuted` is dimmed from the palette's near-white
 * (#F3F6F0) so text hierarchy survives. Everything else is the palette verbatim. */
const dark = {
  bg: '#0e0e0e',
  surfaceStrong: '#1a1a1a', // elevated: modal, sticky column
  surfaceWeak: '#080808',
  text: '#f4f4fa',
  textMuted: '#9aa0a6',
  border: '#403a3a',
  borderStrong: '#5c5555',
  borderWeak: '#2a2626',
  ring: '#7999e9',

  // Brand / primary
  primary: '#89a8e8',
  primaryHover: '#9db8ee',
  primaryActive: '#b0c6f2',
  primaryFg: '#07173f', // text on a primary-filled surface

  // Info (blue)
  info: '#89a8e8',
  infoWeak: '#7999e9',
  infoSurface: '#0a1b3d',
  infoSurfaceWeak: '#07142e',
  infoStroke: '#2b3f6e',

  // Success / "stable" (accent green)
  success: '#17bf39',
  successWeak: '#14992f',
  successSurface: '#062a10',
  successSurfaceWeak: '#041d0b',
  successStroke: '#1c5a2c',

  // Warning (warn)
  warning: '#cf995d',
  warningWeak: '#b8834a',
  warningSurface: '#2b1f10',
  warningSurfaceWeak: '#201709',
  warningStroke: '#6e5233',

  // Caution (good, gold)
  caution: '#c6a800',
  cautionWeak: '#a68e00',
  cautionSurface: '#29230a',
  cautionSurfaceWeak: '#1e1a07',
  cautionStroke: '#6b5c12',

  // Error / destructive (bad, magenta)
  error: '#d589d5',
  errorWeak: '#c06fc0',
  errorActive: '#e6a6e6',
  errorFg: '#2e0530', // text on an error-filled surface
  errorSurface: '#2e0530',
  errorSurfaceWeak: '#220324',
  errorStroke: '#6e3070',
} as const;

/** Seed passed to `<ThemeProvider color={…}>`; governs every non-pinned token. */
export const matvisSeed = { background: dark.bg, primary: dark.primary };

/** Exact-palette overrides, keyed by the semantic `--wpds-*` token they pin. */
const wpdsPins: Record<string, string> = {
  // Neutral surfaces + text
  'color-background-surface-neutral': dark.bg,
  'color-background-surface-neutral-strong': dark.surfaceStrong,
  'color-background-surface-neutral-weak': dark.surfaceWeak,
  'color-foreground-content-neutral': dark.text,
  'color-foreground-content-neutral-weak': dark.textMuted,

  // Borders / strokes / focus ring
  'color-stroke-surface-neutral': dark.border,
  'color-stroke-surface-neutral-strong': dark.borderStrong,
  'color-stroke-surface-neutral-weak': dark.borderWeak,
  'color-stroke-interactive-neutral': dark.borderStrong,
  'color-stroke-focus': dark.ring,

  // Brand
  'color-foreground-interactive-brand': dark.primary,
  'color-foreground-interactive-brand-active': dark.primaryActive,
  'color-background-interactive-brand-strong': dark.primary,
  'color-background-interactive-brand-strong-active': dark.primaryHover,
  'color-foreground-interactive-brand-strong': dark.primaryFg,
  'color-foreground-interactive-brand-strong-active': dark.primaryFg,
  'color-stroke-interactive-brand': dark.primary,
  'color-stroke-interactive-brand-active': dark.primaryActive,
  'color-stroke-surface-brand-strong': dark.primary,

  // Info
  'color-foreground-content-info': dark.info,
  'color-foreground-content-info-weak': dark.infoWeak,
  'color-background-surface-info': dark.infoSurface,
  'color-background-surface-info-weak': dark.infoSurfaceWeak,
  'color-stroke-surface-info': dark.infoStroke,
  'color-stroke-surface-info-strong': dark.infoWeak,

  // Success
  'color-foreground-content-success': dark.success,
  'color-foreground-content-success-weak': dark.successWeak,
  'color-background-surface-success': dark.successSurface,
  'color-background-surface-success-weak': dark.successSurfaceWeak,
  'color-stroke-surface-success': dark.successStroke,
  'color-stroke-surface-success-strong': dark.success,

  // Warning
  'color-foreground-content-warning': dark.warning,
  'color-foreground-content-warning-weak': dark.warningWeak,
  'color-background-surface-warning': dark.warningSurface,
  'color-background-surface-warning-weak': dark.warningSurfaceWeak,
  'color-stroke-surface-warning': dark.warningStroke,
  'color-stroke-surface-warning-strong': dark.warning,

  // Caution
  'color-foreground-content-caution': dark.caution,
  'color-foreground-content-caution-weak': dark.cautionWeak,
  'color-background-surface-caution': dark.cautionSurface,
  'color-background-surface-caution-weak': dark.cautionSurfaceWeak,
  'color-stroke-surface-caution': dark.cautionStroke,
  'color-stroke-surface-caution-strong': dark.caution,

  // Error / destructive
  'color-foreground-content-error': dark.error,
  'color-foreground-content-error-weak': dark.errorWeak,
  'color-foreground-interactive-error': dark.error,
  'color-foreground-interactive-error-active': dark.errorActive,
  'color-foreground-interactive-error-strong': dark.errorFg,
  'color-background-surface-error': dark.errorSurface,
  'color-background-surface-error-weak': dark.errorSurfaceWeak,
  'color-background-interactive-error-strong': dark.error,
  'color-background-interactive-error-strong-active': dark.errorActive,
  'color-stroke-surface-error': dark.errorStroke,
  'color-stroke-surface-error-strong': dark.error,
  'color-stroke-interactive-error': dark.error,
};

/**
 * The classic `@wordpress/components` and `@wordpress/dataviews` fallbacks read an
 * older token family that `ThemeProvider` never sets, so the same palette has to be
 * emitted a second time under those names. Keyed by the CSS variable they define.
 * The static rules that go with them live in `wp-fallback.css`.
 */
const wpComponentsVars: Record<string, string> = {
  // Brand accent: buttons, links, focus rings, active column header.
  'wp-admin-theme-color': dark.primary,
  'wp-components-color-accent': dark.primary,
  'wp-components-color-accent-darker-10': dark.primaryHover,
  'wp-components-color-accent-darker-20': dark.primaryActive,
  'wp-components-color-accent-inverted': dark.primaryFg,

  // Foreground / background.
  'wp-components-color-foreground': dark.text,
  'wp-components-color-foreground-inverted': dark.bg,
  'wp-components-color-background': dark.bg,

  // Gray ramp: low = subtle fills/hover, mid = borders, high = text.
  'wp-components-color-gray-100': dark.surfaceStrong,
  'wp-components-color-gray-400': dark.border,
  'wp-components-color-gray-600': dark.borderStrong,
  'wp-components-color-gray-700': dark.textMuted,
  'wp-components-color-gray-800': dark.text,
};

/** Renders a token map as indented custom-property declarations. */
const cssVars = (
  vars: Record<string, string>,
  prefix: string,
  suffix = '',
): string =>
  Object.entries(vars)
    .map(([token, value]) => `  --${prefix}${token}: ${value}${suffix};`)
    .join('\n');

/**
 * Generated CSS pinning the palette onto the semantic tokens. Applied to BOTH
 * `.matvis-theme` (beats the value inherited by in-app content) and `:root`
 * (beats the value `ThemeProvider` forwards to `<html>` for portaled modals/menus)
 * with `!important`, so the exact palette wins consistently everywhere. The
 * `--wp-components-color-*` block rides along on `:root` for the same reason: the
 * fallbacks that read it portal their menus and modals to `<body>`.
 */
export const matvisPinsCss = `:root, .matvis-theme {
${cssVars(wpdsPins, 'wpds-', ' !important')}
}

:root {
${cssVars(wpComponentsVars, '')}
}`;
