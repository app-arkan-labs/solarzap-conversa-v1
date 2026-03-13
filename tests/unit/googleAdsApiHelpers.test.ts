import { describe, expect, it } from 'vitest';

describe('Google Ads API response parsing', () => {
  it('parses accessible customers response', () => {
    const response = { resourceNames: ['customers/1234567890', 'customers/9876543210'] };
    const customers = response.resourceNames.map((resourceName) => resourceName.replace('customers/', ''));

    expect(customers).toEqual(['1234567890', '9876543210']);
  });

  it('handles empty response', () => {
    const response = { resourceNames: [] as string[] };
    expect(response.resourceNames).toHaveLength(0);
  });

  it('parses conversion actions', () => {
    const results = [
      { conversionAction: { id: '123', name: 'Purchase', status: 'ENABLED', type: 'UPLOAD_CLICKS' } },
      { conversionAction: { id: '456', name: 'Lead', status: 'ENABLED', type: 'UPLOAD_CLICKS' } },
    ];

    const actions = results.map((result) => ({
      id: result.conversionAction.id,
      name: result.conversionAction.name,
    }));

    expect(actions).toHaveLength(2);
    expect(actions[0].name).toBe('Purchase');
  });
});
