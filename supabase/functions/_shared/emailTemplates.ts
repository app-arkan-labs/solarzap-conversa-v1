/**
 * SolarZap â€” HTML Email Templates
 *
 * Shared module used by notification-worker and ai-digest-worker.
 * All templates use inline CSS for maximum email-client compatibility
 * (Gmail, Outlook, Apple Mail, Yahoo, mobile clients).
 *
 * Brand colors:
 *  Primary  #16a34a (green-600)
 *  Dark     #14532d (green-950)
 *  Light BG #f0fdf4 (green-50)
 *  Accent   #eab308 (yellow-500) â€” for highlights
 */

import {
  DIGEST_LABEL_CURRENT_SITUATION,
  DIGEST_LABEL_RECOMMENDED_ACTIONS,
  DIGEST_LABEL_SUMMARY,
  getDigestIntro,
  getDigestTitle,
} from './digestContract.ts'

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ base layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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
      &copy; ${year} - Voce recebe este e-mail porque esta cadastrado como destinatario de notificacoes.
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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ info row helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

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

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ badge helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function badge(text: string, bg: string, fg: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;background-color:${bg};color:${fg};font-size:11px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;">${esc(text)}</span>`
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ stage pill â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function stagePill(stage: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:8px;background-color:${color}15;color:${color};font-size:13px;font-weight:600;border:1px solid ${color}30;">${esc(stage)}</span>`
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• TEMPLATES â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

export interface TemplateContext {
  senderName?: string | null
  leadName: string
  leadPhone?: string
  title?: string
  startAt?: string
  fromStage?: string
  toStage?: string
  dueOn?: string
  amount?: string
  installmentNo?: number
}

export interface SystemAccessTemplateContext {
  senderName?: string | null
  orgName?: string | null
  role?: 'owner' | 'admin' | 'user' | 'consultant' | string
  inviteLink?: string
  resetLink?: string
  loginUrl?: string
  tempPassword?: string
  recipientEmail?: string
}

function roleLabel(role?: 'owner' | 'admin' | 'user' | 'consultant' | string): string {
  const normalized = String(role || '').trim().toLowerCase()
  switch (normalized) {
    case 'owner':
      return 'ProprietÃ¡rio'
    case 'admin':
      return 'Administrador'
    case 'consultant':
      return 'Consultor'
    case 'user':
      return 'UsuÃ¡rio'
    default:
      return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'UsuÃ¡rio'
  }
}

/* â”€â”€ 1. NOVO LEAD â”€â”€ */

export function novoLeadEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const subject = `ðŸŸ¢ Novo lead: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Um novo lead acaba de entrar no seu CRM. Confira os detalhes e dÃª o primeiro retorno o mais rÃ¡pido possÃ­vel.
    </p>
    ${infoTable(
      infoRow('Nome', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || 'NÃ£o informado') +
      infoRow('Status', 'Novo lead')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#f0fdf4;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">
        <strong>ðŸ’¡ Dica:</strong> Leads respondem atÃ© 7x mais quando contatados nos primeiros 5 minutos.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: 'ðŸ‘¤',
      iconBg: '#dcfce7',
      title: 'Novo Lead no CRM',
      subtitle: `${ctx.leadName}${ctx.leadPhone ? ` â€¢ ${ctx.leadPhone}` : ''}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Novo lead criado: ${ctx.leadName}${ctx.leadPhone ? ` (${ctx.leadPhone})` : ''}.`,
  }
}

/* â”€â”€ 2. VISITA AGENDADA â”€â”€ */

export function visitaAgendadaEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const dateStr = ctx.startAt ? formatDateTimeBR(ctx.startAt) : ''
  const subject = `ðŸ“… Visita agendada: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Uma nova visita tÃ©cnica foi agendada. Certifique-se de que tudo esteja preparado para a data.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('Data/Hora', dateStr || 'A definir') +
      infoRow('TÃ­tulo', ctx.title || '')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#eff6ff;border:1px solid #bfdbfe;">
      <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.5;">
        <strong>ðŸ“‹ Checklist:</strong> Confirme endereÃ§o, documentos do cliente e ferramentas necessÃ¡rias antes da visita.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: 'ðŸ“…',
      iconBg: '#dbeafe',
      title: 'Visita Agendada',
      subtitle: `${ctx.leadName}${dateStr ? ` â€¢ ${dateStr}` : ''}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Visita agendada para ${ctx.leadName}${dateStr ? ` em ${dateStr}` : ''}${ctx.title ? `. ${ctx.title}` : ''}.`,
  }
}

/* â”€â”€ 3. VISITA REALIZADA â”€â”€ */

export function visitaRealizadaEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const subject = `âœ… Visita realizada: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      A visita tÃ©cnica foi concluÃ­da com sucesso. Hora de registrar o resultado e avanÃ§ar com a proposta.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('TÃ­tulo', ctx.title || '') +
      infoRow('Status', 'Realizada')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#f0fdf4;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">
        <strong>ðŸš€ PrÃ³ximo passo:</strong> Registre o resultado da visita e envie a proposta comercial.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: 'âœ…',
      iconBg: '#dcfce7',
      title: 'Visita Realizada',
      subtitle: ctx.leadName,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Visita marcada como realizada para ${ctx.leadName}${ctx.title ? `. ${ctx.title}` : ''}.`,
  }
}

/* â”€â”€ 4. CHAMADA AGENDADA â”€â”€ */

export function chamadaAgendadaEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const dateStr = ctx.startAt ? formatDateTimeBR(ctx.startAt) : ''
  const subject = `ðŸ“ž Chamada agendada: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Uma chamada foi agendada com o lead. Prepare seus argumentos e tenha os dados do cliente em mÃ£os.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('Data/Hora', dateStr || 'A definir') +
      infoRow('TÃ­tulo', ctx.title || '')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#faf5ff;border:1px solid #e9d5ff;">
      <p style="margin:0;font-size:13px;color:#6b21a8;line-height:1.5;">
        <strong>ðŸŽ¯ Dica:</strong> Revise o histÃ³rico de conversas antes da ligaÃ§Ã£o para personalizar o atendimento.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: 'ðŸ“ž',
      iconBg: '#f3e8ff',
      title: 'Chamada Agendada',
      subtitle: `${ctx.leadName}${dateStr ? ` â€¢ ${dateStr}` : ''}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Chamada agendada para ${ctx.leadName}${dateStr ? ` em ${dateStr}` : ''}${ctx.title ? `. ${ctx.title}` : ''}.`,
  }
}

/* â”€â”€ 5. CHAMADA REALIZADA â”€â”€ */

export function chamadaRealizadaEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const subject = `âœ… Chamada realizada: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      A chamada com o lead foi concluÃ­da. Registre as informaÃ§Ãµes obtidas e defina os prÃ³ximos passos.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('TÃ­tulo', ctx.title || '') +
      infoRow('Status', 'Realizada')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#f0fdf4;border:1px solid #bbf7d0;">
      <p style="margin:0;font-size:13px;color:#166534;line-height:1.5;">
        <strong>ðŸ“ Lembrete:</strong> Atualize o status do lead no pipeline e registre o resultado da chamada.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: 'âœ…',
      iconBg: '#dcfce7',
      title: 'Chamada Realizada',
      subtitle: ctx.leadName,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Chamada marcada como realizada para ${ctx.leadName}${ctx.title ? `. ${ctx.title}` : ''}.`,
  }
}

/* â”€â”€ 6. MUDANÃ‡A DE ETAPA (STAGE CHANGED) â”€â”€ */

export function stageChangedEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const from = ctx.fromStage || 'origem'
  const to = ctx.toStage || 'destino'
  const subject = `ðŸ”„ Pipeline: ${ctx.leadName} â†’ ${to}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      O lead avanÃ§ou no pipeline. Acompanhe a movimentaÃ§Ã£o e ajuste a estratÃ©gia comercial conforme a nova etapa.
    </p>
    ${infoTable(infoRow('Lead', ctx.leadName) + infoRow('Telefone', ctx.leadPhone || ''))}
    <div style="margin-top:16px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td>${stagePill(from, '#71717a')}</td>
          <td style="padding:0 12px;font-size:18px;color:#a1a1aa;">â†’</td>
          <td>${stagePill(to, '#16a34a')}</td>
        </tr>
      </table>
    </div>
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#eff6ff;border:1px solid #bfdbfe;">
      <p style="margin:0;font-size:13px;color:#1e40af;line-height:1.5;">
        <strong>ðŸ“Š AÃ§Ã£o:</strong> Verifique se hÃ¡ tarefas pendentes para a etapa <strong>${esc(to)}</strong>.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: 'ðŸ”„',
      iconBg: '#dbeafe',
      title: 'MudanÃ§a de Etapa',
      subtitle: `${ctx.leadName} â€” ${from} â†’ ${to}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Lead ${ctx.leadName} mudou etapa de ${from} para ${to}.`,
  }
}

export function installmentDueCheckEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const installmentLabel = ctx.installmentNo ? `Parcela #${ctx.installmentNo}` : 'Parcela'
  const dueLabel = ctx.dueOn ? formatDateTimeBR(ctx.dueOn) : 'Data nao informada'
  const amountLabel = ctx.amount || 'Valor nao informado'
  const subject = `Parcela pendente: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Uma parcela venceu e esta aguardando confirmacao de pagamento no CRM.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('Parcela', installmentLabel) +
      infoRow('Vencimento', dueLabel) +
      infoRow('Valor', amountLabel, '#166534')
    )}
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#fefce8;border:1px solid #fde68a;">
      <p style="margin:0;font-size:13px;color:#854d0e;line-height:1.5;">
        <strong>Acao requerida:</strong> confirme pagamento ou reagende a cobranca no CRM com nova data.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: '💸',
      iconBg: '#fef9c3',
      title: 'Parcela Pendente de Confirmacao',
      subtitle: `${ctx.leadName} • ${installmentLabel}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `${installmentLabel} de ${ctx.leadName} venceu em ${dueLabel} (${amountLabel}). Confirme pagamento ou reagende.`,
  }
}

/* â”€â”€ 7. FINANCIAMENTO UPDATE â”€â”€ */

export function financiamentoUpdateEmail(ctx: TemplateContext): { subject: string; html: string; text: string } {
  const from = ctx.fromStage || 'origem'
  const to = ctx.toStage || 'financiamento'
  const subject = `ðŸ¦ Financiamento: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Houve uma atualizaÃ§Ã£o no processo de financiamento deste lead. Acompanhe o andamento junto Ã  instituiÃ§Ã£o financeira.
    </p>
    ${infoTable(infoRow('Lead', ctx.leadName) + infoRow('Telefone', ctx.leadPhone || ''))}
    <div style="margin-top:16px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td>${stagePill(from, '#71717a')}</td>
          <td style="padding:0 12px;font-size:18px;color:#a1a1aa;">â†’</td>
          <td>${stagePill(to, '#eab308')}</td>
        </tr>
      </table>
    </div>
    <div style="margin-top:20px;padding:14px 16px;border-radius:10px;background-color:#fefce8;border:1px solid #fde68a;">
      <p style="margin:0;font-size:13px;color:#854d0e;line-height:1.5;">
        <strong>ðŸ¦ AtenÃ§Ã£o:</strong> Verifique documentaÃ§Ã£o pendente e prazos de aprovaÃ§Ã£o do financiamento.
      </p>
    </div>`

  return {
    subject,
    html: baseLayout({
      iconEmoji: 'ðŸ¦',
      iconBg: '#fef9c3',
      title: 'AtualizaÃ§Ã£o de Financiamento',
      subtitle: `${ctx.leadName} â€” ${from} â†’ ${to}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Lead ${ctx.leadName} mudou etapa de ${from} para ${to}.`,
  }
}

/* â”€â”€ 8. DIGEST (DAILY / WEEKLY) â”€â”€ */

export interface DigestLeadSummary {
  leadName: string
  leadPhone: string
  stage: string
  summary: string
  currentSituation: string
  recommendedActions: string
}

export function digestEmail(opts: {
  digestType: 'daily' | 'weekly'
  dateBucket: string
  leads: DigestLeadSummary[]
  senderName?: string | null
}): { subject: string; html: string; text: string } {
  const isWeekly = opts.digestType === 'weekly'
  const titleText = getDigestTitle(opts.digestType)
  const digestIntro = getDigestIntro(opts.digestType)
  const subject = `📊 ${titleText} - ${opts.dateBucket}`

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
          <strong style="color:#3f3f46;">${DIGEST_LABEL_SUMMARY}:</strong> ${esc(s.summary)}
        </p>
        <p style="margin:0 0 4px;font-size:12px;color:#71717a;">
          <strong style="color:#3f3f46;">${DIGEST_LABEL_CURRENT_SITUATION}:</strong> ${esc(s.currentSituation)}
        </p>
        <p style="margin:0;font-size:12px;color:#71717a;">
          <strong style="color:#3f3f46;">${DIGEST_LABEL_RECOMMENDED_ACTIONS}:</strong> ${esc(s.recommendedActions)}
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
      ${digestIntro} do seu CRM.
      <strong>${opts.leads.length} lead${opts.leads.length !== 1 ? 's' : ''}</strong> 
      ${opts.leads.length !== 1 ? 'tiveram' : 'teve'} atividade no periodo.
    </p>
    <div style="margin-top:16px;">
      ${leadsHtml || '<p style="text-align:center;color:#a1a1aa;font-size:13px;padding:20px 0;">Nenhum lead com atividade no periodo.</p>'}
    </div>`

  // plain text fallback
  const textLines = [
    `${titleText} (${opts.dateBucket})`,
    `Leads com atividade: ${opts.leads.length}`,
    '',
    ...opts.leads.map((s, idx) =>
      `${idx + 1}. ${s.leadName} [${s.stage}]\n- ${DIGEST_LABEL_SUMMARY}: ${s.summary}\n- ${DIGEST_LABEL_CURRENT_SITUATION}: ${s.currentSituation}\n- ${DIGEST_LABEL_RECOMMENDED_ACTIONS}: ${s.recommendedActions}`
    ),
  ]

  const subtitleSuffix = isWeekly ? 'com atividade no periodo' : 'com atividade nas ultimas 24h'

  return {
    subject,
    html: baseLayout({
      iconEmoji: isWeekly ? 'ðŸ“ˆ' : 'ðŸ“Š',
      iconBg: isWeekly ? '#ede9fe' : '#dbeafe',
      title: titleText,
      subtitle: `${opts.leads.length} lead${opts.leads.length !== 1 ? 's' : ''} ${subtitleSuffix} - ${opts.dateBucket}`,
      bodyHtml,
      senderName: opts.senderName,
    }),
    text: textLines.join('\n'),
  }
}

/* â”€â”€ SYSTEM AUTH: CONVITE DE ACESSO â”€â”€ */

export function systemInviteEmail(ctx: SystemAccessTemplateContext): { subject: string; html: string; text: string } {
  const subject = '\uD83D\uDD10 Convite de acesso \u2014 SolarZap'
  const org = ctx.orgName || 'Sua organizaÃ§Ã£o'
  const role = roleLabel(ctx.role)
  const accessLink = ctx.inviteLink || ctx.resetLink || ctx.loginUrl || ''

  const ctaHtml = accessLink
    ? `
    <div style="margin-top:20px;text-align:center;">
      <a href="${esc(accessLink)}" style="display:inline-block;padding:11px 18px;border-radius:10px;background-color:#16a34a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Acessar SolarZap</a>
    </div>`
    : ''

  const fallbackTitle = 'Se o botÃ£o nÃ£o funcionar, copie e cole o link abaixo no navegador:'

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      VocÃª recebeu um convite para acessar o <strong>SolarZap</strong>.
    </p>
    ${infoTable(
      infoRow('OrganizaÃ§Ã£o', org) +
      infoRow('Perfil', role) +
      infoRow('E-mail', ctx.recipientEmail || 'NÃ£o informado')
    )}
    ${ctaHtml}
    <p style="margin:14px 0 0;font-size:12px;color:#71717a;line-height:1.5;">
      Ao clicar em <strong>Acessar SolarZap</strong>, vocÃª irÃ¡ definir ou redefinir sua senha para concluir o acesso.
    </p>
    <p style="margin:18px 0 0;font-size:12px;color:#71717a;line-height:1.5;">
      ${fallbackTitle}<br>
      <span style="word-break:break-all;color:#3f3f46;">${esc(accessLink)}</span>
    </p>`

  const textLines = [
    'Convite de acesso â€” SolarZap',
    `OrganizaÃ§Ã£o: ${org}`,
    `Perfil: ${role}`,
    `E-mail: ${ctx.recipientEmail || 'NÃ£o informado'}`,
    '',
    'Use o link abaixo para definir/redefinir sua senha e concluir o acesso:',
    accessLink || '(link nÃ£o informado)',
  ]

  return {
    subject,
    html: baseLayout({
      iconEmoji: '\uD83D\uDD10',
      iconBg: '#dcfce7',
      title: 'Convite de Acesso',
      subtitle: `${org} â€¢ ${role}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: textLines.join('\n'),
  }
}

export function systemAccountCreatedEmail(ctx: SystemAccessTemplateContext): { subject: string; html: string; text: string } {
  const subject = '\u2705 Conta criada \u2014 acesso ao SolarZap'
  const org = ctx.orgName || 'Sua organizaÃ§Ã£o'
  const role = roleLabel(ctx.role)
  const actionUrl = ctx.resetLink || ctx.loginUrl || ''

  const passwordHtml = ctx.tempPassword
    ? `
    <div style="margin-top:16px;padding:12px 14px;border-radius:10px;background-color:#fefce8;border:1px solid #fde68a;">
      <p style="margin:0 0 6px;font-size:12px;color:#854d0e;font-weight:700;">Senha temporÃ¡ria</p>
      <p style="margin:0;font-size:16px;color:#18181b;font-weight:700;letter-spacing:0.2px;">${esc(ctx.tempPassword)}</p>
    </div>`
    : ''

  const resetHintHtml = !ctx.tempPassword && ctx.resetLink
    ? `
    <div style="margin-top:16px;padding:12px 14px;border-radius:10px;background-color:#eff6ff;border:1px solid #bfdbfe;">
      <p style="margin:0;font-size:13px;color:#1d4ed8;line-height:1.5;">
        Sua conta jÃ¡ existia. Use o botÃ£o abaixo para definir/redefinir sua senha antes do primeiro acesso nesta organizaÃ§Ã£o.
      </p>
    </div>`
    : ''

  const actionCtaHtml = actionUrl
    ? `
    <div style="margin-top:20px;text-align:center;">
      <a href="${esc(actionUrl)}" style="display:inline-block;padding:11px 18px;border-radius:10px;background-color:#16a34a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">${ctx.resetLink ? 'Definir/Redefinir senha' : 'Acessar SolarZap'}</a>
    </div>`
    : ''

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Sua conta foi criada com sucesso para acesso ao <strong>SolarZap</strong>.
    </p>
    ${infoTable(
      infoRow('OrganizaÃ§Ã£o', org) +
      infoRow('Perfil', role) +
      infoRow('E-mail', ctx.recipientEmail || 'NÃ£o informado')
    )}
    ${passwordHtml}
    ${resetHintHtml}
    ${actionCtaHtml}
    <div style="margin-top:16px;padding:14px 16px;border-radius:10px;background-color:#fef2f2;border:1px solid #fecaca;">
      <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.5;">
        <strong>SeguranÃ§a:</strong> altere sua senha imediatamente apÃ³s o primeiro acesso.
      </p>
    </div>
    <p style="margin:14px 0 0;font-size:12px;color:#71717a;line-height:1.5;">
      Se o botÃ£o nÃ£o funcionar, use este link:<br>
      <span style="word-break:break-all;color:#3f3f46;">${esc(actionUrl)}</span>
    </p>`

  const textLines = [
    'Conta criada â€” acesso ao SolarZap',
    `OrganizaÃ§Ã£o: ${org}`,
    `Perfil: ${role}`,
    `E-mail: ${ctx.recipientEmail || 'NÃ£o informado'}`,
    ...(ctx.tempPassword ? [`Senha temporÃ¡ria: ${ctx.tempPassword}`] : []),
    ...(!ctx.tempPassword && ctx.resetLink ? ['Defina/redefina sua senha pelo link enviado abaixo.'] : []),
    '',
    ctx.resetLink ? 'Defina/redefina sua senha:' : 'Acesse o sistema:',
    actionUrl || '(link nÃ£o informado)',
    '',
    'SeguranÃ§a: altere sua senha imediatamente apÃ³s o primeiro acesso.',
  ]

  return {
    subject,
    html: baseLayout({
      iconEmoji: '\u2705',
      iconBg: '#dcfce7',
      title: 'Conta Criada',
      subtitle: `${org} â€¢ ${role}`,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: textLines.join('\n'),
  }
}

export function defaultEventEmail(ctx: TemplateContext & { eventType: string }): { subject: string; html: string; text: string } {
  const subject = `ðŸ”” NotificaÃ§Ã£o: ${ctx.leadName}`

  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;line-height:1.6;">
      Uma nova notificaÃ§Ã£o foi gerada para o lead abaixo.
    </p>
    ${infoTable(
      infoRow('Lead', ctx.leadName) +
      infoRow('Telefone', ctx.leadPhone || '') +
      infoRow('Evento', ctx.eventType)
    )}`

  return {
    subject,
    html: baseLayout({
      iconEmoji: 'ðŸ””',
      iconBg: '#fef3c7',
      title: 'NotificaÃ§Ã£o CRM',
      subtitle: ctx.leadName,
      bodyHtml,
      senderName: ctx.senderName,
    }),
    text: `Evento ${ctx.eventType} para ${ctx.leadName}.`,
  }
}

/* â”€â”€ ROUTER â€” maps event_type to template â”€â”€ */

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
    case 'installment_due_check':
      return installmentDueCheckEmail(ctx)
    default:
      return defaultEventEmail({ ...ctx, eventType })
  }
}

