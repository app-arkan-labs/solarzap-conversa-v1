import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveRequestCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  const cors = resolveRequestCors(req)
  const corsHeaders = cors.corsHeaders

  if (req.method === 'OPTIONS') {
    if (cors.missingAllowedOriginConfig) {
      return new Response(JSON.stringify({ error: 'missing_allowed_origin' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!cors.originAllowed) {
      return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    return new Response(null, { headers: corsHeaders })
  }

  if (cors.missingAllowedOriginConfig) {
    return new Response(JSON.stringify({ error: 'missing_allowed_origin' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!cors.originAllowed) {
    return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { provider } = await req.json()
    
    if (!provider) {
      throw new Error('Provider is required')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    
    // Extract user_id from JWT token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Authorization header required')
    }
    
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      throw new Error('User not authenticated')
    }

    // Use service role to delete
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // For Google, we could revoke the token, but for simplicity we just delete from DB
    // The token will be invalidated on Google's side after some time anyway
    if (provider === 'google') {
      const { data: integration } = await supabaseAdmin
        .from('user_integrations')
        .select('access_token')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .single()

      if (integration?.access_token) {
        // Try to revoke the Google token (best effort)
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${integration.access_token}`, {
            method: 'POST',
          })
        } catch (e) {
          console.log('Token revocation failed (might already be expired):', e)
        }
      }
    }

    // Delete the integration from database
    const { error: deleteError } = await supabaseAdmin
      .from('user_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', provider)

    if (deleteError) {
      throw deleteError
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Disconnect error:', error)
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
