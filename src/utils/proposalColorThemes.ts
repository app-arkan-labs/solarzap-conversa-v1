// ══════════════════════════════════════════════════════════
// Proposal Color Theme System
// ══════════════════════════════════════════════════════════

export type ProposalThemeId = 'verde' | 'azul_marinho' | 'azul_royal' | 'laranja' | 'cinza_escuro';

export interface ProposalColorTheme {
  id: ProposalThemeId;
  label: string;
  /** Main color for header, footer, table heads, investment box */
  primary: [number, number, number];
  /** Darker accent bar below header */
  primaryDark: [number, number, number];
  /** Light tint for section headers bg and alternateRowStyles */
  primaryLight: [number, number, number];
  /** Text color used on top of primaryLight bg (section titles) */
  primaryText: [number, number, number];
  /** Tailwind class for the preview swatch in ProposalsView */
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
    swatch: 'bg-green-500',
  },
  azul_marinho: {
    id: 'azul_marinho',
    label: 'Azul Marinho',
    primary: [10, 31, 59],
    primaryDark: [7, 22, 42],
    primaryLight: [226, 232, 240],
    primaryText: [15, 23, 42],
    swatch: 'bg-slate-800',
  },
  azul_royal: {
    id: 'azul_royal',
    label: 'Azul Royal',
    primary: [30, 64, 175],
    primaryDark: [29, 78, 216],
    primaryLight: [219, 234, 254],
    primaryText: [30, 64, 175],
    swatch: 'bg-blue-700',
  },
  laranja: {
    id: 'laranja',
    label: 'Laranja Energia',
    primary: [234, 88, 12],
    primaryDark: [194, 65, 12],
    primaryLight: [255, 237, 213],
    primaryText: [154, 52, 18],
    swatch: 'bg-orange-600',
  },
  cinza_escuro: {
    id: 'cinza_escuro',
    label: 'Cinza Profissional',
    primary: [55, 65, 81],
    primaryDark: [31, 41, 55],
    primaryLight: [243, 244, 246],
    primaryText: [31, 41, 55],
    swatch: 'bg-gray-600',
  },
};

export const THEME_IDS = Object.keys(PROPOSAL_THEMES) as ProposalThemeId[];

export function getThemeById(id: string | null | undefined): ProposalColorTheme {
  if (id && id in PROPOSAL_THEMES) return PROPOSAL_THEMES[id as ProposalThemeId];
  return PROPOSAL_THEMES.verde;
}
