import { DEFAULT_SETTINGS } from '@/hooks/useAutomationSettings';

describe('automation settings defaults', () => {
  it('keeps first-response automation enabled by default', () => {
    expect(DEFAULT_SETTINGS.novoLeadFirstResponseToRespondeuEnabled).toBe(true);
  });

  it('preserves first-response automation when applying partial overrides', () => {
    const merged = {
      ...DEFAULT_SETTINGS,
      dragDropChamadaRealizada: false,
    };

    expect(merged.novoLeadFirstResponseToRespondeuEnabled).toBe(true);
  });
});

