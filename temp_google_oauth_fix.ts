import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

        if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) throw new Error('Vars missing')

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('No auth header')

        const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })

        // Validate user
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Get Provider Config
        const supabaseService = createClient(supabaseUrl, supabaseServiceKey)
        const { data: googleConfig, error: configError } = await supabaseService.rpc('get_provider_config', { p_provider: 'google' })

        let clientId = Deno.env.get('GOOGLE_CLIENT_ID')
        if (googleConfig && googleConfig.length > 0) clientId = googleConfig[0].client_id

        if (!clientId) throw new Error('No Client ID')

        const redirectUri = `${supabaseUrl}/functions/v1/google-callback`
        const scopes = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid'

        const state = btoa(JSON.stringify({
            user_id: user.id,
            redirect_url: req.headers.get('origin') || 'http://localhost:5173'
        }))

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`

        return new Response(JSON.stringify({ authUrl }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
})
