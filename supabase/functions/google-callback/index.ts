import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    if (error) {
      return createRedirectResponse('error', `OAuth error: ${error}`)
    }

    if (!code || !state) {
      return createRedirectResponse('error', 'Missing code or state')
    }

    // Decode state to get user_id
    let stateData: { user_id: string; redirect_url: string }
    try {
      stateData = JSON.parse(atob(state))
    } catch {
      return createRedirectResponse('error', 'Invalid state')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Google credentials from database
    const { data: googleConfig } = await supabase.rpc('get_provider_config', { 
      p_provider: 'google' 
    })

    if (!googleConfig || !googleConfig.client_id || !googleConfig.client_secret) {
      return createRedirectResponse('error', 'Google credentials not configured', stateData.redirect_url)
    }

    const clientId = googleConfig.client_id
    const clientSecret = googleConfig.client_secret
    const redirectUri = `${supabaseUrl}/functions/v1/google-callback`

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = await tokenResponse.json()
    if (tokenData.error) {
      console.error('Token exchange error:', tokenData)
      return createRedirectResponse('error', tokenData.error_description || tokenData.error, stateData.redirect_url)
    }

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const userInfo = await userInfoResponse.json()

    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000))

    const { error: upsertError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id: stateData.user_id,
        provider: 'google',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        account_email: userInfo.email,
        account_name: userInfo.name,
        account_picture: userInfo.picture,
        services: { calendar: true, gmail: true, meet: true },
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      })

    if (upsertError) {
      console.error('Database error:', upsertError)
      return createRedirectResponse('error', 'Failed to save integration', stateData.redirect_url)
    }

    return createRedirectResponse('success', 'google', stateData.redirect_url)
  } catch (error: unknown) {
    console.error('Callback error:', error)
    return createRedirectResponse('error', 'Integration failed')
  }
})

function createRedirectResponse(status: string, message: string, baseUrl?: string): Response {
  const redirectUrl = baseUrl || Deno.env.get('SITE_URL') || 'http://localhost:5173'
  const url = `${redirectUrl}/?integration_status=${status}&provider=${status === 'success' ? message : 'google'}&message=${encodeURIComponent(message)}`
  
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  })
}
