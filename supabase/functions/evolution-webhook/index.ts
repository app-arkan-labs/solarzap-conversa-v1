// DEPRECATED: this function has been replaced by `whatsapp-webhook`
// The new webhook consolidates logic and uses a safer secret validation.
// For now we proxy all requests to the canonical endpoint so old URLs continue to work.

import { createClient } from 'npm:@supabase/supabase-js@2'

// CORS headers are irrelevant since we simply forward to the other function

function onlyDigits(str: string | null | undefined): string {
    if (!str) return ''
    return str.replace(/\D/g, '')
}

function sanitizePathPart(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function normalizeEvent(raw: string | null) {
    if (!raw) return null
    return raw.trim().toUpperCase().replaceAll('.', '_').replaceAll('-', '_')
}

function inferEventFromPath(pathname: string) {
    const last = pathname.split('/').filter(Boolean).pop() || ''
    const maybe = normalizeEvent(last)
    const known = new Set(['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'MESSAGES_DELETE', 'SEND_MESSAGE'])
    return known.has(maybe || '') ? maybe : null
}

function extractMessageContent(msg: any) {
    const m = msg?.message || {}
    const type = msg?.messageType || msg?.type || Object.keys(m)[0]

    if (type === 'conversation') return m.conversation
    if (type === 'extendedTextMessage') return m.extendedTextMessage?.text

    if (type === 'audioMessage') {
        const duration = m.audioMessage?.seconds || 0
        return `🎤 Áudio (${duration}s)`
    }
    if (type === 'imageMessage') {
        return `🖼️ ${m.imageMessage?.caption || 'Imagem recebida'}`
    }
    if (type === 'videoMessage') {
        return `🎬 ${m.videoMessage?.caption || 'Vídeo recebido'}`
    }
    if (type === 'documentMessage') {
        return `📎 ${m.documentMessage?.fileName || 'Documento'}`
    }
    if (type === 'stickerMessage') {
        return `🖼️ Sticker`
    }

    if (m?.conversation) return m.conversation
    if (m?.extendedTextMessage?.text) return m.extendedTextMessage.text

    return `Mensagem recebida (tipo: ${type || 'desconhecido'})`
}

async function uploadMedia(
    supabase: any,
    data: string | Uint8Array,
    mimeType: string,
    orgId: string,
    instanceName: string,
    inputType: 'base64' | 'binary'
): Promise<string | null> {
    if (!orgId) {
        throw new Error('Missing org_id for media upload')
    }
    if (!instanceName) {
        throw new Error('Missing instance_name for media upload')
    }

    console.log(`🚀 Starting media upload for org: ${orgId}, mime: ${mimeType}, type: ${inputType}`)
    try {
        let bytes: Uint8Array

        if (inputType === 'base64') {
            const binaryString = atob(data as string)
            const len = binaryString.length
            bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i)
            }
        } else {
            bytes = data as Uint8Array
        }

        const ext = mimeType.split('/')[1] || 'bin'
        const fileName = `${Math.random().toString(36).substring(2, 10)}.${ext}`
        const safeInstanceName = sanitizePathPart(instanceName)
        const filePath = `${orgId}/instances/${safeInstanceName}/${Date.now()}_${fileName}`

        console.log(`📦 Uploading to storage path: ${filePath}`)

        const { error } = await supabase.storage
            .from('chat-attachments')
            .upload(filePath, bytes, {
                contentType: mimeType,
                upsert: false
            })

        if (error) {
            console.error('❌ Upload error:', error)
            return null
        }

        const { data: publicData } = supabase.storage
            .from('chat-attachments')
            .getPublicUrl(filePath)

        console.log(`✅ Upload success, public URL: ${publicData.publicUrl}`)
        return publicData.publicUrl

    } catch (err: any) {
        console.error('❌ Media processing error:', err)
        return null
    }
}

async function fetchBase64FromEvolution(
    instanceName: string,
    messageData: any
): Promise<{ base64: string; mimeType: string } | null> {
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL') || 'https://evo.arkanlabs.com.br'
    const apiKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!apiKey) {
        console.error('❌ EVOLUTION_API_KEY not set')
        return null
    }

    try {
        const response = await fetch(
            `${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey
                },
                body: JSON.stringify({ message: messageData })
            }
        )

        if (!response.ok) {
            const errorText = await response.text()
            console.error(`❌ Evolution base64 failed: ${response.status} - ${errorText}`)
            return null
        }

        const data = await response.json()
        return {
            base64: data.base64,
            mimeType: data.mimetype || 'application/octet-stream'
        }
    } catch (err: any) {
        console.error('❌ Evolution base64 exception:', err?.message || err)
        return null
    }
}

// DEPRECATED handler: simply proxy all requests to whatsapp-webhook
Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || new URL(req.url).origin;
  const target = supabaseUrl.replace(/\/$/, '') + '/functions/v1/whatsapp-webhook' + new URL(req.url).search;
  return await fetch(target, { method: req.method, headers: req.headers, body: req.body });
});
