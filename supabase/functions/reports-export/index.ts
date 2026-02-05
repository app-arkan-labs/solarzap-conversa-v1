import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
        );

        const {
            data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) {
            throw new Error("Unauthorized");
        }

        const { type, start, end } = await req.json(); // type: leads | deals | appointments

        let csvContent = "";
        let fileName = "";

        if (type === "leads") {
            fileName = `leads_export_${new Date().toISOString()}.csv`;
            const { data } = await supabaseClient
                .from("leads")
                .select("id, nome, telefone, status_pipeline, source, created_at, tags")
                .gte("created_at", start)
                .lte("created_at", end)
                .eq("user_id", user.id);

            csvContent = "ID,Nome,Telefone,Etapa,Origem,Data Criação,Tags\n";
            data?.forEach((row: any) => {
                csvContent += `"${row.id}","${row.nome}","${row.telefone}","${row.status_pipeline}","${row.source}","${row.created_at}","${row.tags}"\n`;
            });
        } else if (type === "deals") {
            fileName = `deals_export_${new Date().toISOString()}.csv`;
            const { data } = await supabaseClient
                .from("deals")
                .select("id, title, amount, status, closed_at, created_at, leads(nome)")
                .gte("created_at", start) // or closed_at? Using created_at for general export, or filter by logic.
                .lte("created_at", end)
                .eq("user_id", user.id);

            csvContent = "ID,Título,Lead,Valor,Status,Data Fechamento,Data Criação\n";
            data?.forEach((row: any) => {
                csvContent += `"${row.id}","${row.title || ''}","${row.leads?.nome || ''}","${row.amount}","${row.status}","${row.closed_at || ''}","${row.created_at}"\n`;
            });
        } else if (type === "appointments") {
            fileName = `agenda_export_${new Date().toISOString()}.csv`;
            const { data } = await supabaseClient
                .from("appointments")
                .select("id, title, type, status, start_at, end_at, leads(nome)")
                .gte("start_at", start)
                .lte("start_at", end)
                .eq("user_id", user.id);

            csvContent = "ID,Título,Lead,Tipo,Status,Início,Fim\n";
            data?.forEach((row: any) => {
                csvContent += `"${row.id}","${row.title}","${row.leads?.nome || ''}","${row.type}","${row.status}","${row.start_at}","${row.end_at}"\n`;
            });
        } else {
            throw new Error("Invalid export type");
        }

        // Upload to Storage
        // Ensure bucket exists or use 'exports' bucket
        // For simplicity, we can return the CSV string directly if small, but requirement said "Signed URL".
        // Let's assume an 'exports' bucket exists. If not, we might fail. 
        // Alternatively, we can return the text directly (it's simpler and faster for MVP).
        // Spec: "Gerar CSV, Salvar em Storage, Retornar Signed URL".

        // Check if bucket exists, create if not (Admin only usually, user might fail).
        // Failing fallback: return content directly.

        const { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from("exports")
            .upload(`${user.id}/${fileName}`, csvContent, {
                contentType: "text/csv",
                upsert: true
            });

        if (uploadError) {
            // Fallback: return raw CSV
            console.warn("Storage upload failed, returning raw text", uploadError);
            return new Response(csvContent, {
                headers: { ...corsHeaders, "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${fileName}"` },
            });
        }

        const { data: signedUrl } = await supabaseClient
            .storage
            .from("exports")
            .createSignedUrl(`${user.id}/${fileName}`, 3600);

        return new Response(
            JSON.stringify({ url: signedUrl?.signedUrl }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );

    } catch (error) {
        console.error("Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
