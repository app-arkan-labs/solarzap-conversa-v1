import { describe, expect, it } from 'vitest';

import {
  extractAutomationTemplateTokens,
  mergeAutomationTemplatePayload,
  renderAutomationTemplate,
} from '../../supabase/functions/internal-crm-api/templatePayload';

describe('internal CRM automation template payload', () => {
  it('preserves a resolved fallback when later sources provide null or blank values', () => {
    const merged = mergeAutomationTemplatePayload(
      {
        link_agendamento: 'https://lp.aceleracao.solarzap.com.br',
        nome: 'Jaime',
      },
      {
        link_agendamento: null,
      },
      {
        link_agendamento: '   ',
      },
    );

    expect(merged.link_agendamento).toBe('https://lp.aceleracao.solarzap.com.br');
  });

  it('fills missing values from later meaningful sources without overwriting stronger values', () => {
    const merged = mergeAutomationTemplatePayload(
      {
        link_agendamento: '',
        nome: 'Anderson',
      },
      {
        landing_page_url: 'https://lp.aceleracao.solarzap.com.br',
        link_agendamento: 'https://lp.aceleracao.solarzap.com.br',
      },
      {
        link_agendamento: null,
      },
    );

    expect(merged.link_agendamento).toBe('https://lp.aceleracao.solarzap.com.br');
    expect(merged.landing_page_url).toBe('https://lp.aceleracao.solarzap.com.br');
  });

  it('renders templates and reports only the expected tokens', () => {
    const template = 'Oi, {{nome}}. Escolhe aqui: {{link_agendamento}}';
    const rendered = renderAutomationTemplate(template, {
      nome: 'Jaime',
      link_agendamento: 'https://lp.aceleracao.solarzap.com.br',
    });

    expect(rendered).toBe('Oi, Jaime. Escolhe aqui: https://lp.aceleracao.solarzap.com.br');
    expect(extractAutomationTemplateTokens(template)).toEqual(['nome', 'link_agendamento']);
  });
});
