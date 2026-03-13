import type { Channel } from '@/types/solarzap';

const CHANNEL_ALIASES: Record<string, Channel> = {
  whatsapp: 'whatsapp',
  whats_app: 'whatsapp',
  zap: 'whatsapp',
  messenger: 'messenger',
  facebook_messenger: 'messenger',
  instagram: 'instagram',
  instagram_dm: 'instagram',
  email: 'email',
  e_mail: 'email',
  google_ads: 'google_ads',
  googleads: 'google_ads',
  facebook_ads: 'facebook_ads',
  meta_ads: 'facebook_ads',
  tiktok_ads: 'tiktok_ads',
  tiktok: 'tiktok_ads',
  indication: 'indication',
  indicacao: 'indication',
  indicacoes: 'indication',
  referral: 'indication',
  event: 'event',
  evento: 'event',
  cold_list: 'cold_list',
  lista_fria: 'cold_list',
  coldlist: 'cold_list',
  other: 'other',
  outros: 'other',
};

const CHANNEL_VALUES: Channel[] = [
  'whatsapp',
  'messenger',
  'instagram',
  'email',
  'google_ads',
  'facebook_ads',
  'tiktok_ads',
  'indication',
  'event',
  'cold_list',
  'other',
];

const normalizeToken = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const normalizeChannelValue = (value: unknown): Channel => {
  const raw = String(value || '').trim();
  if (!raw) return 'other';

  const token = normalizeToken(raw);
  if (!token) return 'other';

  if ((CHANNEL_VALUES as string[]).includes(token)) {
    return token as Channel;
  }

  return CHANNEL_ALIASES[token] || 'other';
};
