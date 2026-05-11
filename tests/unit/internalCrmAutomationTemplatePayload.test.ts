import { describe, expect, it } from 'vitest';

import {
  extractAutomationTemplateTokens,
  mergeAutomationTemplatePayload,
  normalizeAutomationPersonFirstName,
  normalizeAutomationPersonFullName,
  renderAutomationTemplate,
} from '../../supabase/functions/internal-crm-api/templatePayload';

describe('internal CRM automation template payload', () => {
  it('preserves a resolved fallback when later sources provide null or blank values', () => {
    const merged = mergeAutomationTemplatePayload(
      {
        link_reuniao: 'https://meet.google.com/abc-defg-hij',
        nome: 'Jaime',
      },
      {
        link_reuniao: null,
      },
      {
        link_reuniao: '   ',
      },
    );

    expect(merged.link_reuniao).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('fills missing values from later meaningful sources without overwriting stronger values', () => {
    const merged = mergeAutomationTemplatePayload(
      {
        link_reuniao: '',
        nome: 'Anderson',
      },
      {
        landing_page_url: 'https://lp.aceleracao.solarzap.com.br',
        link_reuniao: 'https://meet.google.com/abc-defg-hij',
      },
      {
        link_reuniao: null,
      },
    );

    expect(merged.link_reuniao).toBe('https://meet.google.com/abc-defg-hij');
    expect(merged.landing_page_url).toBe('https://lp.aceleracao.solarzap.com.br');
  });

  it('formats lead first names before rendering automation templates', () => {
    expect(normalizeAutomationPersonFirstName('LEONARDO PEREIRA')).toBe('Leonardo');
    expect(normalizeAutomationPersonFirstName('maria eduarda silva')).toBe('Maria');
    expect(normalizeAutomationPersonFirstName('JOAO DA SILVA')).toBe('Joao');
    expect(normalizeAutomationPersonFirstName('Dra. ANA CAROLINA')).toBe('Ana');
  });

  it('keeps a formatted full name available for administrative templates', () => {
    expect(normalizeAutomationPersonFullName('LEONARDO PEREIRA')).toBe('Leonardo Pereira');
    expect(normalizeAutomationPersonFullName('JOAO DA SILVA')).toBe('Joao da Silva');
  });

  it('uses a safe fallback for values that are not person names', () => {
    expect(normalizeAutomationPersonFirstName('5511999999999')).toBe('Cliente');
    expect(normalizeAutomationPersonFirstName('lead@example.com')).toBe('Cliente');
    expect(normalizeAutomationPersonFirstName('https://example.com')).toBe('Cliente');
  });

  it('renders missing scheduling links as empty values', () => {
    expect(renderAutomationTemplate('Oi, {{nome}} {{link_agendamento}}', { nome: 'Leonardo' })).toBe('Oi, Leonardo ');
  });

  it('reports template tokens', () => {
    const template = 'Oi, {{nome}}. Entramos as {{hora}} pelo {{link_reuniao}}';

    expect(extractAutomationTemplateTokens(template)).toEqual(['nome', 'hora', 'link_reuniao']);
  });
});
