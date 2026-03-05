import { buildImportLeadsSummary } from '@/lib/importLeadsSummary';

describe('buildImportLeadsSummary', () => {
  it('aggregates inserted, updated and failed rows', () => {
    const summary = buildImportLeadsSummary([
      { row_index: 1, action: 'inserted', lead_id: 10, error: null },
      { row_index: 2, action: 'updated', lead_id: 11, error: null },
      { row_index: 3, action: 'failed', lead_id: null, error: 'Telefone obrigatório' },
    ]);

    expect(summary.inserted_count).toBe(1);
    expect(summary.updated_count).toBe(1);
    expect(summary.failed_count).toBe(1);
    expect(summary.failures).toEqual([
      { row_index: 3, message: 'Telefone obrigatório' },
    ]);
  });

  it('returns safe defaults when input is null', () => {
    expect(buildImportLeadsSummary(null)).toEqual({
      inserted_count: 0,
      updated_count: 0,
      failed_count: 0,
      failures: [],
    });
  });
});

