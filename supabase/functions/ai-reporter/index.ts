const ALLOWED_ORIGIN = (Deno.env.get('ALLOWED_ORIGIN') || '').trim()
const ALLOW_WILDCARD_CORS = String(Deno.env.get('ALLOW_WILDCARD_CORS') || '').trim().toLowerCase() === 'true'

if (!ALLOWED_ORIGIN && !ALLOW_WILDCARD_CORS) {
  throw new Error('Missing ALLOWED_ORIGIN env (or set ALLOW_WILDCARD_CORS=true)')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-api-key',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const invocation = {
    method: req.method,
    hasAuthorization: Boolean(req.headers.get('authorization') || req.headers.get('Authorization')),
    hasInternalHeader: Boolean(req.headers.get('x-internal-api-key')),
    path: '/functions/v1/ai-reporter',
  }

  console.warn('[ai-reporter][deprecated_digest_engine_invocation]', invocation)

  return new Response(
    JSON.stringify({
      success: false,
      code: 'deprecated_digest_engine',
      error: 'Endpoint descontinuado. Use /functions/v1/ai-digest-worker.',
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
