
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveRequestCors } from '../_shared/cors.ts'
import { checkLimit } from '../_shared/billing.ts'

// 1. Configuration
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')

const getEvolutionConfig = () => {
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
        console.error("Missing Evolution API Config")
        return null
    }
    // Remove trailing slash if present
    const baseUrl = EVOLUTION_API_URL.endsWith('/') ? EVOLUTION_API_URL.slice(0, -1) : EVOLUTION_API_URL
    return { baseUrl, apiKey: EVOLUTION_API_KEY }
}

Deno.serve(async (req) => {
    const cors = resolveRequestCors(req)
    const corsHeaders = cors.corsHeaders

    // CORS Preflight
    if (req.method === 'OPTIONS') {
        if (cors.missingAllowedOriginConfig) {
            return new Response(JSON.stringify({ error: 'missing_allowed_origin' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }
        if (!cors.originAllowed) {
            return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }
        return new Response('ok', { headers: corsHeaders })
    }

    if (cors.missingAllowedOriginConfig) {
        return new Response(JSON.stringify({ error: 'missing_allowed_origin' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    if (!cors.originAllowed) {
        return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }

    try {
        const config = getEvolutionConfig()
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                },
            }
        )

        // Check Authentication
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }

        // Get User from Auth
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

        if (userError || !user) {
            throw new Error('Invalid User Token')
        }

        const payload = await req.json()
        const requestedOrgId = typeof payload.orgId === 'string' ? payload.orgId.trim() : ''

        let memberQuery = supabaseClient
            .from('organization_members')
            .select('org_id, role, created_at')
            .eq('user_id', user.id)

        if (requestedOrgId) {
            memberQuery = memberQuery.eq('org_id', requestedOrgId)
        }

        const { data: member, error: memberError } = await memberQuery
            .order('created_at', { ascending: true })
            .order('org_id', { ascending: true })
            .limit(1)
            .maybeSingle()

        if (memberError || !member?.org_id) {
            if (requestedOrgId) {
                throw new Error('Organization membership not found for requested organization')
            }
            throw new Error('Organization membership not found for authenticated user')
        }
        const orgId = member.org_id
        const role = String(member.role || 'user').toLowerCase()
        const isOrgManager = role === 'owner' || role === 'admin'

        const { action, instanceId, newName, displayName, instanceName, key, reaction } = payload

        // Base Response if config is missing (for 'list' or others)
        if (!config) {
            if (action === 'list') {
                return new Response(
                    JSON.stringify({ configured: false, instances: [] }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            throw new Error('Evolution API not configured on server')
        }

        const { baseUrl, apiKey } = config
        const headers = {
            'Content-Type': 'application/json',
            'apikey': apiKey
        }

        /* ==========================
           ACTION: LIST
           ========================== */
        if (action === 'list') {
            console.log(`fetching instances for user: ${user.id}, org: ${orgId}, role: ${role}`)
            // Fetch from Supabase DB which is the "Source of Truth" for our app
            // (Evolution API might have instances not belonging to this user or app, but we only show what's in DB)
            // Wait, for 'list', usually we rely on DB state updated by webhooks.

            let listQuery = supabaseClient
                .from('whatsapp_instances')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false })

            if (!isOrgManager) {
                listQuery = listQuery.eq('user_id', user.id)
            }

            const { data: instances, error: dbError } = await listQuery

            if (dbError) throw dbError

            // Optional: We could sync status with Evolution here if needed, but slow.
            // Let's just return DB state.

            return new Response(
                JSON.stringify({
                    configured: true,
                    instances: instances || []
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        /* ==========================
           ACTION: CREATE
           ========================== */
        if (action === 'create') {
            const instanceLimit = await checkLimit(supabaseClient, orgId, 'max_whatsapp_instances', 1)
            if (!instanceLimit.allowed || instanceLimit.access_state === 'blocked' || instanceLimit.access_state === 'read_only') {
                return new Response(
                    JSON.stringify({
                        ok: false,
                        code: 'billing_limit_reached',
                        error: 'Limite do plano atingido para novas instancias de WhatsApp',
                        billing: instanceLimit,
                    }),
                    {
                        status: 402,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    }
                )
            }

            const instanceName = `instance_${Date.now()}_${crypto.randomUUID()}`
            console.log(`Creating instance: ${instanceName}`)

            // 1. Call Evolution Create
            const createUrl = `${baseUrl}/instance/create`
            const createRes = await fetch(createUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    instanceName: instanceName,
                    token: crypto.randomUUID(),
                    qrcode: true, // We want QR immediately
                    integration: "WHATSAPP-BAILEYS",
                    reject_call: false,
                    msgRetryCounterCacheSettings: {
                        enabled: true // Recommended for stability
                    }
                })
            })

            if (!createRes.ok) {
                const errText = await createRes.text()
                console.error(`Evolution Create Error: ${createRes.status} - ${errText}`)
                throw new Error(`Falha ao criar instância na API: ${errText}`)
            }

            const createData = await createRes.json()
            // Evolution v2 returns { instance: { instanceName: ..., status: ... }, hash: ..., qrcode: { base64: ... } } (Check schema!)
            // Or v1... assuming standard Evolution v1.6+ response structure:
            // Response: { instance: { instanceName, ... }, qrcode: { base64, ... } }

            const qrcode = createData.qrcode?.base64 || createData.base64 || null
            const realInstanceName = createData.instance?.instanceName || createData.instanceName || instanceName

            // 2. Insert into Supabase
            const { data: newInstance, error: insertError } = await supabaseClient
                .from('whatsapp_instances')
                .insert({
                    org_id: orgId,
                    user_id: user.id,
                    instance_name: realInstanceName,
                    display_name: displayName || 'WhatsApp',
                    status: 'connecting',
                    qr_code: qrcode,
                    is_active: true
                })
                .select()
                .single()

            if (insertError) throw insertError

            // 3. Set Webhook (Important!)
            // We need to tell Evolution where to send events for THIS instance.
            // Assuming there is a global webhook setting URL in `evolution-webhook` function URL.
            // Or if Evolution has global webhook config, we might skip this.
            // BUT usually we set it per instance or globally.
            // Let's try to set it if we know the webhook URL. 
            // For now, we assume global configuration in Evolution or that the user sets it.
            // (Usually automated setup sets webhook).
            // Let's log a warning if we don't do it.

            // For robustness, try to find our own public URL? Hard from Edge Function.
            // We'll rely on global config for now or manual setup.

            return new Response(
                JSON.stringify({
                    configured: true,
                    instance: newInstance,
                    qrCode: qrcode
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        /* ==========================
           ACTION: DELETE / DISCONNECT
           ========================== */
        if (action === 'delete' || action === 'disconnect') {
            if (!instanceId) throw new Error('Instance ID required')

            // Get Instance Name
            let instanceQuery = supabaseClient
                .from('whatsapp_instances')
                .select('instance_name, user_id')
                .eq('id', instanceId)
                .eq('org_id', orgId)

            if (!isOrgManager) {
                instanceQuery = instanceQuery.eq('user_id', user.id)
            }

            const { data: instance, error: fetchError } = await instanceQuery.single()

            if (fetchError || !instance) throw new Error('Instance not found')

            const name = instance.instance_name

            if (action === 'delete') {
                // Delete from Evolution
                await fetch(`${baseUrl}/instance/delete/${name}`, {
                    method: 'DELETE',
                    headers
                })

                // Delete from DB
                let deleteQuery = supabaseClient
                    .from('whatsapp_instances')
                    .delete()
                    .eq('id', instanceId)
                    .eq('org_id', orgId)

                if (!isOrgManager) {
                    deleteQuery = deleteQuery.eq('user_id', user.id)
                }
                await deleteQuery
            }
            else if (action === 'disconnect') {
                // Logout from Evolution
                await fetch(`${baseUrl}/instance/logout/${name}`, {
                    method: 'DELETE',
                    headers
                })

                // Update DB
                let disconnectQuery = supabaseClient
                    .from('whatsapp_instances')
                    .update({ status: 'disconnected', qr_code: null, phone_number: null, connected_at: null })
                    .eq('id', instanceId)
                    .eq('org_id', orgId)

                if (!isOrgManager) {
                    disconnectQuery = disconnectQuery.eq('user_id', user.id)
                }
                await disconnectQuery
            }

            return new Response(
                JSON.stringify({ success: true }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        /* ==========================
           ACTION: REFRESH QR
           ========================== */
        if (action === 'refresh_qr') {
            if (!instanceId) throw new Error('Instance ID required')

            let instanceQuery = supabaseClient
                .from('whatsapp_instances')
                .select('instance_name, user_id')
                .eq('id', instanceId)
                .eq('org_id', orgId)

            if (!isOrgManager) {
                instanceQuery = instanceQuery.eq('user_id', user.id)
            }

            const { data: instance } = await instanceQuery.single()

            if (!instance) throw new Error('Instance not found')

            // Call Evolution Connect (usually refreshes QR)
            const connectRes = await fetch(`${baseUrl}/instance/connect/${instance.instance_name}`, {
                method: 'GET',
                headers
            })

            if (!connectRes.ok) throw new Error('Failed to refresh QR')

            const connectData = await connectRes.json()
            const qr = connectData.base64 || connectData.qrcode?.base64 || null

            if (qr) {
                let refreshUpdateQuery = supabaseClient
                    .from('whatsapp_instances')
                    .update({ qr_code: qr, status: 'connecting' })
                    .eq('id', instanceId)
                    .eq('org_id', orgId)

                if (!isOrgManager) {
                    refreshUpdateQuery = refreshUpdateQuery.eq('user_id', user.id)
                }
                await refreshUpdateQuery
            }

            return new Response(
                JSON.stringify({ qrCode: qr }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        /* ==========================
          ACTION: RENAME
          ========================== */
        if (action === 'rename') {
            if (!instanceId || !newName) throw new Error('Missing parameters')

            let renameQuery = supabaseClient
                .from('whatsapp_instances')
                .update({ display_name: newName })
                .eq('id', instanceId)
                .eq('org_id', orgId)

            if (!isOrgManager) {
                renameQuery = renameQuery.eq('user_id', user.id)
            }
            await renameQuery

            return new Response(
                JSON.stringify({ success: true }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        /* ==========================
           ACTION: SEND REACTION
           ========================== */

        if (action === 'sendReaction') {
            if (!instanceName || !key || reaction === undefined) {
                return new Response(
                    JSON.stringify({ error: 'Missing parameters: instanceName, key, reaction' }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            let reactionScopeQuery = supabaseClient
                .from('whatsapp_instances')
                .select('id')
                .eq('org_id', orgId)
                .eq('instance_name', instanceName)

            if (!isOrgManager) {
                reactionScopeQuery = reactionScopeQuery.eq('user_id', user.id)
            }

            const { data: scopedInstance, error: scopedInstanceError } = await reactionScopeQuery.maybeSingle()
            if (scopedInstanceError || !scopedInstance) {
                return new Response(
                    JSON.stringify({ error: 'Instance not found in organization scope' }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            // FIX: Ensure remoteJid format
            let remoteJid = key.remoteJid;
            if (remoteJid && !remoteJid.includes('@')) {
                // Determine if it looks like a group or user (simple heuristic could be length, 
                // but usually @s.whatsapp.net is safe correctly unless it's a group ID which usually has -)
                // For safety, assume user if no @.
                remoteJid = `${remoteJid}@s.whatsapp.net`;
                console.log(`[Fix] Appended suffix to remoteJid: ${remoteJid}`);
            }
            const fixedKey = { ...key, remoteJid };

            console.log(`Sending reaction ${reaction} to message ${fixedKey.id} via ${instanceName}`)

            const reactionRes = await fetch(`${baseUrl}/message/sendReaction/${instanceName}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    key: fixedKey,
                    reaction
                })
            })

            let responseData;
            const resText = await reactionRes.text();
            try {
                responseData = JSON.parse(resText);
            } catch (e) {
                responseData = { text: resText };
            }

            if (!reactionRes.ok) {
                console.error(`Evolution sendReaction error [${reactionRes.status}]:`, resText);
                return new Response(
                    JSON.stringify({
                        error: 'Evolution API Error',
                        status: reactionRes.status,
                        evolutionError: responseData,
                        sentPayload: { key: fixedKey, reaction }
                    }),
                    { status: reactionRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            return new Response(
                JSON.stringify({ success: true, data: responseData }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        throw new Error(`Unknown action: ${action}`)

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error('Error in whatsapp-connect:', error)
        return new Response(
            JSON.stringify({ error: errorMessage }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})
