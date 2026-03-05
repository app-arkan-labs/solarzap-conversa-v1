import { describe, expect, it } from 'vitest';
import { getPasswordRecoveryRedirectTarget } from '@/lib/passwordRecoveryRedirect';

describe('passwordRecoveryRedirect', () => {
  const baseLocation = {
    origin: 'https://app.solarzap.com',
    pathname: '/',
    search: '',
    hash: '',
  };

  it('redirects when recovery type is present in hash', () => {
    const target = getPasswordRecoveryRedirectTarget({
      ...baseLocation,
      hash: '#access_token=abc&refresh_token=def&type=recovery',
    });

    expect(target).toBe('https://app.solarzap.com/update-password#access_token=abc&refresh_token=def&type=recovery');
  });

  it('redirects when recovery type is present in search params', () => {
    const target = getPasswordRecoveryRedirectTarget({
      ...baseLocation,
      search: '?type=recovery&org_hint=org-123',
    });

    expect(target).toBe('https://app.solarzap.com/update-password?type=recovery&org_hint=org-123');
  });

  it('does not redirect when already in update-password path', () => {
    const target = getPasswordRecoveryRedirectTarget({
      ...baseLocation,
      pathname: '/update-password',
      hash: '#type=recovery&access_token=abc',
    });

    expect(target).toBeNull();
  });

  it('does not redirect when app is under a base path already on update-password', () => {
    const target = getPasswordRecoveryRedirectTarget({
      ...baseLocation,
      pathname: '/app/update-password',
      hash: '#type=recovery&access_token=abc',
    });

    expect(target).toBeNull();
  });

  it('does not redirect for non-recovery auth callback', () => {
    const target = getPasswordRecoveryRedirectTarget({
      ...baseLocation,
      hash: '#access_token=abc&type=magiclink',
    });

    expect(target).toBeNull();
  });

  it('redirects when explicit password_recovery marker is present', () => {
    const target = getPasswordRecoveryRedirectTarget({
      ...baseLocation,
      pathname: '/',
      search: '?password_recovery=1',
    });

    expect(target).toBe('https://app.solarzap.com/update-password?password_recovery=1');
  });

  it('supports hash payloads that include query segment', () => {
    const target = getPasswordRecoveryRedirectTarget({
      ...baseLocation,
      hash: '#/auth/callback?type=recovery&access_token=abc',
    });

    expect(target).toBe('https://app.solarzap.com/update-password#/auth/callback?type=recovery&access_token=abc');
  });
});
