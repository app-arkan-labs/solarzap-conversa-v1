import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN");
if (!ALLOWED_ORIGIN) {
  throw new Error("Missing ALLOWED_ORIGIN env");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
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
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    const { type, start, end } = await req.json();

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

      csvContent = "ID,Nome,Telefone,Etapa,Origem,Data Criacao,Tags\n";
      data?.forEach((row: any) => {
        csvContent += `"${row.id}","${row.nome}","${row.telefone}","${row.status_pipeline}","${row.source}","${row.created_at}","${row.tags}"\n`;
      });
    } else if (type === "deals") {
      // Cash-mode export: realized receivables by paid installments.
      fileName = `deals_cash_export_${new Date().toISOString()}.csv`;

      const { data: scopedLeads, error: scopedLeadsError } = await supabaseClient
        .from("leads")
        .select("id")
        .eq("assigned_to_user_id", user.id);

      const scopedLeadIds = scopedLeads
        ? scopedLeads
          .map((row: any) => Number(row.id))
          .filter((id) => Number.isFinite(id))
        : [];

      let paidInstallmentsQuery = supabaseClient
        .from("lead_sale_installments")
        .select("id, lead_id, installment_no, cycle_no, amount, paid_amount, profit_amount, paid_at, payment_methods")
        .eq("status", "paid")
        .not("paid_at", "is", null)
        .gte("paid_at", start)
        .lte("paid_at", end)
        .order("paid_at", { ascending: false });

      if (scopedLeadsError) {
        paidInstallmentsQuery = paidInstallmentsQuery.in("lead_id", [-1]);
      } else if (scopedLeadIds.length === 0) {
        paidInstallmentsQuery = paidInstallmentsQuery.in("lead_id", [-1]);
      } else if (scopedLeadIds.length > 0) {
        paidInstallmentsQuery = paidInstallmentsQuery.in("lead_id", scopedLeadIds);
      }

      const { data: paidInstallments, error: paidInstallmentsError } = await paidInstallmentsQuery;

      if (!paidInstallmentsError) {
        const leadIds = Array.from(
          new Set(
            (paidInstallments || [])
              .map((row: any) => Number(row.lead_id))
              .filter((id) => Number.isFinite(id)),
          ),
        );

        const leadNameMap = new Map<number, string>();
        if (leadIds.length > 0) {
          const { data: leadsRows } = await supabaseClient
            .from("leads")
            .select("id, nome")
            .in("id", leadIds);

          leadsRows?.forEach((lead: any) => {
            const leadId = Number(lead.id);
            if (Number.isFinite(leadId)) {
              leadNameMap.set(leadId, String(lead.nome || ""));
            }
          });
        }

        csvContent = "Installment ID,Lead,Installment No,Cycle,Installment Amount,Paid Amount,Realized Profit,Paid At,Payment Methods\n";
        (paidInstallments || []).forEach((row: any) => {
          const leadId = Number(row.lead_id);
          const leadName = Number.isFinite(leadId) ? leadNameMap.get(leadId) || "" : "";
          const installmentAmount = Number(row.amount || 0);
          const paidAmount = Number((row.paid_amount ?? installmentAmount) || 0);
          const profitAmount = Number(row.profit_amount || 0);
          const paymentMethods = Array.isArray(row.payment_methods) ? row.payment_methods.join("+") : "";

          csvContent += `"${row.id}","${leadName}","${row.installment_no || ""}","${row.cycle_no || 1}","${installmentAmount}","${paidAmount}","${profitAmount}","${row.paid_at || ""}","${paymentMethods}"\n`;
        });
      } else {
        // Legacy fallback if finance table/permissions are unavailable.
        fileName = `deals_export_${new Date().toISOString()}.csv`;
        const { data } = await supabaseClient
          .from("deals")
          .select("id, title, amount, status, closed_at, created_at, leads(nome)")
          .gte("created_at", start)
          .lte("created_at", end)
          .eq("user_id", user.id);

        csvContent = "ID,Title,Lead,Amount,Status,Closed At,Created At\n";
        data?.forEach((row: any) => {
          csvContent += `"${row.id}","${row.title || ""}","${row.leads?.nome || ""}","${row.amount}","${row.status}","${row.closed_at || ""}","${row.created_at}"\n`;
        });
      }
    } else if (type === "appointments") {
      fileName = `agenda_export_${new Date().toISOString()}.csv`;
      const { data } = await supabaseClient
        .from("appointments")
        .select("id, title, type, status, start_at, end_at, leads(nome)")
        .gte("start_at", start)
        .lte("start_at", end)
        .eq("user_id", user.id);

      csvContent = "ID,Titulo,Lead,Tipo,Status,Inicio,Fim\n";
      data?.forEach((row: any) => {
        csvContent += `"${row.id}","${row.title}","${row.leads?.nome || ""}","${row.type}","${row.status}","${row.start_at}","${row.end_at}"\n`;
      });
    } else {
      throw new Error("Invalid export type");
    }

    const { error: uploadError } = await supabaseClient.storage
      .from("exports")
      .upload(`${user.id}/${fileName}`, csvContent, {
        contentType: "text/csv",
        upsert: true,
      });

    if (uploadError) {
      console.warn("Storage upload failed, returning raw text", uploadError);
      return new Response(csvContent, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }

    const { data: signedUrl } = await supabaseClient.storage
      .from("exports")
      .createSignedUrl(`${user.id}/${fileName}`, 3600);

    return new Response(JSON.stringify({ url: signedUrl?.signedUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
