const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
  throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS preflight - MUST come first
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  try {
    let platform = 'messenger'
    
    try {
      const body = await req.json()
      platform = body.platform || 'messenger'
    } catch {
      // Use default platform if body parsing fails
    }
    
    if (!['messenger', 'instagram'].includes(platform)) {
      return new Response(JSON.stringify({ 
        error: 'Plataforma inválida',
        details: 'Platform deve ser "messenger" ou "instagram"'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const appId = Deno.env.get('META_APP_ID')
    
    if (!appId) {
      return new Response(JSON.stringify({ 
        error: `Meta ${platform} não configurado`,
        details: 'Configure META_APP_ID nos secrets do Cloud',
        setup_required: true
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    if (!supabaseUrl) {
      return new Response(JSON.stringify({ 
        error: 'Configuração inválida',
        details: 'SUPABASE_URL não está configurado'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const redirectUri = `${supabaseUrl}/functions/v1/meta-callback`
    const userId = 'dev-user-test'

    const scopes = platform === 'messenger'
      ? ['pages_show_list', 'pages_messaging', 'pages_read_engagement', 'pages_manage_metadata']
      : ['instagram_basic', 'instagram_manage_messages', 'pages_show_list', 'pages_read_engagement']

    const state = btoa(JSON.stringify({ 
      user_id: userId,
      platform,
      redirect_url: req.headers.get('origin') || ''
    }))

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${encodeURIComponent(appId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scopes.join(','))}&` +
      `response_type=code&` +
      `state=${encodeURIComponent(state)}`

    return new Response(JSON.stringify({ authUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Meta OAuth error:', error)
    return new Response(JSON.stringify({ 
      error: 'Erro interno'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
