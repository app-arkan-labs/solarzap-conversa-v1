import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-arkan-webhook-secret',
}

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

function parseBooleanFlag(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') {
        if (value === 1) return true
        if (value === 0) return false
        return null
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', '1', 'yes', 'y', 'sim'].includes(normalized)) return true
        if (['false', '0', 'no', 'n', 'nao', 'não'].includes(normalized)) return false
    }
    return null
}

function asMessageObject(candidate: any): any | null {
    if (Array.isArray(candidate)) {
        for (const row of candidate) {
            if (row && typeof row === 'object') return row
        }
        return null
    }
    return candidate && typeof candidate === 'object' ? candidate : null
}

function resolveMessagePayload(body: any, data: any): any | null {
    const candidates = [
        data?.data,
        data?.messages,
        data?.message,
        data,
        body?.data?.data,
        body?.data?.messages,
        body?.data?.message,
        body?.message,
        body?.messages,
        body
    ]

    for (const candidate of candidates) {
        const msg = asMessageObject(candidate)
        if (!msg) continue
        if (
            msg?.key ||
            msg?.message ||
            msg?.messageType ||
            msg?.type ||
            msg?.remoteJid ||
            msg?.remote_jid ||
            msg?.fromMe !== undefined ||
            msg?.from_me !== undefined
        ) {
            return msg
        }
    }
    return null
}

function resolveRemoteJid(msg: any, data: any, body: any): string | null {
    const raw =
        msg?.key?.remoteJid ??
        msg?.remoteJid ??
        msg?.key?.remote_jid ??
        msg?.remote_jid ??
        data?.key?.remoteJid ??
        data?.remoteJid ??
        body?.data?.key?.remoteJid ??
        body?.key?.remoteJid ??
        body?.remoteJid ??
        null
    if (raw) return String(raw)

    const numberRaw =
        msg?.number ??
        data?.number ??
        body?.data?.number ??
        body?.number ??
        null
    const digits = onlyDigits(numberRaw ? String(numberRaw) : '')
    if (!digits) return null

    return `${digits}@s.whatsapp.net`
}

function resolveMessageId(msg: any, data: any, body: any): string | null {
    const raw =
        msg?.key?.id ??
        msg?.id ??
        data?.key?.id ??
        data?.id ??
        body?.data?.key?.id ??
        body?.key?.id ??
        body?.id ??
        null
    return raw ? String(raw) : null
}

function resolveFromMe(msg: any, data: any, body: any): boolean {
    const candidates = [
        msg?.key?.fromMe,
        msg?.fromMe,
        msg?.key?.from_me,
        msg?.from_me,
        data?.key?.fromMe,
        data?.fromMe,
        data?.key?.from_me,
        data?.from_me,
        body?.data?.key?.fromMe,
        body?.data?.fromMe,
        body?.key?.fromMe,
        body?.fromMe,
        body?.sendByMe,
        body?.data?.sendByMe
    ]

    for (const candidate of candidates) {
        const parsed = parseBooleanFlag(candidate)
        if (parsed !== null) return parsed
    }

    return false
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

function normalizeProtocolVersion(raw: any): 'legacy' | 'pipeline_pdf_v1' {
    const value = String(raw || '').trim().toLowerCase()
    return value === 'pipeline_pdf_v1' ? 'pipeline_pdf_v1' : 'legacy'
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
        // Runtime-proof hardening: explicit org namespace prefix to avoid any legacy path fallback.
        const filePath = `org/${orgId}/instances/${safeInstanceName}/${Date.now()}_${fileName}`

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

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(req.url)

    try {
        const expectedSecret = Deno.env.get('ARKAN_WEBHOOK_SECRET');
        if (expectedSecret) {
            const receivedHeader = req.headers.get('x-arkan-webhook-secret');
            const receivedQuery = url.searchParams.get('secret');

            if (receivedHeader !== expectedSecret && receivedQuery !== expectedSecret) {
                console.warn('⚠️ Invalid webhook secret');
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        }

        const body = await req.json()
        const eventRaw = body?.event ?? body?.data?.event ?? null
        const event = normalizeEvent(eventRaw) ?? inferEventFromPath(url.pathname)
        const instanceName = body?.instance || body?.instanceName || body?.data?.instance || body?.data?.instanceName || null

        if (!instanceName || !event) {
            return new Response(JSON.stringify({ received: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const { data: instanceRow } = await supabase
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

        let protocolVersion: 'legacy' | 'pipeline_pdf_v1' = 'legacy'
        let supportAiEnabled = false
        let supportAiAutoDisableOnSellerMessage = true

        try {
            const { data: aiSettings } = await supabase
                .from('ai_settings')
                .select('protocol_version, support_ai_enabled, support_ai_auto_disable_on_seller_message')
                .eq('org_id', orgId)
                .order('id', { ascending: true })
                .limit(1)
                .maybeSingle()

            if (aiSettings) {
                protocolVersion = normalizeProtocolVersion((aiSettings as any).protocol_version)
                supportAiEnabled = (aiSettings as any).support_ai_enabled === true
                supportAiAutoDisableOnSellerMessage =
                    (aiSettings as any).support_ai_auto_disable_on_seller_message !== false
            }
        } catch (settingsErr) {
            console.warn('âš ï¸ Failed to load ai_settings for webhook takeover context:', settingsErr)
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
                const msg = resolveMessagePayload(body, data)
                if (!msg) {
                    console.warn('⚠️ MESSAGES_UPSERT without message payload shape, skipping')
                    break
                }

                const remoteJid = resolveRemoteJid(msg, data, body)
                const isFromMe = resolveFromMe(msg, data, body)
                const waMessageId = resolveMessageId(msg, data, body)
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

                    const participantCandidate = msg?.participant || data?.participant || msg?.key?.participant || (String(remoteJid).endsWith('@g.us') ? null : remoteJid)
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
                    console.error('❌ upsert_lead_canonical failed in whatsapp-webhook', {
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
                    wa_message_id: waMessageId,
                    attachment_url: dbPublicUrl,
                    attachment_type: dbAttachmentType,
                    attachment_ready: true,
                    wa_from_me: isFromMe
                }).select('id').single()

                if (isFromMe && leadId) {
                    const takeoverEnabled = supportAiAutoDisableOnSellerMessage === true
                    let leadStage: string | null = null
                    let leadWasAlreadyPaused = false
                    let sellerMessageAutoDisabledAI = false
                    let takeoverError: string | null = null
                    let takeoverSuppressedReason: string | null = null

                    try {
                        const { data: leadBefore, error: leadBeforeErr } = await supabase
                            .from('leads')
                            .select('id, status_pipeline, ai_enabled')
                            .eq('id', Number(leadId))
                            .maybeSingle()

                        if (leadBeforeErr) {
                            takeoverError = leadBeforeErr.message
                        } else {
                            leadStage = (leadBefore as any)?.status_pipeline || null
                            leadWasAlreadyPaused = (leadBefore as any)?.ai_enabled === false

                            const shouldEvaluatePause = takeoverEnabled && !leadWasAlreadyPaused
                            let likelyAiEcho = false

                            if (shouldEvaluatePause) {
                                try {
                                    const nowMinus45sIso = new Date(Date.now() - 45_000).toISOString()
                                    const { data: duplicateOutbound } = await supabase
                                        .from('interacoes')
                                        .select('id, created_at')
                                        .eq('lead_id', Number(leadId))
                                        .eq('instance_name', instanceName)
                                        .eq('wa_from_me', true)
                                        .in('tipo', ['mensagem_vendedor', 'audio_vendedor', 'video_vendedor', 'anexo_vendedor'])
                                        .eq('mensagem', text)
                                        .gte('created_at', nowMinus45sIso)
                                        .neq('id', Number(inserted?.id || 0))
                                        .order('id', { ascending: false })
                                        .limit(1)
                                        .maybeSingle()

                                    likelyAiEcho = Boolean(duplicateOutbound)
                                } catch (dupErr: any) {
                                    console.warn('Failed to check duplicate outbound before takeover pause:', dupErr?.message || dupErr)
                                }

                                if (likelyAiEcho) {
                                    takeoverSuppressedReason = 'likely_ai_echo'
                                } else {
                                    const { error: pauseErr } = await supabase
                                        .from('leads')
                                        .update({
                                            ai_enabled: false,
                                            ai_paused_reason: 'human_takeover',
                                            ai_paused_at: new Date().toISOString()
                                        })
                                        .eq('id', Number(leadId))

                                    if (pauseErr) {
                                        takeoverError = pauseErr.message
                                    } else {
                                        sellerMessageAutoDisabledAI = true
                                    }
                                }
                            } else if (!takeoverEnabled) {
                                takeoverSuppressedReason = 'auto_disable_off'
                            } else if (leadWasAlreadyPaused) {
                                takeoverSuppressedReason = 'already_paused'
                            }
                        }
                    } catch (pauseErr: any) {
                        takeoverError = pauseErr?.message || String(pauseErr)
                    }

                    try {
                        await supabase.from('ai_action_logs').insert({
                            org_id: orgId,
                            lead_id: Number(leadId),
                            action_type: 'seller_message_takeover',
                            details: JSON.stringify({
                                protocol_version: protocolVersion,
                                agent_mode: 'none',
                                stage_key: leadStage,
                                support_ai_enabled: supportAiEnabled,
                                support_ai_stage_allowed: false,
                                support_ai_decision: 'no_reply',
                                support_ai_handoff_reason: null,
                                did_send_outbound: false,
                                seller_message_auto_disabled_ai: sellerMessageAutoDisabledAI,
                                seller_message_auto_disabled_support_ai: sellerMessageAutoDisabledAI,
                                takeover_source: 'webhook_fromMe',
                                blocked_prompt_override: false,
                                blocked_prompt_override_reason: null,
                                support_ai_auto_disable_on_seller_message: supportAiAutoDisableOnSellerMessage,
                                lead_was_already_paused: leadWasAlreadyPaused,
                                takeover_enabled: takeoverEnabled,
                                takeover_suppressed_reason: takeoverSuppressedReason,
                                instance_name: instanceName,
                                interaction_id: inserted?.id || null,
                                wa_message_id: waMessageId,
                                error: takeoverError
                            }),
                            success: !takeoverError
                        })
                    } catch (takeoverLogErr) {
                        console.warn('Failed to insert seller_message_takeover log:', takeoverLogErr)
                    }
                }

                // AI Trigger
                if (!isFromMe && leadId && inserted?.id) {
                    supabase.functions
                        .invoke('ai-pipeline-agent', {
                            body: { leadId, triggerType: 'incoming_message', interactionId: inserted.id, instanceName }
                        })
                        .then(async ({ error: invokeError }) => {
                            if (!invokeError) return
                            console.error('❌ Failed to invoke ai-pipeline-agent from whatsapp-webhook', {
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
                                        source: 'whatsapp-webhook',
                                        triggerType: 'incoming_message',
                                        interactionId: inserted.id,
                                        instanceName,
                                        error: invokeError.message
                                    }),
                                    success: false
                                })
                            } catch (logErr) {
                                console.warn('Failed to log agent_invoke_failed (whatsapp-webhook):', logErr)
                            }
                        })
                        .catch(async (invokeErr) => {
                            console.error('❌ Exception invoking ai-pipeline-agent from whatsapp-webhook', {
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
                                        source: 'whatsapp-webhook',
                                        triggerType: 'incoming_message',
                                        interactionId: inserted.id,
                                        instanceName,
                                        error: invokeErr?.message || String(invokeErr)
                                    }),
                                    success: false
                                })
                            } catch (logErr) {
                                console.warn('Failed to log agent_invoke_failed exception (whatsapp-webhook):', logErr)
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

