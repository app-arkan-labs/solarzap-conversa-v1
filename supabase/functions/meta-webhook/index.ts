const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Valid verify tokens - must match what you configured in Meta
const VALID_VERIFY_TOKENS = [
  'meu_verify_token_solarzap_123',
  'meu_verify_token_instagram_123'
]

Deno.serve(async (req) => {
  const url = new URL(req.url)
  
  // Handle webhook verification (GET request from Meta)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    console.log('Webhook verification request:', { mode, token, challenge })

    if (mode === 'subscribe' && token && VALID_VERIFY_TOKENS.includes(token)) {
      console.log('Webhook verified successfully')
      return new Response(challenge, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    } else {
      console.error('Webhook verification failed - token mismatch')
      return new Response('Forbidden', { status: 403 })
    }
  }

  // Handle OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Handle incoming webhook events (POST)
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      console.log('Meta webhook received:', JSON.stringify(body, null, 2))

      // Process the webhook event
      const { object, entry } = body

      if (object === 'page' || object === 'instagram') {
        for (const entryItem of entry || []) {
          const messaging = entryItem.messaging || entryItem.changes || []
          
          for (const event of messaging) {
            if (event.message) {
              // Handle incoming message
              console.log('Incoming message:', {
                platform: object,
                sender: event.sender?.id,
                recipient: event.recipient?.id,
                message: event.message,
                timestamp: event.timestamp
              })

              // TODO: Save message to database when messages table is created
            }

            if (event.postback) {
              console.log('Postback received:', event.postback)
            }

            if (event.read) {
              console.log('Message read:', event.read)
            }

            if (event.delivery) {
              console.log('Message delivered:', event.delivery)
            }
          }
        }
      }

      // Always respond with 200 OK to acknowledge receipt
      return new Response(JSON.stringify({ status: 'EVENT_RECEIVED' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Webhook error:', error)
      
      // Still return 200 to prevent Meta from retrying
      return new Response(JSON.stringify({ status: 'ERROR', message: errorMessage }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response('Method not allowed', { status: 405 })
})
