const ptBrDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
});

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const formatDatePtBr = (value: string) => {
  if (!value) return '';
  const normalized = `${value}T12:00:00`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? value : ptBrDateFormatter.format(parsed);
};

export const formatCurrencyPtBr = (value: number) =>
  currencyFormatter.format(Number.isFinite(value) ? value : 0);

export const formatBooleanPtBr = (value: boolean, truthy = 'sim', falsy = 'nao') =>
  value ? truthy : falsy;

export const formatFeatureFlag = (value: boolean) => (value ? 'ativo' : 'inativo');

export const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

export const slugifyToken = (value: string) =>
  normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

export const createContractDraftId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `draft-${Date.now()}`;

export const createContractNumber = () => {
  const now = new Date();
  const dateToken = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const randomToken =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
      : String(Math.random()).slice(2, 8).padEnd(6, '0');

  return `CTR-${dateToken}-${randomToken}`;
};

export const createEventId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `event-${Date.now()}`;

export const createChecksumToken = (input: string) => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return `chk-${Math.abs(hash)}`;
};

export const toIsoNow = () => new Date().toISOString();

export const formatForumLabel = (cidade: string, estado: string) =>
  [cidade, estado].filter(Boolean).join('/');
