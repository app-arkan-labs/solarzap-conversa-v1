import { describe, expect, it } from 'vitest';
import {
  INTERNAL_CRM_PIPELINE_STAGE_ORDER,
  getInternalCrmStageLabel,
  normalizeInternalCrmStageCode,
} from '@/modules/internal-crm/components/pipeline/stageCatalog';

describe('internal CRM stage catalog', () => {
  it('normalizes legacy meeting stages into the canonical scheduled stage', () => {
    expect(normalizeInternalCrmStageCode('agendou_reuniao')).toBe('chamada_agendada');
    expect(normalizeInternalCrmStageCode('reuniao_agendada')).toBe('chamada_agendada');
    expect(normalizeInternalCrmStageCode('demo_agendada')).toBe('chamada_agendada');
  });

  it('keeps only one scheduled meeting stage in the visible board order', () => {
    expect(INTERNAL_CRM_PIPELINE_STAGE_ORDER).toEqual([
      'novo_lead',
      'respondeu',
      'chamada_agendada',
      'chamada_realizada',
      'nao_compareceu',
      'negociacao',
      'fechou',
      'nao_fechou',
    ]);
  });

  it('renders the canonical label for the legacy alias', () => {
    expect(getInternalCrmStageLabel('agendou_reuniao')).toBe('Reuniao Agendada');
  });
});
