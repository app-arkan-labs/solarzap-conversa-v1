/**
 * SolarZap — HTML Email Templates
 *
 * Shared module used by notification-worker and ai-digest-worker.
 * All templates use inline CSS for maximum email-client compatibility
 * (Gmail, Outlook, Apple Mail, Yahoo, mobile clients).
 *
 * Brand colors:
 *  Primary  #16a34a (green-600)
 *  Dark     #14532d (green-950)
 *  Light BG #f0fdf4 (green-50)
 *  Accent   #eab308 (yellow-500) — for highlights
 */

/* ─────────── helpers ─────────── */

function esc(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDateTimeBR(value: unknown): string {
  if (!value) return ''
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/* ─────────── base layout ─────────── */

function baseLayout(opts: {
  iconEmoji: string
  iconBg: string
  title: string
  subtitle: string
  bodyHtml: string
  senderName?: string | null
  footerExtra?: string
}): string {
  const year = new Date().getFullYear()
  const brand = opts.senderName || 'SolarZap'

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${esc(opts.title)}</title>
<!--[if mso]>
<noscript><xml>
<o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings>
</xml></noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">

<!-- outer wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">

<!-- card -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

  <!-- green top bar -->
  <tr><td style="height:4px;background:linear-gradient(90deg,#16a34a,#22c55e);font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- header -->
  <tr><td style="padding:28px 32px 0 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td width="52" style="vertical-align:top;">
          <div style="width:48px;height:48px;border-radius:12px;background-color:${opts.iconBg};text-align:center;line-height:48px;font-size:22px;">
            ${opts.iconEmoji}
          </div>
        </td>
        <td style="padding-left:14px;vertical-align:middle;">
          <h1 style="margin:0;font-size:18px;font-weight:700;color:#18181b;line-height:1.3;">${esc(opts.title)}</h1>
          <p style="margin:4px 0 0;font-size:13px;color:#71717a;line-height:1.4;">${esc(opts.subtitle)}</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- divider -->
  <tr><td style="padding:20px 32px 0 32px;">
    <div style="height:1px;background-color:#e4e4e7;"></div>
  </td></tr>

  <!-- body -->
  <tr><td style="padding:20px 32px 28px 32px;">
    ${opts.bodyHtml}
  </td></tr>

  <!-- footer -->
  <tr><td style="padding:0 32px 24px 32px;">
    <div style="height:1px;background-color:#e4e4e7;margin-bottom:16px;"></div>
    ${opts.footerExtra || ''}
    <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;text-align:center;">
      Enviado por <strong style="color:#71717a;">${esc(brand)}</strong> via SolarZap CRM<br>
      &copy; ${year} — Você recebe este e-mail porque está cadastrado como destinatário de notificações.
    </p>
  </td></tr>

</table>
<!-- /card -->

</td></tr>
</table>
<!-- /outer wrapper -->

</body>
</html>`
}

/* ─────────── info row helper ─────────── */

function infoRow(label: string, value: string, color = '#18181b'): string {
  if (!value) return ''
  return `
    <tr>
      <td style="padding:6px 0;font-size:13px;color:#71717a;white-space:nowrap;vertical-align:top;width:130px;">${esc(label)}</td>
      <td style="padding:6px 0 6px 8px;font-size:14px;font-weight:600;color:${color};vertical-align:top;">${esc(value)}</td>
    </tr>`
}

function infoTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
}

/* ─────────── badge helper ─────────── */

function badge(text: string, bg: string, fg: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;background-color:${bg};color:${fg};font-size:11px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;">${esc(text)}</span>`
}

/* ─────────── stage pill ─────────── */

function stagePill(stage: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:8px;background-color:${color}15;color:${color};font-size:13px;font-weight:600;border:1px solid ${color}30;">${esc(stage)}</span>`
}

/* ═══════════════════════════════ TEMPLATES ═══════════════════════════════ */

export interface TemplateContext {
  senderName?: string | null
  leadName: string
  leadPhone?: string
  title?: string
  startAt?: string
  fromStage?: string
  toStage?: string
}

/* ── 1. NOVO LEAD ── */

export function novoLeadEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const subject = `🟢 Novo lead: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Um novo lead acaba de entrar no seu CRM. Confira os detalhes e dê o primeiro retorno o mais rápido possível.
    </p>
    ${infoTable(
      infoRow('Nome', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || 'Não informado') +
      infoRow('Status', 'Novo lead')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#f0fdf4;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">
        <strong>💡 Dica:</strong> Leads respondem até 7x mais quando contatados nos primeiros 5 minutos.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: '👤',
      iconBg: '#dcfce7',
      title: 'Novo Lead no CRM',
      subtitle: `${ctx.leadName}${ctx.leadPhone ? ` • ${ctx.leadPhone}` : ''}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Novo lead criado: ${ctx.leadName}${ctx.leadPhone ? ` (${ctx.leadPhone})` : ''}.`,
  }
}

/* ── 2. VISITA AGENDADA ── */

export function visitaAgendadaEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const dateStr = ctx.startAt ? formatDateTimeBR(ctx.startAt) : ''
  const subject = `📅 Visita agendada: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Uma nova visita técnica foi agendada. Certifique-se de que tudo esteja preparado para a data.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('Data/Hora', dateStr || 'A definir') +
      infoRow('Título', ctx.title || '')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#eff6ff;border:1px solid #bfdbfe;">
      <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.5;">
        <strong>📋 Checklist:</strong> Confirme endereço, documentos do cliente e ferramentas necessárias antes da visita.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: '📅',
      iconBg: '#dbeafe',
      title: 'Visita Agendada',
      subtitle: `${ctx.leadName}${dateStr ? ` • ${dateStr}` : ''}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Visita agendada para ${ctx.leadName}${dateStr ? ` em ${dateStr}` : ''}${ctx.title ? `. ${ctx.title}` : ''}.`,
  }
}

/* ── 3. VISITA REALIZADA ── */

export function visitaRealizadaEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const subject = `✅ Visita realizada: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      A visita técnica foi concluída com sucesso. Hora de registrar o resultado e avançar com a proposta.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('Título', ctx.title || '') +
      infoRow('Status', 'Realizada')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#f0fdf4;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">
        <strong>🚀 Próximo passo:</strong> Registre o resultado da visita e envie a proposta comercial.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: '✅',
      iconBg: '#dcfce7',
      title: 'Visita Realizada',
      subtitle: ctx.leadName,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Visita marcada como realizada para ${ctx.leadName}${ctx.title ? `. ${ctx.title}` : ''}.`,
  }
}

/* ── 4. CHAMADA AGENDADA ── */

export function chamadaAgendadaEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const dateStr = ctx.startAt ? formatDateTimeBR(ctx.startAt) : ''
  const subject = `📞 Chamada agendada: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Uma chamada foi agendada com o lead. Prepare seus argumentos e tenha os dados do cliente em mãos.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('Data/Hora', dateStr || 'A definir') +
      infoRow('Título', ctx.title || '')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#faf5ff;border:1px solid #e9d5ff;">
      <p style="margin:0;font-size:13px;color:#6b21a8;line-height:1.5;">
        <strong>🎯 Dica:</strong> Revise o histórico de conversas antes da ligação para personalizar o atendimento.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: '📞',
      iconBg: '#f3e8ff',
      title: 'Chamada Agendada',
      subtitle: `${ctx.leadName}${dateStr ? ` • ${dateStr}` : ''}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Chamada agendada para ${ctx.leadName}${dateStr ? ` em ${dateStr}` : ''}${ctx.title ? `. ${ctx.title}` : ''}.`,
  }
}

/* ── 5. CHAMADA REALIZADA ── */

export function chamadaRealizadaEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const subject = `✅ Chamada realizada: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      A chamada com o lead foi concluída. Registre as informações obtidas e defina os próximos passos.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('Título', ctx.title || '') +
      infoRow('Status', 'Realizada')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#f0fdf4;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">
        <strong>📝 Lembrete:</strong> Atualize o status do lead no pipeline e registre o resultado da chamada.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: '✅',
      iconBg: '#dcfce7',
      title: 'Chamada Realizada',
      subtitle: ctx.leadName,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Chamada marcada como realizada para ${ctx.leadName}${ctx.title ? `. ${ctx.title}` : ''}.`,
  }
}

/* ── 6. MUDANÇA DE ETAPA (STAGE CHANGED) ── */

export function stageChangedEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const from = ctx.fromStage || 'origem'
  const to = ctx.toStage || 'destino'
  const subject = `🔄 Pipeline: ${ctx.leadName} → ${to}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      O lead avançou no pipeline. Acompanhe a movimentação e ajuste a estratégia comercial conforme a nova etapa.
    </p>
    ${infoTable(infoRow('Lead', ctx.leadName) + infoRow('Telefone', ctx.leadPhone || ''))}
    <div style="margin-top:16px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td>${stagePill(from, '#71717a')}</td>
          <td style="padding:0 12px;font-size:18px;color:#a1a1aa;">→</td>
          <td>${stagePill(to, '#16a34a')}</td>
        </tr>
      </table>
    </div>
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#eff6ff;border:1px solid #bfdbfe;">
      <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.5;">
        <strong>📊 Ação:</strong> Verifique se há tarefas pendentes para a etapa <strong>${esc(to)}</strong>.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: '🔄',
      iconBg: '#dbeafe',
      title: 'Mudança de Etapa',
      subtitle: `${ctx.leadName} — ${from} → ${to}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Lead ${ctx.leadName} mudou etapa de ${from} para ${to}.`,
  }
}

/* ── 7. FINANCIAMENTO UPDATE ── */

export function financiamentoUpdateEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const from = ctx.fromStage || 'origem'
  const to = ctx.toStage || 'financiamento'
  const subject = `🏦 Financiamento: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Houve uma atualização no processo de financiamento deste lead. Acompanhe o andamento junto à instituição financeira.
    </p>
    ${infoTable(infoRow('Lead', ctx.leadName) + infoRow('Telefone', ctx.leadPhone || ''))}
    <div style="margin-top:16px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td>${stagePill(from, '#71717a')}</td>
          <td style="padding:0 12px;font-size:18px;color:#a1a1aa;">→</td>
          <td>${stagePill(to, '#eab308')}</td>
        </tr>
      </table>
    </div>
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#fefce8;border:1px solid #fde68a;">
      <p style="margin:0;font-size:13px;color:#854d0e;line-height:1.5;">
        <strong>🏦 Atenção:</strong> Verifique documentação pendente e prazos de aprovação do financiamento.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: '🏦',
      iconBg: '#fef9c3',
      title: 'Atualização de Financiamento',
      subtitle: `${ctx.leadName} — ${from} → ${to}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Lead ${ctx.leadName} mudou etapa de ${from} para ${to}.`,
  }
}

/* ── 8. DIGEST (DAILY / WEEKLY) ── */

export interface DigestLeadSummary {
  leadName: string
  leadPhone: string
  stage: string
  lastText: string
  pending: string
  nextStep: string
}

export function digestEmail(opts: {
  digestType: 'daily' | 'weekly'
  dateBucket: string
  leads: DigestLeadSummary[]
  senderName?: string | null
}): { subject: string; html: string; text: string } {
  const isWeekly = opts.digestType === 'weekly'
  const titleText = isWeekly ? 'Resumo Semanal' : 'Resumo Diário'
  const subject = `📊 ${titleText} — ${opts.dateBucket}`

  let leadsHtml = ''
  for (let i = 0; i < opts.leads.length; i++) {
    const s = opts.leads[i]
    const stageColor = s.stage === 'sem_etapa' ? '#a1a1aa' : '#16a34a'
    const bgColor = i % 2 === 0 ? '#fafafa' : '#ffffff'

    leadsHtml += `
    <div style="padding:14px 16px;background-color:${bgColor};border-radius:10px;margin-bottom:8px;border:1px solid #f4f4f5;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;font-size:14px;font-weight:700;color:#18181b;">${i + 1}. ${esc(s.leadName)}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#a1a1aa;">${esc(s.leadPhone)}</p>
          </td>
          <td style="text-align:right;vertical-align:top;">
            ${stagePill(s.stage, stageColor)}
          </td>
        </tr>
      </table>
      <div style="margin-top:10px;padding-left:2px;">
        <p style="margin:0 0 4px;font-size:12px;color:#71717a;">
          <strong style="color:#3f3f46;">O que aconteceu:</strong> ${esc(s.lastText)}
        </p>
        <p style="margin:0 0 4px;font-size:12px;color:#71717a;">
          <strong style="color:#3f3f46;">Pendência:</strong> ${esc(s.pending)}
        </p>
        <p style="margin:0;font-size:12px;color:#71717a;">
          <strong style="color:#3f3f46;">Próximo passo:</strong> ${esc(s.nextStep)}
        </p>
      </div>
    </div>`
  }

  const bodyHtml = `
    <div style="margin-bottom:16px;text-align:center;">
      ${badge(titleText, '#16a34a', '#ffffff')}
      <span style="display:inline-block;margin-left:8px;">${badge(opts.dateBucket, '#f4f4f5', '#3f3f46')}</span>
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:#3f3f46;line-height:1.6;">
      ${isWeekly ? 'Confira o resumo semanal' : 'Confira o resumo diário'} do seu CRM. 
      <strong>${opts.leads.length} lead${opts.leads.length !== 1 ? 's' : ''}</strong> 
      ${opts.leads.length !== 1 ? 'tiveram' : 'teve'} atividade no período.
    </p>
    <div style="margin-top:16px;">
      ${leadsHtml || '<p style="text-align:center;color:#a1a1aa;font-size:13px;padding:20px 0;">Nenhum lead com atividade no período.</p>'}
    </div>`

  // plain text fallback
  const textLines = [
    `${titleText} (${opts.dateBucket})`,
    `Leads com atividade: ${opts.leads.length}`,
    '',
    ...opts.leads.map((s, idx) =>
      `${idx + 1}. ${s.leadName} [${s.stage}]\n- O que aconteceu: ${s.lastText}\n- Pendência: ${s.pending}\n- Próximo passo sugerido: ${s.nextStep}`
    ),
  ]

  return {
    subject,
    html: baseLayout({
      iconEmoji: isWeekly ? '📈' : '📊',
      iconBg: isWeekly ? '#ede9fe' : '#dbeafe',
      title: titleText,
      subtitle: `${opts.leads.length} lead${opts.leads.length !== 1 ? 's' : ''} com atividade — ${opts.dateBucket}`,
      bodyHtml,
      senderName: opts.senderName,
    }),
    text: textLines.join('\n'),
  }
}

/* ── DEFAULT / FALLBACK ── */

export function defaultEventEmail(ctx: TemplateContext & { eventType: string }): { subject: string; html: string; text: string } {
  const subject = `🔔 Notificação: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Uma nova notificação foi gerada para o lead abaixo.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('Evento', ctx.eventType)
    )}`

  return {
    subject,
    html: baseLayout({
      iconEmoji: '🔔',
      iconBg: '#fef3c7',
      title: 'Notificação CRM',
      subtitle: ctx.leadName,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Evento ${ctx.eventType} para ${ctx.leadName}.`,
  }
}

/* ── ROUTER — maps event_type to template ── */

export function buildEmailContent(
  eventType: string,
  ctx: TemplateContext,
): { subject: string; html: string; text: string } {
  switch (eventType) {
    case 'novo_lead':
      return novoLeadEmail(ctx)
    case 'visita_agendada':
      return visitaAgendadaEmail(ctx)
    case 'visita_realizada':
      return visitaRealizadaEmail(ctx)
    case 'chamada_agendada':
      return chamadaAgendadaEmail(ctx)
    case 'chamada_realizada':
      return chamadaRealizadaEmail(ctx)
    case 'stage_changed':
      return stageChangedEmail(ctx)
    case 'financiamento_update':
      return financiamentoUpdateEmail(ctx)
    default:
      return defaultEventEmail({ ...ctx, eventType })
  }
}
