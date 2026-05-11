import { describe, expect, it } from 'vitest';
import {
  INTERNAL_CRM_PIPELINE_STAGE_ORDER,
  getInternalCrmStageLabel,
  normalizeInternalCrmStageCode,
} from '@/modules/internal-crm/components/pipeline/stageCatalog';

describe('internal CRM stage catalog', () => {
  it('normalizes legacy meeting stages into the canonical meeting stage', () => {
    expect(normalizeInternalCrmStageCode('agendou_reuniao')).toBe('reuniao_marcada');
    expect(normalizeInternalCrmStageCode('reuniao_agendada')).toBe('reuniao_marcada');
    expect(normalizeInternalCrmStageCode('demo_agendada')).toBe('reuniao_marcada');
  });

  it('keeps the simplified ARKAN pipeline in the visible board order', () => {
    expect(INTERNAL_CRM_PIPELINE_STAGE_ORDER).toEqual([
      'novo_lead',
      'tentando_contato',
      'mql',
      'reuniao_marcada',
      'reuniao_realizada',
      'contrato_fechado',
      'venda_finalizada',
    ]);
  });

  it('renders the canonical label for the legacy alias', () => {
    expect(getInternalCrmStageLabel('agendou_reuniao')).toBe('Reuniao Marcada');
  });
});
