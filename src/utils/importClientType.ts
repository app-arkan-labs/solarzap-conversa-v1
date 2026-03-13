import type { ClientType } from '@/types/solarzap';

const CLIENT_TYPE_VALUES: ClientType[] = [
  'residencial',
  'comercial',
  'industrial',
  'rural',
  'usina',
];

const TYPE_ALIASES: Record<string, ClientType> = {
  residencial: 'residencial',
  comercial: 'comercial',
  industrial: 'industrial',
  rural: 'rural',
  usina: 'usina',
  usina_solar: 'usina',
};

const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const normalizeImportedClientType = (value: unknown): ClientType | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const token = normalizeToken(raw);
  if (!token) return null;

  if ((CLIENT_TYPE_VALUES as string[]).includes(token)) {
    return token as ClientType;
  }

  return TYPE_ALIASES[token] || null;
};

export const resolveImportedClientType = (params: {
  rowClientType?: unknown;
  defaultClientType?: unknown;
}): ClientType | null => {
  const rowType = normalizeImportedClientType(params.rowClientType);
  if (rowType) return rowType;
  return normalizeImportedClientType(params.defaultClientType);
};

