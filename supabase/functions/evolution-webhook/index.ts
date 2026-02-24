// DEPRECATED: this function has been replaced by `whatsapp-webhook`.
// Kept purely as a thin proxy so old webhook URLs continue to work.

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || new URL(req.url).origin;
  const target = supabaseUrl.replace(/\/$/, '') + '/functions/v1/whatsapp-webhook' + new URL(req.url).search;
  return await fetch(target, { method: req.method, headers: req.headers, body: req.body });
});
