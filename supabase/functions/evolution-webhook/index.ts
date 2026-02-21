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

            .from('whatsapp_instances')
            .select('org_id, user_id, phone_number')
            .eq('instance_name', instanceName)
            .single()

        if (!instanceRow?.user_id) {
            return new Response(JSON.stringify({ received: true, error: 'Instance not found' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const userId = instanceRow.user_id
        const orgId = instanceRow.org_id

        if (!orgId) {
            console.warn('⚠️ Instance without org_id, aborting to avoid orphan writes:', instanceName)
            return new Response(JSON.stringify({ received: true, error: 'Instance missing org_id' }), {
                status: 422,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // Audit Webhook (M7 hardening)
        await supabase.from('whatsapp_webhook_events').insert({
            org_id: orgId,
            instance_name: instanceName,
            event,
            path: url.pathname,
            headers: Object.fromEntries(req.headers.entries()),
            payload: body
        })

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

                // UNWRAP ViewOnce
                let m = msg?.message || {}
                let msgType = msg?.messageType || msg?.type || Object.keys(m)[0]

                if (msgType === 'viewOnceMessage' || msgType === 'viewOnceMessageV2') {
                    const inner = m[msgType]?.message
                    if (inner) {
                        m = inner
                        msg.message = inner
                        msgType = Object.keys(inner)[0]
                    }
                }

                // Reaction Logic
                if (msgType === 'reactionMessage') {
                    const reactionInfo = msg?.message?.reactionMessage
                    const targetMsgId = reactionInfo?.key?.id
                    if (!targetMsgId) break

                    const { data: originalMsg } = await supabase
                        .from('interacoes')
                        .select('id, reactions')
                        .eq('wa_message_id', targetMsgId)
                        .eq('instance_name', instanceName)
                        .maybeSingle()

                    if (!originalMsg) break

                    const participantCandidate = data?.participant || msg?.key?.participant || (String(remoteJid).endsWith('@g.us') ? null : remoteJid)
                    const ownerDigits = onlyDigits(instanceRow?.phone_number)
                    const participantDigits = onlyDigits(participantCandidate)
                    const isReactorMe = !!(ownerDigits && participantDigits && ownerDigits === participantDigits)
                    const reactorId = isReactorMe ? 'ME' : (participantCandidate || 'UNKNOWN')

                    const existingReactions = Array.isArray(originalMsg.reactions) ? originalMsg.reactions : []
                    const emoji = reactionInfo?.text ?? ''

                    const filtered = existingReactions.filter((r: any) => {
                        if (reactorId === 'ME') return r.reactorId !== 'ME' && r.fromMe !== true
                        return r.reactorId !== reactorId
                    })

                    let newReactions = filtered
                    if (emoji) {
                        newReactions.push({ emoji, reactorId, fromMe: isReactorMe, timestamp: new Date().toISOString() })
                    }

                    await supabase.from('interacoes').update({ reactions: newReactions }).eq('id', originalMsg.id)
                    break
                }

                if (!remoteJid || String(remoteJid).endsWith('@g.us')) break

                let text = extractMessageContent(msg)

                // Get Lead
                const rawRemoteJid = String(remoteJid).replace('@s.whatsapp.net', '')
                let phoneE164 = rawRemoteJid.replace(/\D/g, '')
                if (phoneE164.length >= 10 && phoneE164.length <= 11 && !phoneE164.startsWith('55')) {
                    phoneE164 = '55' + phoneE164
                }

                let leadId = null
                const { data: leadData, error: upsertLeadError } = await supabase.rpc('upsert_lead_canonical', {
                    p_user_id: userId,
                    p_instance_name: instanceName,
                    p_phone_e164: phoneE164,
                    p_telefone: rawRemoteJid,
                    p_name: pushName,
                    p_push_name: pushName,
                    p_source: 'whatsapp'
                }).single()
                if (upsertLeadError) {
                    console.error('❌ upsert_lead_canonical failed in evolution-webhook', {
                        userId,
                        instanceName,
                        phoneE164,
                        rawRemoteJid,
                        error: upsertLeadError.message
                    })
                } else if (leadData) {
                    leadId = leadData.id
                }

                // Process Media
                const isMediaMessage = ['audioMessage', 'imageMessage', 'videoMessage', 'documentMessage', 'stickerMessage'].includes(msgType)
                let dbPublicUrl = null
                let dbAttachmentType = null
                if (msgType === 'imageMessage') dbAttachmentType = 'image'
                else if (msgType === 'videoMessage') dbAttachmentType = 'video'
                else if (msgType === 'audioMessage') dbAttachmentType = 'audio'
                else if (msgType === 'documentMessage') dbAttachmentType = 'document'

                if (isMediaMessage) {
                    const evolutionResult = await fetchBase64FromEvolution(instanceName, msg)
                    if (evolutionResult) {
                        let mimeType = evolutionResult.mimeType || 'application/octet-stream'
                        if (msgType === 'videoMessage' && mimeType === 'application/octet-stream') mimeType = 'video/mp4'

                        const publicUrl = await uploadMedia(supabase, evolutionResult.base64, mimeType, orgId, instanceName, 'base64')
                        if (publicUrl) {
                            text = `${text}\n${publicUrl}`
                            dbPublicUrl = publicUrl
                        }
                    }
                }

                // Interaction Insert
                const { data: inserted } = await supabase.from('interacoes').insert({
                    org_id: orgId,
                    user_id: userId,
                    lead_id: leadId,
                    mensagem: text,
                    tipo: isFromMe ? 'mensagem_vendedor' : 'mensagem_cliente',
                    instance_name: instanceName,
                    remote_jid: remoteJid,
                    phone_e164: phoneE164,
                    wa_message_id: msg?.key?.id,
                    attachment_url: dbPublicUrl,
                    attachment_type: dbAttachmentType,
                    attachment_ready: true,
                    wa_from_me: isFromMe
                }).select('id').single()

                // AI Trigger
                if (!isFromMe && leadId && inserted?.id) {
                    supabase.functions
                        .invoke('ai-pipeline-agent', {
                            body: { leadId, triggerType: 'incoming_message', interactionId: inserted.id, instanceName }
                        })
                        .then(async ({ error: invokeError }) => {
                            if (!invokeError) return
                            console.error('❌ Failed to invoke ai-pipeline-agent from evolution-webhook', {
                                leadId,
                                interactionId: inserted.id,
                                instanceName,
                                error: invokeError.message
                            })
                            try {
                                await supabase.from('ai_action_logs').insert({
                                    org_id: orgId,
                                    lead_id: Number(leadId),
                                    action_type: 'agent_invoke_failed',
                                    details: JSON.stringify({
                                        source: 'evolution-webhook',
                                        triggerType: 'incoming_message',
                                        interactionId: inserted.id,
                                        instanceName,
                                        error: invokeError.message
                                    }),
                                    success: false
                                })
                            } catch (logErr) {
                                console.warn('Failed to log agent_invoke_failed (evolution-webhook):', logErr)
                            }
                        })
                        .catch(async (invokeErr) => {
                            console.error('❌ Exception invoking ai-pipeline-agent from evolution-webhook', {
                                leadId,
                                interactionId: inserted.id,
                                instanceName,
                                error: invokeErr?.message || String(invokeErr)
                            })
                            try {
                                await supabase.from('ai_action_logs').insert({
                                    org_id: orgId,
                                    lead_id: Number(leadId),
                                    action_type: 'agent_invoke_failed',
                                    details: JSON.stringify({
                                        source: 'evolution-webhook',
                                        triggerType: 'incoming_message',
                                        interactionId: inserted.id,
                                        instanceName,
                                        error: invokeErr?.message || String(invokeErr)
                                    }),
                                    success: false
                                })
                            } catch (logErr) {
                                console.warn('Failed to log agent_invoke_failed exception (evolution-webhook):', logErr)
                            }
                        })
                }
                break
            }
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
