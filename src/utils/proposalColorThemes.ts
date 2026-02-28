// Proposal color theme system.

export type ProposalThemeId =
  | 'verde'
  | 'azul_marinho'
  | 'azul_royal'
  | 'laranja'
  | 'cinza_escuro'
  | 'roxo'
  | 'turquesa'
  | 'vermelho'
  | 'dourado'
  | 'grafite';

export type ProposalThemeValue = ProposalThemeId | `custom:${string}`;
export type RGB = [number, number, number];

export interface ProposalColorTheme {
  id: ProposalThemeValue;
  label: string;
  /** Main color for header, footer, table heads, investment box */
  primary: RGB;
  /** Darker accent bar below header */
  primaryDark: RGB;
  /** Light tint for section headers bg and alternateRowStyles */
  primaryLight: RGB;
  /** Text color used on top of primaryLight bg (section titles) */
  primaryText: RGB;
  /** CSS-compatible color for the preview swatch in ProposalsView */
  swatch: string;
}

export const PROPOSAL_THEMES: Record<ProposalThemeId, ProposalColorTheme> = {
  verde: {
    id: 'verde',
    label: 'Verde SolarZap',
    primary: [22, 163, 74],
    primaryDark: [21, 128, 61],
    primaryLight: [240, 253, 244],
    primaryText: [22, 101, 52],
    swatch: '#16a34a',
  },
  azul_marinho: {
    id: 'azul_marinho',
    label: 'Azul Marinho',
    primary: [10, 31, 59],
    primaryDark: [7, 22, 42],
    primaryLight: [226, 232, 240],
    primaryText: [15, 23, 42],
    swatch: '#1e293b',
  },
  azul_royal: {
    id: 'azul_royal',
    label: 'Azul Royal',
    primary: [30, 64, 175],
    primaryDark: [29, 78, 216],
    primaryLight: [219, 234, 254],
    primaryText: [30, 64, 175],
    swatch: '#1d4ed8',
  },
  laranja: {
    id: 'laranja',
    label: 'Laranja Energia',
    primary: [234, 88, 12],
    primaryDark: [194, 65, 12],
    primaryLight: [255, 237, 213],
    primaryText: [154, 52, 18],
    swatch: '#ea580c',
  },
  cinza_escuro: {
    id: 'cinza_escuro',
    label: 'Cinza Profissional',
    primary: [55, 65, 81],
    primaryDark: [31, 41, 55],
    primaryLight: [243, 244, 246],
    primaryText: [31, 41, 55],
    swatch: '#4b5563',
  },
  roxo: {
    id: 'roxo',
    label: 'Roxo Premium',
    primary: [124, 58, 237],
    primaryDark: [109, 40, 217],
    primaryLight: [243, 232, 255],
    primaryText: [88, 28, 135],
    swatch: '#7c3aed',
  },
  turquesa: {
    id: 'turquesa',
    label: 'Turquesa',
    primary: [13, 148, 136],
    primaryDark: [15, 118, 110],
    primaryLight: [204, 251, 241],
    primaryText: [19, 78, 74],
    swatch: '#0d9488',
  },
  vermelho: {
    id: 'vermelho',
    label: 'Vermelho Energia',
    primary: [220, 38, 38],
    primaryDark: [185, 28, 28],
    primaryLight: [254, 226, 226],
    primaryText: [127, 29, 29],
    swatch: '#dc2626',
  },
  dourado: {
    id: 'dourado',
    label: 'Dourado',
    primary: [202, 138, 4],
    primaryDark: [161, 98, 7],
    primaryLight: [254, 243, 199],
    primaryText: [120, 53, 15],
    swatch: '#ca8a04',
  },
  grafite: {
    id: 'grafite',
    label: 'Grafite',
    primary: [51, 65, 85],
    primaryDark: [30, 41, 59],
    primaryLight: [226, 232, 240],
    primaryText: [30, 41, 59],
    swatch: '#334155',
  },
};

export const THEME_IDS = Object.keys(PROPOSAL_THEMES) as ProposalThemeId[];

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function normalizeThemeHex(input: string): string | null {
  const raw = String(input || '').trim();
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(withHash)) return null;
  if (withHash.length === 4) {
    const a = withHash[1];
    const b = withHash[2];
    const c = withHash[3];
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return withHash.toLowerCase();
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

export function parseThemeHexToRgb(input: string): RGB | null {
  const normalized = normalizeThemeHex(input);
  if (!normalized) return null;
  return hexToRgb(normalized);
}

export function rgbToHsl([rRaw, gRaw, bRaw]: RGB): [number, number, number] {
  const r = rRaw / 255;
  const g = gRaw / 255;
  const b = bRaw / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return [h, s, l];
}

function hueToRgb(p: number, q: number, tRaw: number): number {
  let t = tRaw;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToRgb(hRaw: number, s: number, l: number): RGB {
  const h = ((hRaw % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = clamp(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    clamp(hueToRgb(p, q, h + 1 / 3) * 255),
    clamp(hueToRgb(p, q, h) * 255),
    clamp(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

export function mixToward(base: RGB, target: RGB, alpha: number): RGB {
  return [
    clamp(base[0] * (1 - alpha) + target[0] * alpha),
    clamp(base[1] * (1 - alpha) + target[1] * alpha),
    clamp(base[2] * (1 - alpha) + target[2] * alpha),
  ];
}

/** Derive a readable complementary color from a given theme color. */
export function deriveComplementary(base: RGB): RGB {
  const [h, s, l] = rgbToHsl(base);
  const complementHue = (h + 180) % 360;
  const safeS = Math.max(0.48, Math.min(0.78, s || 0.58));
  const safeL = Math.max(0.34, Math.min(0.52, l));
  return hslToRgb(complementHue, safeS, safeL);
}

function mix(base: RGB, target: RGB, alpha: number): RGB {
  return mixToward(base, target, alpha);
}

export function toCustomThemeValue(hexCode: string): ProposalThemeValue | null {
  const normalized = normalizeThemeHex(hexCode);
  if (!normalized) return null;
  return `custom:${normalized}`;
}

export function isValidThemeHex(hexCode: string): boolean {
  return !!normalizeThemeHex(hexCode);
}

export function createCustomTheme(hexCode: string): ProposalColorTheme {
  const normalized = normalizeThemeHex(hexCode) || '#16a34a';
  const primary = hexToRgb(normalized);
  const primaryDark = mix(primary, [0, 0, 0], 0.22);
  const primaryLight = mix(primary, [255, 255, 255], 0.86);
  const primaryText = mix(primary, [0, 0, 0], 0.35);

  return {
    id: `custom:${normalized}`,
    label: `Personalizado (${normalized.toUpperCase()})`,
    primary,
    primaryDark,
    primaryLight,
    primaryText,
    swatch: normalized,
  };
}

export function getThemeById(id: string | null | undefined): ProposalColorTheme {
  if (id?.startsWith('custom:')) {
    return createCustomTheme(id.replace('custom:', ''));
  }
  if (id && id in PROPOSAL_THEMES) return PROPOSAL_THEMES[id as ProposalThemeId];
  return PROPOSAL_THEMES.verde;
}