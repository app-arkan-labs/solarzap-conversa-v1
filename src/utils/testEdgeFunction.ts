/**
 * Browser utility to test whatsapp-connect edge function.
 * Usage in dev console: testWhatsAppEdgeFunction()
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export async function testWhatsAppEdgeFunction() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment.');
    return { error: 'missing_env' };
  }

  const url = `${SUPABASE_URL}/functions/v1/whatsapp-connect`;
  console.log('Testing edge function:', url);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: 'list' }),
    });

    const raw = await response.text();
    console.log('Status:', response.status, response.statusText);
    console.log('Response raw:', raw);

    try {
      const json = JSON.parse(raw);
      console.log('Response json:', json);
      return json;
    } catch {
      return { error: 'invalid_json', raw };
    }
  } catch (error) {
    console.error('Request failed:', error);
    return { error: String(error) };
  }
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).testWhatsAppEdgeFunction = testWhatsAppEdgeFunction;
}

export default testWhatsAppEdgeFunction;
