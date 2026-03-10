import { normalizeImportedClientType, resolveImportedClientType } from '@/utils/importClientType';

describe('importClientType', () => {
  it('normalizes valid values and aliases', () => {
    expect(normalizeImportedClientType('Residencial')).toBe('residencial');
    expect(normalizeImportedClientType('COMERCIAL')).toBe('comercial');
    expect(normalizeImportedClientType('Usina Solar')).toBe('usina');
  });

  it('returns null for invalid types', () => {
    expect(normalizeImportedClientType('tipo_invalido')).toBeNull();
    expect(normalizeImportedClientType('')).toBeNull();
    expect(normalizeImportedClientType(undefined)).toBeNull();
  });

  it('applies precedence row > default', () => {
    expect(resolveImportedClientType({ rowClientType: 'industrial', defaultClientType: 'residencial' })).toBe('industrial');
    expect(resolveImportedClientType({ rowClientType: 'invalido', defaultClientType: 'rural' })).toBe('rural');
    expect(resolveImportedClientType({ rowClientType: '', defaultClientType: '' })).toBeNull();
  });
});
