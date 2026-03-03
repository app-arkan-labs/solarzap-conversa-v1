import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

import { connectInstance, createInstance, sendMessage, sendSticker } from '@/lib/evolutionApi';

describe('evolutionApi contract normalization', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('unwraps success envelope and exposes inner payload', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          qrcode: {
            base64: 'QR_ENVELOPE_BASE64',
            code: 'QR_CODE',
          },
        },
      },
      error: null,
    });

    const response = await createInstance('instance-test');

    expect(response.success).toBe(true);
    expect(response.data?.qrcode?.base64).toBe('QR_ENVELOPE_BASE64');
  });

  it('propagates envelope error when success=false (HTTP 200)', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: false,
        error: 'Instance creation failed',
      },
      error: null,
    });

    const response = await connectInstance('instance-test');

    expect(response.success).toBe(false);
    expect(response.error).toContain('Instance creation failed');
  });

  it('supports raw payload compatibility', async () => {
    invokeMock.mockResolvedValue({
      data: {
        base64: 'RAW_QR_BASE64',
        code: 'RAW_QR_CODE',
      },
      error: null,
    });

    const response = await connectInstance('instance-test');

    expect(response.success).toBe(true);
    expect(response.data?.base64).toBe('RAW_QR_BASE64');
    expect(response.data?.code).toBe('RAW_QR_CODE');
  });

  it('keeps message key.id accessible after envelope normalization', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          key: {
            id: 'msg-123',
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: true,
          },
          status: 'PENDING',
        },
      },
      error: null,
    });

    const response = await sendMessage('instance-test', '5511999999999', 'hello');

    expect(response.success).toBe(true);
    expect(response.data?.key?.id).toBe('msg-123');
  });

  it('routes sendSticker through evolution-proxy with sticker payload', async () => {
    const stickerUrl = 'https://cdn.example.com/funny.gif';
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          key: {
            id: 'stk-123',
            remoteJid: '5511999999999@s.whatsapp.net',
            fromMe: true,
          },
          status: 'PENDING',
        },
      },
      error: null,
    });

    const response = await sendSticker('instance-test', '5511999999999', stickerUrl);

    expect(response.success).toBe(true);
    expect(response.data?.key?.id).toBe('stk-123');

    const invokeCall = invokeMock.mock.calls.at(-1);
    expect(invokeCall?.[0]).toBe('evolution-proxy');
    const payload = JSON.parse(String(invokeCall?.[1]?.body || '{}'));
    expect(payload.action).toBe('sendSticker');
    expect(payload.payload.sticker).toBe(stickerUrl);
    expect(payload.payload.number).toBe('5511999999999');
  });
});
