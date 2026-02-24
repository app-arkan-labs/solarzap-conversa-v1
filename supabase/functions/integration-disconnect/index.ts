import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
if (!ALLOWED_ORIGIN) {
  throw new Error('Missing ALLOWED_ORIGIN env')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
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
    console.error('Disconnect error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
