import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-arkan-webhook-secret',
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

function normalizeWhatsId(remoteJid: string) {
    return remoteJid.split('@')[0]
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
    instanceName: string,
    inputType: 'base64' | 'binary'
): Promise<string | null> {
    console.log(`🚀 Starting media upload for instance: ${instanceName}, mime: ${mimeType}, type: ${inputType}`)
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
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
        const filePath = `images/${instanceName}/${fileName}`

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
    const apiKey = Deno.env.get('EVOLUTION_API_KEY') || 'eef86d79f253d5f295edcd33b578c94b'

    console.log(`📡 Fetching base64 from Evolution for instance: ${instanceName}`)

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
        console.log(`✅ Got base64 from Evolution, length: ${data.base64?.length || 0}`)

        return {
            base64: data.base64,
            mimeType: data.mimetype || 'application/octet-stream'
        }
    } catch (err: any) {
        console.error('❌ Evolution base64 exception:', err?.message || err)
        return null
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(req.url)

    try {
        const body = await req.json()
        const eventRaw = body?.event ?? body?.data?.event ?? null
        const event = normalizeEvent(eventRaw) ?? inferEventFromPath(url.pathname)
        const instanceName = body?.instance || body?.instanceName || body?.data?.instance || body?.data?.instanceName || null

        console.log(`📊 Webhook received: ${event} | Instance: ${instanceName}`)

        if (!instanceName || !event) {
            console.log('⚠️ Missing instanceName or event, returning early.')
            return new Response(JSON.stringify({ received: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const data = body?.data ?? body

        switch (event) {
            case 'QRCODE_UPDATED': {
                const qr = data?.qrcode?.base64 || body?.qrcode?.base64 || data?.qrcode || null
                await supabase
                    .from('whatsapp_instances')
                    .update({ qr_code: qr, status: 'connecting' })
                    .eq('instance_name', instanceName)
                break
            }
            case 'CONNECTION_UPDATE': {
                const state = data?.state || body?.state
                let status = 'disconnected'
                let phoneNumber = null

                if (state === 'open') {
                    status = 'connected'
                    phoneNumber = data?.wid?.user || body?.wid?.user || null
                    if (phoneNumber) phoneNumber = String(phoneNumber).replace('@s.whatsapp.net', '')
                } else if (state === 'connecting') {
                    status = 'connecting'
                }

                await supabase
                    .from('whatsapp_instances')
                    .update({
                        status,
                        phone_number: phoneNumber,
                        qr_code: status === 'connected' ? null : undefined,
                        connected_at: status === 'connected' ? new Date().toISOString() : undefined
                    })
                    .eq('instance_name', instanceName)
                break
            }
            case 'MESSAGES_UPSERT': {
                const msg = data?.data || data || body?.data
                const remoteJid = msg?.key?.remoteJid || msg?.remoteJid || null
                const isFromMe = msg?.key?.fromMe ?? msg?.fromMe ?? false
                let pushName = msg?.pushName || msg?.notifyName || null
                if (isFromMe) pushName = null

                console.log(`📩 Message from: ${remoteJid}, isFromMe: ${isFromMe}`)

                if (!remoteJid || String(remoteJid).endsWith('@g.us')) {
                    console.log('🚫 Skipping group message or missing remoteJid')
                    break
                }

                let text = extractMessageContent(msg)
                const m = msg?.message || {}
                const msgType = msg?.messageType || msg?.type || Object.keys(m)[0]

                console.log(`📝 Message type: ${msgType}`)

                // Get instance and user
                const { data: instanceRow } = await supabase
                    .from('whatsapp_instances')
                    .select('user_id')
                    .eq('instance_name', instanceName)
                    .single()

                if (!instanceRow?.user_id) {
                    console.log('⚠️ Instance not found in database')
                    break
                }
                const userId = instanceRow.user_id

                // Get Lead
                const rawRemoteJid = String(remoteJid).replace('@s.whatsapp.net', '')
                let phoneE164 = rawRemoteJid.replace(/\D/g, '')
                if (phoneE164.length >= 10 && phoneE164.length <= 11 && !phoneE164.startsWith('55')) {
                    phoneE164 = '55' + phoneE164
                }

                let leadId = null
                try {
                    const { data: leadData } = await supabase.rpc('upsert_lead_canonical', {
                        p_user_id: userId,
                        p_instance_name: instanceName,
                        p_phone_e164: phoneE164,
                        p_telefone: rawRemoteJid,
                        p_name: pushName,
                        p_push_name: pushName,
                        p_source: 'whatsapp'
                    }).single()
                    if (leadData) leadId = leadData.id
                } catch (err) {
                    console.error('RPC failed:', err)
                    const { data: legacyLead } = await supabase.from('leads').select('id').eq('user_id', userId).eq('telefone', rawRemoteJid).limit(1).maybeSingle()
                    if (legacyLead) leadId = legacyLead.id
                }

                // Process ALL media types including video
                const isMediaMessage = ['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage'].includes(msgType)

                let finalText = text

                if (isMediaMessage) {
                    console.log(`🔐 Requesting decrypted media from Evolution for type: ${msgType}`)

                    try {
                        const evolutionResult = await fetchBase64FromEvolution(instanceName, msg)
                        if (evolutionResult) {
                            let mimeType = evolutionResult.mimeType || 'application/octet-stream'
                            const publicUrl = await uploadMedia(supabase, evolutionResult.base64, mimeType, instanceName, 'base64')
                            if (publicUrl) {
                                finalText = `${text}\n${publicUrl}`
                            }
                        }
                    } catch (mediaErr) {
                        console.error('Media processing failed:', mediaErr)
                    }
                }

                // Save interaction
                const { error: insertError } = await supabase
                    .from('interacoes')
                    .insert({
                        user_id: userId,
                        lead_id: leadId,
                        mensagem: finalText,
                        tipo: isFromMe ? 'mensagem_vendedor' : 'mensagem_cliente',
                        instance_name: instanceName,
                        remote_jid: remoteJid,
                        phone_e164: phoneE164,
                        wa_message_id: msg?.key?.id || null
                    })

                if (insertError) console.error('❌ DB Insert Error:', insertError)
                else console.log('💾 Interaction saved to database')

                break
            }
            default:
                break
        }

        return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (err: any) {
        console.error('💥 Unexpected error:', err)
        return new Response(JSON.stringify({ error: String(err?.message || err) }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
