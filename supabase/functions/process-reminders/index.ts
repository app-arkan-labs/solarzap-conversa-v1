import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { format } from 'https://esm.sh/date-fns@2'
import { ptBR } from 'https://esm.sh/date-fns@2/locale'
import { checkLimit, recordUsage } from '../_shared/billing.ts'

// --- Evolution API Helper (Duplicated for self-containment) ---
const getEvolutionConfig = () => {
    const baseUrl = Deno.env.get('EVOLUTION_API_URL')
    const apiKey = Deno.env.get('EVOLUTION_API_KEY')
    if (!baseUrl || !apiKey) throw new Error('Evolution API config missing')
    return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey }
}

async function sendText(instanceName: string, phone: string, text: string) {
    const { baseUrl, apiKey } = getEvolutionConfig()
    const url = `${baseUrl}/message/sendText/${instanceName}`
    const body = {
        number: phone.replace(/\D/g, ''),
        text: text
    }

    console.log(`Sending to ${instanceName}:`, body)

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify(body)
    })

    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Evolution API error: ${res.status} - ${err}`)
    }
    return res.json()
}

// --- Main Job Logic ---

Deno.serve(async (req) => {
    // Basic Auth or Secret check (Optional for Cron, but recommended)
    // For now, we rely on Supabase Cron executing this internally.

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Claim pending reminders
        const limit = 50
        const { data: reminders, error: claimError } = await supabase
            .rpc('claim_due_reminders', { p_limit: limit })

        if (claimError) throw claimError
        if (!reminders || reminders.length === 0) {
            return new Response(JSON.stringify({ message: 'No reminders to process' }), {
                headers: { 'Content-Type': 'application/json' }
            })
        }

        console.log(`Processing ${reminders.length} reminders...`)
        const results = []

        for (const r of reminders) {
            let status = 'failed'
            let response = null
            let errorMsg = null
            let orgId: string | null = null

            try {
                const { data: membership } = await supabase
                    .from('organization_members')
                    .select('org_id')
                    .eq('user_id', r.user_id)
                    .order('created_at', { ascending: true })
                    .limit(1)
                    .maybeSingle()

                orgId = membership?.org_id || null
                if (orgId) {
                    const limit = await checkLimit(supabase, orgId, 'max_automations_month', 1)
                    if (!limit.allowed || limit.access_state === 'blocked' || limit.access_state === 'read_only') {
                        throw new Error('billing_limit_reached_for_reminder')
                    }

                    // ── Suspension guard ──
                    const { data: orgGuard } = await supabase
                        .from('organizations')
                        .select('status')
                        .eq('id', orgId)
                        .single()

                    if (orgGuard?.status === 'suspended') {
                        await supabase
                            .from('appointment_reminders')
                            .update({ status: 'skipped_suspended', last_error: 'org_suspended' })
                            .eq('id', r.reminder_id)
                        await supabase
                            .from('_admin_suspension_log')
                            .insert({
                                org_id: orgId,
                                blocked_action: 'reminder_send',
                                details: { reminder_id: r.reminder_id, appointment_id: r.appointment_id },
                            })
                            .catch(() => {})
                        results.push({ id: r.reminder_id, status: 'skipped_suspended' })
                        continue
                    }
                    // ── End suspension guard ──
                }

                // 2. Get active instance for user
                const { data: instances, error: instError } = await supabase
                    .from('whatsapp_instances')
                    .select('instance_name')
                    .eq('user_id', r.user_id)
                    .eq('status', 'connected')
                    .limit(1)

                if (instError) throw instError
                const instance = instances?.[0]

                if (!instance) {
                    throw new Error('No connected WhatsApp instance found for user')
                }

                // 3. Format Message
                const dateStr = format(new Date(r.start_at), "dd 'de' MMMM", { locale: ptBR })
                const timeStr = format(new Date(r.start_at), "HH:mm", { locale: ptBR })

                // Friendly type map
                const typeMap: Record<string, string> = {
                    'call': 'chamada', 'chamada': 'chamada',
                    'visit': 'visita', 'visita': 'visita',
                    'installation': 'instalação', 'instalacao': 'instalação',
                    'meeting': 'reunião', 'reuniao': 'reunião'
                }
                const friendlyType = typeMap[r.appointment_type] || 'reunião'

                const message = `Olá ${r.lead_name}, lembrete: sua ${friendlyType} está marcada para ${dateStr} às ${timeStr}. Confirma?`

                // 4. Send
                if (r.channel === 'whatsapp_lead') {
                    response = await sendText(instance.instance_name, r.lead_phone, message)
                } else {
                    // TODO: Implement other channels like notifying the owner
                    throw new Error(`Channel ${r.channel} not implemented`)
                }

                status = 'sent'

                if (orgId) {
                    try {
                        await recordUsage(supabase, {
                            orgId,
                            userId: r.user_id,
                            eventType: 'automation_execution',
                            quantity: 1,
                            source: 'process-reminders',
                            metadata: {
                                reminder_id: r.reminder_id,
                                appointment_id: r.appointment_id,
                            },
                        })
                    } catch (usageErr) {
                        console.warn('Failed to record reminder usage', usageErr)
                    }
                }

            } catch (err: any) {
                console.error(`Failed reminder ${r.reminder_id}:`, err)
                errorMsg = err.message
                response = { error: err.message }
            }

            // 5. Update Status and Log
            await supabase.from('appointment_reminders').update({
                status: status,
                sent_at: status === 'sent' ? new Date().toISOString() : null,
                last_error: errorMsg,
                attempt_count: 1 // Increment if needed logic
            }).eq('id', r.reminder_id)

            await supabase.from('appointment_notification_logs').insert({
                user_id: r.user_id,
                appointment_id: r.appointment_id,
                reminder_id: r.reminder_id,
                channel: r.channel,
                to_phone: r.lead_phone,
                status: status,
                provider_response: response,
                payload: { message_text: 'Generated dynamically' }
            })

            results.push({ id: r.reminder_id, status })
        }

        return new Response(JSON.stringify({ processed: results }), {
            headers: { 'Content-Type': 'application/json' }
        })

    } catch (e: any) {
        console.error('process-reminders error:', e)
        return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
    }
})
