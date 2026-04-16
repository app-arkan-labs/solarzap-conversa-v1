const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '==='.slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const importHmacKey = async (secret: string) =>
  await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

export type ContractEmbedTokenPayload = {
  session_id: string;
  draft_id: string;
  org_id: string;
  exp: number;
};

export const signContractEmbedToken = async (
  payload: ContractEmbedTokenPayload,
  secret: string,
): Promise<string> => {
  const headerEncoded = base64UrlEncode(
    encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'CONTRACT_EMBED' })),
  );
  const payloadEncoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
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
  const expectedEncoded = base64UrlEncode(new Uint8Array(expected));
  if (expectedEncoded !== signature) return null;

  try {
    const parsed = JSON.parse(decoder.decode(base64UrlDecode(payload))) as ContractEmbedTokenPayload;
    if (
      !parsed.session_id ||
      !parsed.draft_id ||
      !parsed.org_id ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp <= 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
