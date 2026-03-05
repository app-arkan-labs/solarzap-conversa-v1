import { describe, expect, it } from 'vitest';
import {
  TRACKING_BACKOFF_SECONDS,
  TRACKING_MAX_ATTEMPTS,
  getDefaultStageEventMap,
  normalizeCrmStageSlug,
  shouldCreateDeliveries,
} from '@/lib/tracking/constants';

describe('tracking scaffold constants', () => {
  it('normalizes crm stage slugs deterministically', () => {
    expect(normalizeCrmStageSlug('Contrato Assinado')).toBe('contrato_assinado');
    expect(normalizeCrmStageSlug('  Chamada  Agendada  ')).toBe('chamada_agendada');
    expect(normalizeCrmStageSlug('')).toBe('unknown');
  });

  it('keeps backoff and max attempts aligned with v3 spec', () => {
    expect(TRACKING_BACKOFF_SECONDS).toEqual([30, 60, 300, 1800, 3600]);
    expect(TRACKING_MAX_ATTEMPTS).toBe(5);
  });

  it('exposes default stage event mappings for the core stages', () => {
    const map = getDefaultStageEventMap();
    expect(map.novo_lead.ga4).toBe('generate_lead');
    expect(map.chamada_realizada.meta).toBe('Schedule');
    expect(map.visita_realizada.meta).toBe('SubmitApplication');
    expect(map.chamada_agendada.meta).toBeNull();
    expect(map.proposta_pronta.meta).toBeNull();
    expect(map.contrato_assinado.meta).toBeNull();
    expect(map.projeto_pago.google_ads).toBe('purchase');
  });

  it('gates delivery creation by tracking flag', () => {
    expect(shouldCreateDeliveries({ tracking_enabled: true })).toBe(true);
    expect(shouldCreateDeliveries({ tracking_enabled: false })).toBe(false);
    expect(shouldCreateDeliveries(null)).toBe(false);
  });
});

