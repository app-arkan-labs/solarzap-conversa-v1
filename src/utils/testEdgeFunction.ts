/**
 * Utilitário para testar a Edge Function whatsapp-connect
 * Execute no console do navegador: testWhatsAppEdgeFunction()
 */

const SUPABASE_URL = 'https://ucwmcmdwbvrwotuzlmxh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjd21jbWR3YnZyd290dXpsbXhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgwMzkyMTEsImV4cCI6MjA4MzYxNTIxMX0.KMk4XqFCm4FkvOZg7LNWaI_4lknMwcdCkYSGjBjDdOg';

export async function testWhatsAppEdgeFunction() {
  console.log('🔍 Testando Edge Function whatsapp-connect...');
  console.log('URL:', `${SUPABASE_URL}/functions/v1/whatsapp-connect`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: 'list' })
    });

    console.log('📡 Status:', response.status, response.statusText);
    console.log('📋 Headers:', Object.fromEntries(response.headers.entries()));

    const text = await response.text();
    console.log('📄 Response (raw):', text);

    try {
      const json = JSON.parse(text);
      console.log('✅ Response (parsed):', json);
      
      if (json.configured === false) {
        console.warn('⚠️ Evolution API não configurada. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY nos Secrets.');
      } else if (json.error) {
        console.error('❌ Erro retornado:', json.error);
      } else {
        console.log('✅ Edge Function funcionando!');
      }
      
      return json;
    } catch {
      console.error('❌ Resposta não é JSON válido');
      return { error: 'Invalid JSON', raw: text };
    }
  } catch (error) {
    console.error('❌ Falha na requisição:', error);
    
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      console.error(`
╔════════════════════════════════════════════════════════════════╗
║  EDGE FUNCTION NÃO ESTÁ ATIVA                                  ║
╠════════════════════════════════════════════════════════════════╣
║  A função whatsapp-connect não foi deployada ou está offline.  ║
║                                                                ║
║  SOLUÇÕES:                                                     ║
║  1. Acesse: Supabase Dashboard > Edge Functions                ║
║  2. Verifique se 'whatsapp-connect' existe                     ║
║  3. Se não existir, faça deploy manual via CLI:                ║
║     supabase functions deploy whatsapp-connect                 ║
║  4. Se existir, verifique os logs para erros                   ║
╚════════════════════════════════════════════════════════════════╝
      `);
    }
    
    return { error: String(error) };
  }
}

// Expor globalmente para uso no console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).testWhatsAppEdgeFunction = testWhatsAppEdgeFunction;
}

export default testWhatsAppEdgeFunction;
