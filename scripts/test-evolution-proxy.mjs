#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'QA_EMAIL', 'QA_PASSWORD']
const missing = required.filter((key) => !process.env[key])
if (missing.length > 0) {
  console.error(`Missing required env vars: ${missing.join(', ')}`)
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const qaEmail = process.env.QA_EMAIL
const qaPassword = process.env.QA_PASSWORD

const supabase = createClient(supabaseUrl, supabaseAnonKey)

function decodeJwtClaims(jwt) {
  const parts = jwt.split('.')
  if (parts.length < 2) return null
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4))
    return JSON.parse(Buffer.from(payload + pad, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email: qaEmail,
  password: qaPassword,
})

if (authError || !authData?.session?.access_token) {
  console.error('AUTH_ERROR', authError?.message || 'No access token in session')
  process.exit(1)
}

const claims = decodeJwtClaims(authData.session.access_token)
const host = new URL(supabaseUrl).host

console.log(
  JSON.stringify(
    {
      auth: 'ok',
      projectHost: host,
      jwtIss: claims?.iss || null,
      jwtAud: claims?.aud || null,
      jwtRole: claims?.role || null,
    },
    null,
    2,
  ),
)

const { data, error } = await supabase.functions.invoke('evolution-proxy', {
  body: { action: 'ping' },
})

console.log(
  JSON.stringify(
    {
      invokeError: error
        ? {
            message: error.message,
            name: error.name,
            context: error.context || null,
          }
        : null,
      invokeData: data || null,
    },
    null,
    2,
  ),
)

if (error) {
  process.exit(2)
}
