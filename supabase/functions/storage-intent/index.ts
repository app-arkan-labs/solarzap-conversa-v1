
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. Auth Check
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }

        // Create client to verify user
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader } } }
        )

        const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
        if (userError || !user) {
            throw new Error('Unauthorized')
        }

        // 3. Parse Metadata
        const { fileName, sizeBytes, mimeType, leadId, kind } = await req.json()
        if (!fileName || !sizeBytes) {
            throw new Error('Missing fileName or sizeBytes')
        }

        // 4. Admin Client for Storage Operations
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: membership } = await supabaseAdmin
            .from('organization_members')
            .select('org_id, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
            .order('org_id', { ascending: true })
            .limit(1)
            .maybeSingle()

        const orgId = membership?.org_id || (user.user_metadata as any)?.org_id
        if (!orgId) {
            throw new Error('User is not linked to an organization')
        }

        // 5. Policy Logic (90MB Threshold)
        const VIDEO_LIMIT = 90 * 1024 * 1024; // 90MB
        let sendMode = 'document';
        const bucketName = 'chat-delivery'; // Public bucket for clean URLs

        if (kind === 'video') {
            if (sizeBytes <= VIDEO_LIMIT) {
                sendMode = 'video';
            } else {
                // Automatic fallthrough to document for large videos
                sendMode = 'document';
            }
        } else if (kind === 'image') {
            sendMode = 'image';
        } else {
            sendMode = 'document';
        }

        // 6. Ensure Public Bucket Exists (Idempotent)
        const { data: bucket, error: bucketError } = await supabaseAdmin.storage.getBucket(bucketName)

        if (bucketError && bucketError.message.includes('not found')) {
            console.log(`Bucket ${bucketName} not found. Creating...`)
            const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
                public: true,
                fileSizeLimit: '2GB', // High limit
                allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/*', 'text/*']
            })
            if (createError) {
                console.error('Failed to create bucket:', createError)
                throw new Error('Failed to bootstrap storage')
            }
        } else if (bucket && !bucket.public) {
            // Ensure it is public if it exists but is private (update)
            await supabaseAdmin.storage.updateBucket(bucketName, { public: true })
        }

        // 7. Generate Safe Path
        // Pattern: userId/leadId/timestamp_random_filename.ext
        // Ensure extension for video
        let finalName = fileName;
        if (kind === 'video' && !fileName.toLowerCase().endsWith('.mp4') && !fileName.toLowerCase().endsWith('.mov')) {
            finalName += '.mp4';
        }
        // Sanitize filename
        const sanitizedName = finalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const safeLeadId = String(leadId || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
        const path = `${orgId}/chat/${safeLeadId}/${Date.now()}_${sanitizedName}`;

        // 8. Generate Signed Upload URL
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from(bucketName)
            .createSignedUploadUrl(path)

        if (uploadError) throw uploadError;

        // 9. Get Public URL (Clean)
        const { data: publicData } = supabaseAdmin.storage
            .from(bucketName)
            .getPublicUrl(path);

        return new Response(JSON.stringify({
            sendMode,
            bucket: bucketName,
            path: path,
            uploadUrl: uploadData.signedUrl, // Use this to PUT the file
            token: uploadData.token,
            publicUrl: publicData.publicUrl
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error) {
        console.error('Storage Intent Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
