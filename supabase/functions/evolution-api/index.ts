import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Evolution API base configuration
const getEvolutionConfig = () => {
  const baseUrl = Deno.env.get('EVOLUTION_API_URL')
  const apiKey = Deno.env.get('EVOLUTION_API_KEY')

  console.log('=== Evolution API Config Debug ===')
  console.log('EVOLUTION_API_URL exists:', !!baseUrl)
  console.log('EVOLUTION_API_URL value:', baseUrl ? baseUrl.substring(0, 30) + '...' : 'NOT SET')
  console.log('EVOLUTION_API_KEY exists:', !!apiKey)
  console.log('EVOLUTION_API_KEY length:', apiKey ? apiKey.length : 0)

  if (!baseUrl || !apiKey) {
    console.error('Missing config - URL:', !!baseUrl, 'KEY:', !!apiKey)
    throw new Error('Evolution API configuration missing. Please set EVOLUTION_API_URL and EVOLUTION_API_KEY.')
  }

  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

// Helper function for API calls
async function evolutionFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const { baseUrl, apiKey } = getEvolutionConfig()

  const url = `${baseUrl}${endpoint}`
  const headers = {
    'Content-Type': 'application/json',
    'apikey': apiKey,
    ...options.headers,
  }

  console.log(`Evolution API Request: ${options.method || 'GET'} ${url}`)
  console.log('Request headers (without apikey):', { ...headers, apikey: '[REDACTED]' })

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    })

    console.log('Evolution API Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Evolution API Error: ${response.status} - ${errorText}`)
      throw new Error(`Evolution API error: ${response.status} - ${errorText}`)
    }

    return response
  } catch (fetchError) {
    console.error('Fetch failed:', fetchError)
    throw new Error(`Failed to connect to Evolution API at ${url}: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}`)
  }
}

// Create a new WhatsApp instance
async function createInstance(instanceName: string, webhookUrl?: string) {
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  }

  // Configure webhook if provided
  if (webhookUrl) {
    body.webhook = {
      url: webhookUrl,
      enabled: true,
      events: [
        'QRCODE_UPDATED',
        'CONNECTION_UPDATE',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONTACTS_UPDATE',
        'PRESENCE_UPDATE',
        'CHATS_UPDATE',
        'GROUPS_UPDATE',
      ],
    }
  }

  const response = await evolutionFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return response.json()
}

// Connect instance and get QR code
async function connectInstance(instanceName: string) {
  const response = await evolutionFetch(`/instance/connect/${instanceName}`, {
    method: 'GET',
  })

  return response.json()
}

// Get instance status
async function getInstanceStatus(instanceName: string) {
  const response = await evolutionFetch(`/instance/connectionState/${instanceName}`, {
    method: 'GET',
  })

  return response.json()
}

// Fetch all instances
async function fetchInstances() {
  const response = await evolutionFetch('/instance/fetchInstances', {
    method: 'GET',
  })

  return response.json()
}

// Send text message
async function sendMessage(instanceName: string, phone: string, message: string) {
  // Format phone number (remove any non-numeric characters)
  const formattedPhone = phone.replace(/\D/g, '')

  const response = await evolutionFetch(`/message/sendText/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number: formattedPhone,
      text: message,
    }),
  })

  return response.json()
}

// Send media message (image, audio, video, document)
async function sendMedia(
  instanceName: string,
  phone: string,
  mediaUrl: string,
  mediaType: 'image' | 'audio' | 'video' | 'document',
  caption?: string,
  fileName?: string
) {
  const formattedPhone = phone.replace(/\D/g, '')

  const body: Record<string, unknown> = {
    number: formattedPhone,
    mediatype: mediaType,
    media: mediaUrl,
  }

  if (caption) body.caption = caption
  if (fileName) body.fileName = fileName

  const response = await evolutionFetch(`/message/sendMedia/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return response.json()
}

// Send audio message (voice note)
async function sendAudio(instanceName: string, phone: string, audioUrl: string) {
  const formattedPhone = phone.replace(/\D/g, '')

  const response = await evolutionFetch(`/message/sendWhatsAppAudio/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      number: formattedPhone,
      audio: audioUrl,
    }),
  })

  return response.json()
}

// Logout instance
async function logoutInstance(instanceName: string) {
  const response = await evolutionFetch(`/instance/logout/${instanceName}`, {
    method: 'DELETE',
  })

  return response.json()
}

// Delete instance
async function deleteInstance(instanceName: string) {
  const response = await evolutionFetch(`/instance/delete/${instanceName}`, {
    method: 'DELETE',
  })

  return response.json()
}

// Set webhook for instance
async function setWebhook(instanceName: string, webhookUrl: string, events?: string[]) {
  const defaultEvents = [
    'QRCODE_UPDATED',
    'CONNECTION_UPDATE',
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'MESSAGES_DELETE',
    'SEND_MESSAGE',
  ]

  const response = await evolutionFetch(`/webhook/set/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        url: webhookUrl,
        enabled: true,
        events: events || defaultEvents,
      },
    }),
  })

  return response.json()
}

// Send reaction to a message
async function sendReaction(
  instanceName: string,
  key: { remoteJid: string; fromMe: boolean; id: string },
  reaction: string
) {
  const response = await evolutionFetch(`/message/sendReaction/${instanceName}`, {
    method: 'POST',
    body: JSON.stringify({
      key,
      reaction,
    }),
  })

  return response.json()
}

// Main handler
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { action, ...params } = await req.json()

    console.log(`Evolution API action: ${action}`, params)

    let result: unknown

    switch (action) {
      case 'createInstance':
        result = await createInstance(params.instanceName, params.webhookUrl)
        break

      case 'connectInstance':
        result = await connectInstance(params.instanceName)
        break

      case 'getInstanceStatus':
        result = await getInstanceStatus(params.instanceName)
        break

      case 'fetchInstances':
        result = await fetchInstances()
        break

      case 'sendMessage':
        result = await sendMessage(params.instanceName, params.phone, params.message)
        break

      case 'sendMedia':
        result = await sendMedia(
          params.instanceName,
          params.phone,
          params.mediaUrl,
          params.mediaType,
          params.caption,
          params.fileName
        )
        break

      case 'sendAudio':
        result = await sendAudio(params.instanceName, params.phone, params.audioUrl)
        break

      case 'logoutInstance':
        result = await logoutInstance(params.instanceName)
        break

      case 'deleteInstance':
        result = await deleteInstance(params.instanceName)
        break

      case 'setWebhook':
        result = await setWebhook(params.instanceName, params.webhookUrl, params.events)
        break

      case 'sendReaction':
        result = await sendReaction(params.instanceName, params.data.key, params.data.reaction)
        break

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Evolution API error:', error)

    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
