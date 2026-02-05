// =====================================================
// CONFIGURAÇÃO DE MODO DE DESENVOLVIMENTO
// =====================================================
// 
// DEV_MODE = true  → Pula autenticação (desenvolvimento)
// DEV_MODE = false → Usa autenticação normal (produção)
//
// USE_MOCK_DATA = true  → Usa dados fake (sem chamar APIs)
// USE_MOCK_DATA = false → Usa Evolution API real
//
// EDGE_FUNCTION_FALLBACK = true → Se Edge Function falhar, usa modo mock
//
// Para produção: DEV_MODE = false, USE_MOCK_DATA = false
// =====================================================

export const DEV_MODE = false;
export const USE_MOCK_DATA = false;

// Se true, usa mock data quando Edge Function não responde
export const EDGE_FUNCTION_FALLBACK = true;
