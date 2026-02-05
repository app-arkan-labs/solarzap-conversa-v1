// This function is reserved for future external API access.
// Currently the frontend uses Supabase Client + RLS.

Deno.serve(async (req) => {
    return new Response(
        JSON.stringify({ message: "Use Supabase Client for internal operations." }),
        { headers: { "Content-Type": "application/json" } },
    )
})
