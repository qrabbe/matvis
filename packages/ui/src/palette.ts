/** Both the seed and the pins derive from this one map, which is the only reason
 * they cannot drift. `ThemeProvider` takes two seed inputs and derives the rest
 * of the ramp, so pinning individual tokens is the only way to hold the palette. */
const dark = {
  bg: '#0e0e0e',
  surfaceStrong: '#1a1a1a',
  surfaceWeak: '#080808',
  text: '#f4f4fa',
  textMuted: '#9aa0a6',
  border: '#403a3a',
  borderStrong: '#5c5555',
  borderWeak: '#2a2626',
  ring: '#7999e9',

  primary: '#89a8e8',
  primaryHover: '#9db8ee',
  primaryActive: '#b0c6f2',
  primaryFg: '#07173f',

  info: '#89a8e8',
  infoWeak: '#7999e9',
  infoSurface: '#0a1b3d',
  infoSurfaceWeak: '#07142e',
  infoStroke: '#2b3f6e',

  success: '#17bf39',
  successWeak: '#14992f',
  successSurface: '#062a10',
  successSurfaceWeak: '#041d0b',
  successStroke: '#1c5a2c',

  warning: '#cf995d',
  warningWeak: '#b8834a',
  warningSurface: '#2b1f10',
  warningSurfaceWeak: '#201709',
  warningStroke: '#6e5233',

  caution: '#c6a800',
  cautionWeak: '#a68e00',
  cautionSurface: '#29230a',
  cautionSurfaceWeak: '#1e1a07',
  cautionStroke: '#6b5c12',

  error: '#d589d5',
  errorWeak: '#c06fc0',
  errorActive: '#e6a6e6',
  errorFg: '#2e0530',
  errorSurface: '#2e0530',
  errorSurfaceWeak: '#220324',
  errorStroke: '#6e3070',
} as const;

export const matvisSeed = { background: dark.bg, primary: dark.primary };

const wpdsPins: Record<string, string> = {
  'color-background-surface-neutral': dark.bg,
  'color-background-surface-neutral-strong': dark.surfaceStrong,
  'color-background-surface-neutral-weak': dark.surfaceWeak,
  'color-foreground-content-neutral': dark.text,
  'color-foreground-content-neutral-weak': dark.textMuted,

  'color-stroke-surface-neutral': dark.border,
  'color-stroke-surface-neutral-strong': dark.borderStrong,
  'color-stroke-surface-neutral-weak': dark.borderWeak,
  'color-stroke-interactive-neutral': dark.borderStrong,
  'color-stroke-focus': dark.ring,

  'color-foreground-interactive-brand': dark.primary,
  'color-foreground-interactive-brand-active': dark.primaryActive,
  'color-background-interactive-brand-strong': dark.primary,
  'color-background-interactive-brand-strong-active': dark.primaryHover,
  'color-foreground-interactive-brand-strong': dark.primaryFg,
  'color-foreground-interactive-brand-strong-active': dark.primaryFg,
  'color-stroke-interactive-brand': dark.primary,
  'color-stroke-interactive-brand-active': dark.primaryActive,
  'color-stroke-surface-brand-strong': dark.primary,

  'color-foreground-content-info': dark.info,
  'color-foreground-content-info-weak': dark.infoWeak,
  'color-background-surface-info': dark.infoSurface,
  'color-background-surface-info-weak': dark.infoSurfaceWeak,
  'color-stroke-surface-info': dark.infoStroke,
  'color-stroke-surface-info-strong': dark.infoWeak,

  'color-foreground-content-success': dark.success,
  'color-foreground-content-success-weak': dark.successWeak,
  'color-background-surface-success': dark.successSurface,
  'color-background-surface-success-weak': dark.successSurfaceWeak,
  'color-stroke-surface-success': dark.successStroke,
  'color-stroke-surface-success-strong': dark.success,

  'color-foreground-content-warning': dark.warning,
  'color-foreground-content-warning-weak': dark.warningWeak,
  'color-background-surface-warning': dark.warningSurface,
  'color-background-surface-warning-weak': dark.warningSurfaceWeak,
  'color-stroke-surface-warning': dark.warningStroke,
  'color-stroke-surface-warning-strong': dark.warning,

  'color-foreground-content-caution': dark.caution,
  'color-foreground-content-caution-weak': dark.cautionWeak,
  'color-background-surface-caution': dark.cautionSurface,
  'color-background-surface-caution-weak': dark.cautionSurfaceWeak,
  'color-stroke-surface-caution': dark.cautionStroke,
  'color-stroke-surface-caution-strong': dark.caution,

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

/** The classic fallbacks read a token family `ThemeProvider` never sets, so the
 * palette has to be emitted a second time under those names. */
const wpComponentsVars: Record<string, string> = {
  'wp-admin-theme-color': dark.primary,
  'wp-components-color-accent': dark.primary,
  'wp-components-color-accent-darker-10': dark.primaryHover,
  'wp-components-color-accent-darker-20': dark.primaryActive,
  'wp-components-color-accent-inverted': dark.primaryFg,

  'wp-components-color-foreground': dark.text,
  'wp-components-color-foreground-inverted': dark.bg,
  'wp-components-color-background': dark.bg,

  'wp-components-color-gray-100': dark.surfaceStrong,
  'wp-components-color-gray-400': dark.border,
  'wp-components-color-gray-600': dark.borderStrong,
  'wp-components-color-gray-700': dark.textMuted,
  'wp-components-color-gray-800': dark.text,
};

const cssVars = (
  vars: Record<string, string>,
  prefix: string,
  suffix = '',
): string =>
  Object.entries(vars)
    .map(([token, value]) => `  --${prefix}${token}: ${value}${suffix};`)
    .join('\n');

/** Needs both selectors and the `!important`: `:root` is what portaled modals and
 * menus inherit from, `.matvis-theme` is what in-app content inherits from. */
export const matvisPinsCss = `:root, .matvis-theme {
${cssVars(wpdsPins, 'wpds-', ' !important')}
}

:root {
${cssVars(wpComponentsVars, '')}
}`;
