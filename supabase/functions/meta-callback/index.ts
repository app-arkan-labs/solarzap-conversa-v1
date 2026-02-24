import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorReason = url.searchParams.get('error_reason')

    if (error) {
      return createRedirectResponse('error', `OAuth error: ${errorReason || error}`)
    }

    if (!code || !state) {
      return createRedirectResponse('error', 'Missing code or state')
    }

    // Decode state to get user_id and platform
    let stateData: { user_id: string; platform: string; redirect_url: string }
    try {
      stateData = JSON.parse(atob(state))
    } catch {
      return createRedirectResponse('error', 'Invalid state')
    }

    const { platform } = stateData
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get Meta credentials from database
    const { data: appConfig } = await supabase.rpc('get_provider_config', { 
      p_provider: platform 
    })

    if (!appConfig || !appConfig.app_id || !appConfig.app_secret) {
      return createRedirectResponse('error', `Meta ${platform} credentials not configured`, stateData.redirect_url)
    }

    const appId = appConfig.app_id
    const appSecret = appConfig.app_secret
    const redirectUri = `${supabaseUrl}/functions/v1/meta-callback`

    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `client_id=${appId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `client_secret=${appSecret}&` +
      `code=${code}`

    const tokenResponse = await fetch(tokenUrl)
    const tokenData = await tokenResponse.json()
    
    if (tokenData.error) {
      console.error('Token exchange error:', tokenData)
      return createRedirectResponse('error', tokenData.error.message, stateData.redirect_url)
    }

    // Get long-lived token
    const longLivedUrl = `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `grant_type=fb_exchange_token&` +
      `client_id=${appId}&` +
      `client_secret=${appSecret}&` +
      `fb_exchange_token=${tokenData.access_token}`

    const longLivedResponse = await fetch(longLivedUrl)
    const longLivedData = await longLivedResponse.json()
    
    const accessToken = longLivedData.access_token || tokenData.access_token
    const expiresIn = longLivedData.expires_in || tokenData.expires_in || 5184000 // 60 days default

    // Get user info
    const userInfoUrl = `https://graph.facebook.com/v18.0/me?fields=id,name,email,picture&access_token=${accessToken}`
    const userInfoResponse = await fetch(userInfoUrl)
    const userInfo = await userInfoResponse.json()

    // Get pages (for Messenger) or Instagram accounts
    let pageId = null
    let pageName = null

    if (platform === 'messenger') {
      const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`
      const pagesResponse = await fetch(pagesUrl)
      const pagesData = await pagesResponse.json()
      
      if (pagesData.data && pagesData.data.length > 0) {
        pageId = pagesData.data[0].id
        pageName = pagesData.data[0].name
      }
    } else {
      // Instagram: get connected Instagram business accounts
      const igUrl = `https://graph.facebook.com/v18.0/me/accounts?fields=instagram_business_account{id,username}&access_token=${accessToken}`
      const igResponse = await fetch(igUrl)
      const igData = await igResponse.json()
      
      if (igData.data) {
        for (const page of igData.data) {
          if (page.instagram_business_account) {
            pageId = page.instagram_business_account.id
            pageName = page.instagram_business_account.username
            break
          }
        }
      }
    }

    const expiresAt = new Date(Date.now() + (expiresIn * 1000))
    const provider = platform === 'messenger' ? 'meta_messenger' : 'meta_instagram'

    const { error: upsertError } = await supabase
      .from('user_integrations')
      .upsert({
        user_id: stateData.user_id,
        provider,
        access_token: accessToken,
        token_expires_at: expiresAt.toISOString(),
        account_email: userInfo.email,
        account_name: userInfo.name,
        account_picture: userInfo.picture?.data?.url,
        page_id: pageId,
        page_name: pageName,
        services: platform === 'messenger' 
          ? { messaging: true, pages: true }
          : { messaging: true, instagram: true },
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      })

    if (upsertError) {
      console.error('Database error:', upsertError)
      return createRedirectResponse('error', 'Failed to save integration', stateData.redirect_url)
    }

    return createRedirectResponse('success', provider, stateData.redirect_url)
  } catch (error: unknown) {
    console.error('Callback error:', error)
    return createRedirectResponse('error', 'Integration failed')
  }
})

function createRedirectResponse(status: string, message: string, baseUrl?: string): Response {
  const redirectUrl = baseUrl || Deno.env.get('SITE_URL') || 'http://localhost:5173'
  const url = `${redirectUrl}/?integration_status=${status}&provider=${status === 'success' ? message : 'meta'}&message=${encodeURIComponent(message)}`
  
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  })
}
