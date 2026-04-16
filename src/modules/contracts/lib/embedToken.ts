const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64UrlEncodeBytes = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecodeBytes = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const importHmacKey = (secret: string) =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

export interface ContractEmbedTokenPayload {
  session_id: string;
  draft_id: string;
  org_id: string;
  exp: number;
}

export const signContractEmbedToken = async (
  payload: ContractEmbedTokenPayload,
  secret: string,
) => {
  const header = { alg: 'HS256', typ: 'CONTRACT_EMBED' };
  const headerEncoded = base64UrlEncodeBytes(encoder.encode(JSON.stringify(header)));
  const payloadEncoded = base64UrlEncodeBytes(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const signatureEncoded = base64UrlEncodeBytes(new Uint8Array(signature));
  return `${signingInput}.${signatureEncoded}`;
};

export const verifyContractEmbedToken = async (
  token: string,
  secret: string,
): Promise<ContractEmbedTokenPayload | null> => {
  const [header, payload, signature] = String(token || '').split('.');
  if (!header || !payload || !signature) return null;

  const signingInput = `${header}.${payload}`;
  const key = await importHmacKey(secret);
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const expectedEncoded = base64UrlEncodeBytes(new Uint8Array(expected));
  if (expectedEncoded !== signature) return null;

  try {
    const parsed = JSON.parse(decoder.decode(base64UrlDecodeBytes(payload))) as ContractEmbedTokenPayload;
    if (
      !parsed.session_id ||
      !parsed.draft_id ||
      !parsed.org_id ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp <= 0
    ) {
      return null;
    }
    if (Math.floor(Date.now() / 1000) > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
};
