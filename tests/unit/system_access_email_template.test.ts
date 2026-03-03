import { describe, expect, it } from 'vitest';

import {
  systemAccountCreatedEmail,
  systemInviteEmail,
} from '../../supabase/functions/_shared/emailTemplates.ts';

describe('system access email templates', () => {
  it('renders temporary password flow for account creation', () => {
    const rendered = systemAccountCreatedEmail({
      senderName: 'SolarZap',
      orgName: 'Org Test',
      role: 'user',
      recipientEmail: 'member@example.test',
      tempPassword: 'Tmp!Password123',
      loginUrl: 'https://app.example.test/login',
    });

    expect(rendered.html).toContain('Senha tempor');
    expect(rendered.html).toContain('Tmp!Password123');
    expect(rendered.text).toContain('Senha tempor');
    expect(rendered.text).toContain('Tmp!Password123');
    expect(rendered.text).toContain('https://app.example.test/login');
  });

  it('renders reset link flow when account already exists', () => {
    const rendered = systemAccountCreatedEmail({
      senderName: 'SolarZap',
      orgName: 'Org Test',
      role: 'user',
      recipientEmail: 'member@example.test',
      resetLink: 'https://app.example.test/update-password?token=abc',
      loginUrl: 'https://app.example.test/login',
    });

    expect(rendered.html).toContain('Definir/Redefinir senha');
    expect(rendered.html).toContain('https://app.example.test/update-password?token=abc');
    expect(rendered.text).toContain('Defina/redefina sua senha');
    expect(rendered.text).toContain('https://app.example.test/update-password?token=abc');
    expect(rendered.text).not.toContain('Senha tempor');
  });

  it('prioritizes password setup link in invite email CTA', () => {
    const rendered = systemInviteEmail({
      senderName: 'SolarZap',
      orgName: 'Org Test',
      role: 'user',
      recipientEmail: 'member@example.test',
      inviteLink:
        'https://app.example.test/auth/v1/verify?type=invite&redirect_to=https%3A%2F%2Fapp.example.test%2Fupdate-password%3Forg_hint%3D11111111-1111-1111-1111-111111111111',
      loginUrl: 'https://app.example.test/login',
    });

    expect(rendered.html).toContain('Acessar SolarZap');
    expect(rendered.html).toContain('type=invite');
    expect(rendered.html).toContain('update-password');
    expect(rendered.html).toContain('org_hint');
    expect(rendered.text).toContain('definir/redefinir sua senha');
    expect(rendered.text).toContain('update-password');
    expect(rendered.text).toContain('org_hint');
    expect(rendered.html).not.toContain('https://app.example.test/login');
    expect(rendered.text).not.toContain('https://app.example.test/login');
  });
});
