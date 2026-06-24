import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

serve(async (req) => {
    const evoUrl = Deno.env.get('EVOLUTION_API_URL');
    const evoKey = Deno.env.get('EVOLUTION_API_KEY');
    
    try {
        const sendResp = await fetch(`${evoUrl}/instance/connectionState/solarzap-francocunhaenergiasolar-256499`, {
            method: 'GET',
            headers: { 'apikey': evoKey }
        });
        
        const txt = await sendResp.text();
        return new Response(JSON.stringify({ status: sendResp.status, body: txt }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});
