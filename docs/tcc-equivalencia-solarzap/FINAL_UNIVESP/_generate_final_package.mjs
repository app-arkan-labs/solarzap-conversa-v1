import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = __dirname;
const rootDir = path.resolve(outDir, '..', '..', '..');

const data = {
  nome: 'Rodrigo Sena Fernandes',
  ra: '2211724',
  curso: 'Ciencia de Dados',
  polo: 'Garca',
  instituicao: 'UNIVESP',
  sistema: 'SolarZap',
  periodo: '10/01/2026 a 15/05/2026',
  localData: 'Marilia/SP, 18 de junho de 2026',
  url: 'https://app.solarzap.com.br',
  titulo: 'Desenvolvimento de uma plataforma CRM com automacoes para gestao comercial no setor de energia solar'
};

const images = {
  login: path.join(outDir, 'evidencia-producao-login-url-visivel.png'),
  auth: path.join(outDir, 'evidencia-producao-area-autenticada.png'),
  calendar: path.join(outDir, 'evidencia-producao-calendario.png'),
  contacts: path.join(outDir, 'evidencia-producao-contatos-redigido.png'),
  proposals: path.join(outDir, 'evidencia-producao-propostas-redigido.png'),
  dashboard: path.join(outDir, 'evidencia-producao-dashboard-redigido.png'),
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function fileUrl(p) {
  return `file:///${path.resolve(p).replace(/\\/g, '/')}`;
}

function p(text) {
  return `<p>${text}</p>`;
}

function ul(items) {
  return `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${
    rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')
  }</tbody></table>`;
}

function imageFigure(file, caption) {
  return `<figure><img src="${fileUrl(file)}" alt="${esc(caption)}"><figcaption>${caption}</figcaption></figure>`;
}

const css = `
  @page { size: A4; margin: 18mm 15mm 18mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #172033; line-height: 1.48; font-size: 10.6pt; margin: 0; }
  .doc { max-width: 100%; }
  .cover { min-height: 91vh; display: flex; flex-direction: column; justify-content: center; border: 1px solid #d7dde8; padding: 34px; border-radius: 10px; background: linear-gradient(180deg, #fff, #f8fafc); }
  .cover h1 { font-size: 23pt; line-height: 1.18; margin: 0 0 24px; color: #0f172a; }
  .cover .subtitle { font-size: 12pt; color: #46546a; margin-bottom: 28px; }
  .cover .meta { display: grid; grid-template-columns: 170px 1fr; gap: 8px 16px; font-size: 11pt; }
  .cover .meta b { color: #0f172a; }
  h1 { font-size: 22pt; margin: 0 0 18px; color: #0f172a; }
  h2 { font-size: 16pt; margin: 26px 0 10px; color: #12213a; border-bottom: 1px solid #d7dde8; padding-bottom: 5px; }
  h3 { font-size: 12.5pt; margin: 20px 0 8px; color: #1e365f; }
  p { margin: 0 0 9px; }
  ul { margin: 6px 0 12px 22px; padding: 0; }
  li { margin: 3px 0; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 9.3pt; page-break-inside: avoid; }
  th { background: #eef3f9; color: #0f172a; text-align: left; font-weight: 700; }
  th, td { border: 1px solid #cfd8e6; padding: 6px 7px; vertical-align: top; }
  .note { border-left: 4px solid #f97316; background: #fff7ed; padding: 10px 12px; margin: 12px 0; }
  .muted { color: #556276; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 99px; background: #eef3f9; border: 1px solid #d7dde8; font-size: 9pt; margin: 2px; }
  .page-break { break-before: page; page-break-before: always; }
  figure { margin: 12px 0 18px; break-inside: avoid; page-break-inside: avoid; }
  figure img { display: block; max-width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; }
  figcaption { font-size: 9pt; color: #556276; margin-top: 5px; }
  svg.diagram { width: 100%; height: auto; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; margin: 10px 0 16px; page-break-inside: avoid; }
  .small { font-size: 9pt; }
  .signature { margin-top: 70px; text-align: center; }
  .signature .line { border-top: 1px solid #111827; width: 70%; margin: 0 auto 8px; }
`;

function shell(title, body) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body><main class="doc">${body}</main></body></html>`;
}

function cover(docTitle, subtitle = '') {
  return `<section class="cover">
    <h1>${docTitle}</h1>
    ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
    <div class="meta">
      <b>Aluno</b><span>${data.nome}</span>
      <b>RA</b><span>${data.ra}</span>
      <b>Curso</b><span>${data.curso}</span>
      <b>Polo</b><span>${data.polo}</span>
      <b>Instituicao</b><span>${data.instituicao}</span>
      <b>Sistema</b><span>${data.sistema}</span>
      <b>Periodo</b><span>${data.periodo}</span>
      <b>Ambiente de producao</b><span>${data.url}</span>
      <b>Local e data</b><span>${data.localData}</span>
    </div>
  </section>`;
}

function architectureSvg() {
  return `<svg class="diagram" viewBox="0 0 920 470" xmlns="http://www.w3.org/2000/svg">
    <defs><style>.box{fill:#f8fafc;stroke:#94a3b8;stroke-width:1.4}.core{fill:#fff7ed;stroke:#fb923c}.ext{fill:#eef6ff;stroke:#60a5fa}.txt{font:14px Arial;fill:#172033}.title{font:bold 16px Arial;fill:#0f172a}.line{stroke:#64748b;stroke-width:1.4;marker-end:url(#m)}.small{font:12px Arial;fill:#475569}</style><marker id="m" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0,0 L8,3.5 L0,7 Z" fill="#64748b"/></marker></defs>
    <rect x="30" y="42" width="150" height="58" rx="8" class="box"/><text x="105" y="66" text-anchor="middle" class="title">Usuario</text><text x="105" y="86" text-anchor="middle" class="small">navegador web</text>
    <rect x="245" y="32" width="190" height="78" rx="8" class="core"/><text x="340" y="62" text-anchor="middle" class="title">SPA React/Vite</text><text x="340" y="84" text-anchor="middle" class="small">rotas, UI, hooks</text>
    <rect x="520" y="30" width="170" height="80" rx="8" class="box"/><text x="605" y="58" text-anchor="middle" class="title">Supabase</text><text x="605" y="80" text-anchor="middle" class="small">Auth, DB, RLS, Storage</text>
    <rect x="520" y="155" width="170" height="78" rx="8" class="box"/><text x="605" y="184" text-anchor="middle" class="title">Edge Functions</text><text x="605" y="206" text-anchor="middle" class="small">webhooks e APIs</text>
    <rect x="735" y="40" width="150" height="52" rx="8" class="ext"/><text x="810" y="70" text-anchor="middle" class="txt">WhatsApp/Evolution</text>
    <rect x="735" y="112" width="150" height="52" rx="8" class="ext"/><text x="810" y="142" text-anchor="middle" class="txt">Google / Meta</text>
    <rect x="735" y="184" width="150" height="52" rx="8" class="ext"/><text x="810" y="214" text-anchor="middle" class="txt">Stripe / E-mail</text>
    <rect x="735" y="256" width="150" height="52" rx="8" class="ext"/><text x="810" y="286" text-anchor="middle" class="txt">IA / dados solares</text>
    <rect x="250" y="160" width="185" height="65" rx="8" class="core"/><text x="342" y="187" text-anchor="middle" class="title">CRM SolarZap</text><text x="342" y="209" text-anchor="middle" class="small">leads, pipeline, propostas</text>
    <rect x="250" y="275" width="185" height="65" rx="8" class="box"/><text x="342" y="302" text-anchor="middle" class="title">Deploy</text><text x="342" y="324" text-anchor="middle" class="small">Docker / Caddy / dominio</text>
    <path d="M180 71 H245" class="line"/><path d="M435 71 H520" class="line"/><path d="M435 193 H520" class="line"/><path d="M605 110 V155" class="line"/><path d="M690 195 H735" class="line"/><path d="M690 195 C710 100 715 68 735 68" class="line"/><path d="M690 195 C710 150 715 139 735 139" class="line"/><path d="M690 195 C710 230 715 211 735 211" class="line"/><path d="M690 195 C710 280 715 283 735 283" class="line"/><path d="M340 110 V160" class="line"/><path d="M340 225 V275" class="line"/>
  </svg>`;
}

function flowSvg() {
  return `<svg class="diagram" viewBox="0 0 920 365" xmlns="http://www.w3.org/2000/svg">
    <defs><style>.b{fill:#f8fafc;stroke:#94a3b8;stroke-width:1.4}.c{fill:#fff7ed;stroke:#fb923c}.t{font:bold 14px Arial;fill:#0f172a}.s{font:12px Arial;fill:#475569}.l{stroke:#64748b;stroke-width:1.4;marker-end:url(#a)}</style><marker id="a" markerWidth="8" markerHeight="8" refX="7" refY="3.5" orient="auto"><path d="M0,0 L8,3.5 L0,7 Z" fill="#64748b"/></marker></defs>
    ${['Entrada do lead','Contato / conversa','Pipeline comercial','Tarefas e agenda','Proposta comercial','Acompanhamento'].map((txt,i)=>`<rect x="${40+i*145}" y="70" width="120" height="70" rx="8" class="${i===2||i===4?'c':'b'}"/><text x="${100+i*145}" y="100" text-anchor="middle" class="t">${txt.split(' / ')[0]}</text><text x="${100+i*145}" y="121" text-anchor="middle" class="s">${txt.includes(' / ')?txt.split(' / ')[1]:''}</text>`).join('')}
    ${[0,1,2,3,4].map(i=>`<path d="M${160+i*145} 105 H${185+i*145}" class="l"/>`).join('')}
    <rect x="205" y="230" width="180" height="58" rx="8" class="b"/><text x="295" y="255" text-anchor="middle" class="t">Automacoes</text><text x="295" y="276" text-anchor="middle" class="s">mensagens, regras, jobs</text>
    <rect x="510" y="230" width="180" height="58" rx="8" class="b"/><text x="600" y="255" text-anchor="middle" class="t">Tracking</text><text x="600" y="276" text-anchor="middle" class="s">origem e conversoes</text>
    <path d="M390 140 C390 190 320 195 295 230" class="l"/><path d="M620 140 C620 185 610 200 600 230" class="l"/>
  </svg>`;
}

function erSvg() {
  return `<svg class="diagram" viewBox="0 0 920 500" xmlns="http://www.w3.org/2000/svg">
    <defs><style>.e{fill:#ffffff;stroke:#94a3b8;stroke-width:1.3}.m{fill:#eef6ff;stroke:#60a5fa}.p{fill:#fff7ed;stroke:#fb923c}.t{font:bold 13px Arial;fill:#0f172a}.s{font:11px Arial;fill:#475569}.l{stroke:#64748b;stroke-width:1.2}</style></defs>
    <rect x="35" y="35" width="150" height="60" rx="8" class="p"/><text x="110" y="62" text-anchor="middle" class="t">organizations</text><text x="110" y="80" text-anchor="middle" class="s">tenants / empresas</text>
    <rect x="250" y="35" width="160" height="60" rx="8" class="e"/><text x="330" y="62" text-anchor="middle" class="t">organization_members</text><text x="330" y="80" text-anchor="middle" class="s">usuarios e papeis</text>
    <rect x="35" y="145" width="150" height="60" rx="8" class="p"/><text x="110" y="172" text-anchor="middle" class="t">leads</text><text x="110" y="190" text-anchor="middle" class="s">contatos e pipeline</text>
    <rect x="250" y="145" width="150" height="60" rx="8" class="e"/><text x="325" y="172" text-anchor="middle" class="t">interacoes</text><text x="325" y="190" text-anchor="middle" class="s">mensagens</text>
    <rect x="455" y="145" width="150" height="60" rx="8" class="e"/><text x="530" y="172" text-anchor="middle" class="t">appointments</text><text x="530" y="190" text-anchor="middle" class="s">agenda</text>
    <rect x="660" y="145" width="150" height="60" rx="8" class="e"/><text x="735" y="172" text-anchor="middle" class="t">lead_tasks</text><text x="735" y="190" text-anchor="middle" class="s">tarefas</text>
    <rect x="35" y="260" width="150" height="60" rx="8" class="p"/><text x="110" y="287" text-anchor="middle" class="t">propostas</text><text x="110" y="305" text-anchor="middle" class="s">propostas comerciais</text>
    <rect x="250" y="260" width="165" height="60" rx="8" class="e"/><text x="333" y="287" text-anchor="middle" class="t">proposal_versions</text><text x="333" y="305" text-anchor="middle" class="s">versoes e snapshot</text>
    <rect x="465" y="260" width="160" height="60" rx="8" class="e"/><text x="545" y="287" text-anchor="middle" class="t">tracking</text><text x="545" y="305" text-anchor="middle" class="s">origem e conversoes</text>
    <rect x="675" y="260" width="160" height="60" rx="8" class="e"/><text x="755" y="287" text-anchor="middle" class="t">automation_settings</text><text x="755" y="305" text-anchor="middle" class="s">regras por org</text>
    <rect x="240" y="385" width="190" height="60" rx="8" class="m"/><text x="335" y="412" text-anchor="middle" class="t">internal_crm.*</text><text x="335" y="430" text-anchor="middle" class="s">modulo complementar</text>
    <rect x="490" y="385" width="190" height="60" rx="8" class="m"/><text x="585" y="412" text-anchor="middle" class="t">contract_*</text><text x="585" y="430" text-anchor="middle" class="s">contratos</text>
    <line x1="185" y1="65" x2="250" y2="65" class="l"/><line x1="110" y1="95" x2="110" y2="145" class="l"/><line x1="185" y1="175" x2="250" y2="175" class="l"/><line x1="185" y1="175" x2="455" y2="175" class="l"/><line x1="185" y1="175" x2="660" y2="175" class="l"/><line x1="110" y1="205" x2="110" y2="260" class="l"/><line x1="185" y1="290" x2="250" y2="290" class="l"/><line x1="185" y1="175" x2="545" y2="260" class="l"/><line x1="110" y1="95" x2="755" y2="260" class="l"/>
  </svg>`;
}

function principalReport() {
  const body = `${cover(data.titulo, 'Relatorio tecnico final para solicitacao de equivalencia/convalidacao de TCC')}
  <section class="page-break">
    <h2>Resumo</h2>
    ${p('Este relatorio tecnico apresenta o SolarZap, sistema web desenvolvido por Rodrigo Sena Fernandes durante o periodo de integralizacao do curso de Ciencia de Dados da UNIVESP, entre 10/01/2026 e 15/05/2026. O foco do projeto e o desenvolvimento de uma plataforma CRM com automacoes para gestao comercial no setor de energia solar.')}
    ${p('A analise tecnica foi realizada a partir do codigo-fonte do repositorio, do ambiente de producao publicado em dominio proprio e de evidencias visuais obtidas no endereco https://app.solarzap.com.br. O sistema contempla autenticacao, organizacao de leads e contatos, pipeline comercial, conversas/interacoes, calendario, tarefas, propostas comerciais, automacoes, dashboards e documentacao de arquitetura e modelagem.')}
    ${p('Modulos complementares, como integracoes externas, IA/agentes, billing, painel administrativo, feature flags, contratos e CRM interno, foram identificados no codigo e descritos de modo tecnico, com ressalva de que sua operacao pode depender de configuracao, credenciais, permissoes ou validacao no ambiente real.')}
    <h3>Palavras-chave</h3>
    ${p('CRM; energia solar; automacao comercial; desenvolvimento web; Supabase; React; TypeScript; modelagem de dados; Ciencia de Dados aplicada.')}

    <h2>Introducao</h2>
    ${p('Empresas do setor de energia solar lidam com processos comerciais compostos por captacao de leads, atendimento por canais digitais, qualificacao, reunioes, visitas, propostas tecnicas e acompanhamento ate a conversao. O SolarZap foi desenvolvido para organizar esse fluxo em uma aplicacao web centralizada, com apoio de automacoes e registros estruturados.')}
    ${p('A proposta tecnica do sistema esta relacionada a Computacao e Ciencia de Dados por envolver arquitetura de software, banco de dados relacional, integracao e uso de dados, automacao de processos, controle de acesso, validacao e documentacao tecnica.')}

    <h2>Objetivos</h2>
    <h3>Objetivo geral</h3>
    ${p('Desenvolver uma plataforma web/CRM com automacoes para apoiar a gestao comercial no setor de energia solar.')}
    <h3>Objetivos especificos</h3>
    ${ul([
      'Implementar autenticacao, multi-organizacao e controle de acesso.',
      'Organizar leads, contatos e interacoes comerciais em um CRM.',
      'Disponibilizar pipeline comercial com etapas do processo de venda solar.',
      'Registrar tarefas, calendario e acompanhamentos.',
      'Gerar e manter propostas comerciais com dados tecnicos e financeiros.',
      'Persistir automacoes comerciais e configuracoes por organizacao.',
      'Documentar arquitetura, requisitos, modelagem e evidencias de funcionamento.',
      'Evidenciar implantacao do sistema em ambiente web de producao.'
    ])}

    <h2>Ambiente de producao e evidencia de funcionamento</h2>
    ${p(`O SolarZap possui ambiente web publicado em dominio proprio, acessivel em <strong>${data.url}</strong>. A existencia da aplicacao publicada, com tela publica de login e acesso autenticado em conta de teste, constitui evidencia formal de implantacao/deploy do sistema.`)}
    ${p('A aplicacao respondeu no dominio de producao e apresentou a tela SolarZap. Tambem foi realizada captura autenticada em conta de teste fornecida pelo solicitante, sem exposicao de credenciais. Capturas internas com possiveis dados de contato ou valores foram redigidas quando necessario.')}
    ${imageFigure(images.login, 'Tela publica/login do SolarZap em producao, com URL verificada.')}

    <h2>Confidencialidade e protecao de dados</h2>
    ${p('Os documentos finais foram preparados sem anexar valores sensiveis de configuracao, credenciais operacionais ou dados reais de clientes. Quando prints internos continham telefones, valores ou informacoes comerciais, foram utilizadas versoes redigidas. O objetivo e comprovar a existencia e o funcionamento tecnico do sistema sem expor informacoes confidenciais.')}

    <h2>Escopo do sistema</h2>
    <h3>A) Nucleo principal do SolarZap</h3>
    ${table(['Funcionalidade central', 'Evidencia tecnica'], [
      ['Autenticacao', 'Rotas em <code>src/App.tsx</code>, contexto em <code>src/contexts/AuthContext.tsx</code>.'],
      ['Multi-organizacao e acesso', 'Tabelas <code>organizations</code> e <code>organization_members</code>, <code>ProtectedRoute</code> e politicas RLS.'],
      ['CRM de leads/contatos', '<code>src/hooks/domain/useLeads.ts</code>, <code>src/types/solarzap.ts</code>, telas de contatos.'],
      ['Pipeline comercial', '<code>src/hooks/domain/usePipeline.ts</code>, <code>PipelineStage</code> e tela de pipeline.'],
      ['Conversas/interacoes', '<code>src/hooks/domain/useChat.ts</code> e modelo de interacoes.'],
      ['Tarefas/calendario', 'Migration <code>20260128000001_calendar_module.sql</code>, hooks e tela de calendario.'],
      ['Propostas comerciais', '<code>useProposalForm.ts</code>, <code>solarSizing.ts</code>, <code>proposalFinancialModel.ts</code> e migrations de propostas.'],
      ['Automacoes comerciais', '<code>AutomationContext.tsx</code>, <code>AutomationsView.tsx</code> e <code>automation_settings</code>.'],
      ['Dashboards/indicadores', 'Componentes de dashboard, <code>reports-dashboard</code> e hooks de relatorio.'],
      ['Tracking/conversoes', 'Schema <code>tracking_v3</code>, <code>attribution-webhook</code> e <code>conversion-dispatcher</code>, dependente de configuracao externa.']
    ])}
    <h3>B) Modulos complementares ou administrativos</h3>
    ${p('Foram encontrados modulos adicionais no codigo. Eles ampliam o produto, mas nao sao tratados como nucleo obrigatorio da demonstracao de TCC sem evidencia especifica de ativacao em ambiente real. Sua operacao pode depender de credenciais, permissoes, planos, configuracoes externas ou validacao operacional.')}
    ${table(['Modulo', 'Classificacao defensavel'], [
      ['Integracoes Google, Meta, WhatsApp/Evolution, Stripe, e-mail e dados solares', 'Implementadas/evidenciadas no codigo; dependentes de configuracao externa para operacao.'],
      ['IA/agentes e base de conhecimento', 'Implementadas/evidenciadas no codigo; dependentes de provedores e configuracao.'],
      ['Billing/planos', 'Modulo complementar evidenciado por migrations, hooks e funcoes de pagamento.'],
      ['Admin e feature flags', 'Modulo administrativo evidenciado por rotas protegidas e Edge Function admin.'],
      ['Contratos', 'Modulo complementar com schemas, workspace e migrations proprias.'],
      ['CRM interno', 'Modulo complementar/administrativo no schema <code>internal_crm</code>.']
    ])}

    <h2>Metodologia de desenvolvimento</h2>
    ${p('O projeto apresenta caracteristicas de desenvolvimento incremental e modular. A evolucao do banco esta registrada por migrations datadas; o front-end e organizado por componentes e hooks; e o backend serverless esta separado em Edge Functions. Essa organizacao permite rastreabilidade tecnica, manutencao e extensao controlada do sistema.')}
    ${ul([
      'Aplicacao web com React, Vite e TypeScript.',
      'Backend Supabase com Auth, PostgreSQL, RLS, Storage e Edge Functions.',
      'Migrations para historico de schema, politicas e funcoes.',
      'Rotas protegidas, roles e escopo por organizacao.',
      'Testes unitarios, golden tests e E2E presentes no repositorio.',
      'Configuracao de deploy com Docker, docker-compose e Caddy.'
    ])}

    <h2>Arquitetura da solucao</h2>
    ${p('A arquitetura combina uma SPA React/TypeScript no navegador, Supabase como backend principal e Edge Functions para integracoes e processamento serverless. O deploy observado no repositorio usa artefatos como Dockerfile, docker-compose e Caddyfile, compativeis com publicacao web em dominio proprio.')}
    ${architectureSvg()}

    <h2>Tecnologias utilizadas</h2>
    ${table(['Categoria', 'Tecnologias identificadas'], [
      ['Front-end', 'React 18, Vite, TypeScript, React Router, TanStack Query.'],
      ['Interface', 'Tailwind CSS, shadcn/Radix UI, lucide-react, Recharts.'],
      ['Backend', 'Supabase Auth, PostgreSQL, RLS, Storage e Edge Functions.'],
      ['Validacao/Forms', 'Zod e React Hook Form.'],
      ['PDF/arquivos', 'jsPDF, jsPDF AutoTable e xlsx.'],
      ['Testes', 'Vitest, Testing Library e Playwright.'],
      ['Deploy', 'Docker, docker-compose e Caddy.']
    ])}

    <h2>Modelagem de dados</h2>
    ${p('A modelagem e orientada por organizacoes. Diversas tabelas usam <code>org_id</code> para isolamento de dados e politicas RLS. O nucleo envolve organizacoes, membros, leads, interacoes, agendamentos, tarefas, propostas, versoes de proposta, automacoes e eventos de tracking.')}
    ${erSvg()}

    <h2>Fluxos principais</h2>
    ${flowSvg()}
    ${table(['Fluxo', 'Descricao'], [
      ['Autenticacao e organizacao', 'Usuario acessa o sistema, autentica, seleciona organizacao e tem acesso filtrado por papel/status.'],
      ['Atendimento comercial', 'Lead e registrado, atendido por conversas/interacoes e acompanhado por responsavel.'],
      ['Pipeline', 'Oportunidades avancam por etapas comerciais ate proposta, negociacao, contrato, pagamento e instalacao.'],
      ['Proposta', 'Dados de consumo/projeto alimentam calculos e geracao de proposta comercial.'],
      ['Automacoes', 'Configuracoes por organizacao podem acionar mensagens, tarefas ou jobs conforme regras.'],
      ['Tracking', 'Eventos de origem e conversao sao registrados e podem ser enviados a plataformas externas quando configuradas.']
    ])}

    <h2>Testes, validacao e evidencias</h2>
    ${p('O repositorio contem configuracao de testes em <code>vitest.config.ts</code> e <code>playwright.config.ts</code>, alem de testes em <code>tests/unit</code>, <code>tests/golden</code> e <code>tests/e2e</code>. Nesta etapa documental, o comando de typecheck foi iniciado, mas nao concluido dentro do limite local de tempo. Build e suite de testes completa nao foram executados para evitar prolongar a preparacao documental e gerar artefatos adicionais desnecessarios. A producao publicada e as capturas visuais foram usadas como evidencias principais de funcionamento.')}

    <h2>Resultados obtidos</h2>
    ${p('O resultado e um sistema web funcional, publicado em ambiente de producao, com nucleo de CRM comercial para energia solar e base tecnica suficiente para documentacao academica. O projeto demonstra aplicacao de arquitetura web, banco relacional, controle de acesso, automacao, modelagem de dados e integracao de sistemas.')}

    <h2>Limitacoes tecnicas</h2>
    ${ul([
      'Integracoes externas dependem de configuracao, credenciais e autorizacoes especificas.',
      'Alguns modulos complementares estao documentados como evidenciados no codigo, nao necessariamente como demonstrados integralmente em producao.',
      'Dados internos foram omitidos ou redigidos para preservar confidencialidade.',
      'A execucao completa de build/testes pode ser anexada futuramente como evidencia complementar, se necessaria.'
    ])}

    <h2>Conclusao</h2>
    ${p('O SolarZap apresenta escopo e complexidade compativeis com uma entrega tecnica de TCC em Ciencia de Dados/Computacao. O sistema foi desenvolvido durante o periodo de integralizacao do curso e materializa um produto web aplicado ao setor de energia solar, com arquitetura, modelagem, automacoes e evidencias de implantacao. O conjunto documental final, acompanhado das evidencias de producao, pode subsidiar a solicitacao de equivalencia/convalidacao conforme regras institucionais aplicaveis.')}
  </section>`;
  return shell('Relatorio Tecnico TCC SolarZap Final', body);
}

function technicalDoc() {
  const body = `${cover('Documentacao tecnica complementar - SolarZap', 'Versao final para anexo academico')}
  <section class="page-break">
    <h2>Identificacao</h2>
    ${table(['Campo', 'Informacao'], [
      ['Aluno', data.nome],
      ['RA', data.ra],
      ['Curso', data.curso],
      ['Polo', data.polo],
      ['Sistema', data.sistema],
      ['Periodo de desenvolvimento', data.periodo],
      ['Ambiente de producao', data.url],
      ['Local e data', data.localData]
    ])}
    <h2>Visao geral</h2>
    ${p('O SolarZap e uma plataforma web/CRM voltada a gestao comercial no setor de energia solar. Seu nucleo operacional organiza contatos, leads, conversas, pipeline, calendario, propostas, automacoes e indicadores. O codigo tambem evidencia modulos complementares de integracao, IA, billing, admin, contratos e CRM interno.')}
    <h2>Stack tecnica real</h2>
    ${table(['Area', 'Tecnologias'], [
      ['Aplicacao web', 'React 18, Vite, TypeScript, React Router.'],
      ['Interface', 'Tailwind CSS, shadcn/Radix UI, lucide-react, Recharts.'],
      ['Dados/estado', 'TanStack Query, React Context, Supabase JS.'],
      ['Backend', 'Supabase Auth, PostgreSQL, RLS, Storage, Edge Functions.'],
      ['Validacao e documentos', 'Zod, React Hook Form, jsPDF, xlsx.'],
      ['Testes', 'Vitest, Testing Library, Playwright.'],
      ['Infra/deploy', 'Docker, docker-compose, Caddy.']
    ])}
    <h2>Estrutura de pastas</h2>
    ${table(['Caminho', 'Responsabilidade'], [
      ['<code>src/App.tsx</code>', 'Rotas, providers e lazy loading da aplicacao.'],
      ['<code>src/pages/</code>', 'Paginas de login, principal, admin, billing, pricing, onboarding e embed de contratos.'],
      ['<code>src/components/solarzap/</code>', 'Componentes do CRM principal.'],
      ['<code>src/hooks/</code>', 'Hooks de propostas, integracoes, billing, notificacoes, dashboards e tracking.'],
      ['<code>src/hooks/domain/</code>', 'Hooks de dominio para leads, pipeline e chat.'],
      ['<code>src/contexts/</code>', 'Autenticacao, automacoes, integracoes e tema.'],
      ['<code>src/modules/internal-crm/</code>', 'CRM interno administrativo.'],
      ['<code>src/modules/contracts/</code>', 'Modulo de contratos.'],
      ['<code>supabase/migrations/</code>', 'Evolucao do banco, RLS, RPCs e crons.'],
      ['<code>supabase/functions/</code>', 'Backend serverless e integracoes.'],
      ['<code>tests/</code>', 'Testes unitarios, golden e E2E.']
    ])}
    <h2>Rotas e modulos</h2>
    ${p('As rotas em <code>src/App.tsx</code> incluem login, selecao de organizacao, atualizacao de acesso, paginas legais, pricing, billing, embed de contratos, onboarding, area principal protegida e area administrativa. A navegacao do CRM inclui conversas, pipeline, calendario, contatos, disparos, propostas, dashboard, integracoes, tracking, automacoes, IA/agentes, equipe, plano e conta.')}
    <h2>Hooks e servicos</h2>
    ${table(['Hook/servico', 'Funcao tecnica'], [
      ['<code>useLeads</code>', 'CRUD, importacao, realtime e escopo de leads.'],
      ['<code>usePipeline</code>', 'Movimentacao de funil, propostas e eventos comerciais.'],
      ['<code>useChat</code>', 'Mensagens, midias, realtime e envio via provedor.'],
      ['<code>useIntegrations</code>', 'Conexao/desconexao e status de Google, Meta e WhatsApp.'],
      ['<code>useProposalForm</code>', 'Fluxo de proposta e calculos associados.'],
      ['<code>useAutomationSettings</code>', 'Regras de automacao e mensagens padronizadas.'],
      ['<code>useOrgBilling</code>', 'Status de plano e limites.'],
      ['<code>useAdminApi</code>', 'Operacoes administrativas.']
    ])}
    <h2>Edge Functions</h2>
    ${p('Foram identificadas funcoes serverless para admin, WhatsApp/Evolution, Google, Meta, tracking, propostas, billing, CRM interno, contratos, notificacoes, relatorios e recursos solares. Essas funcoes evidenciam separacao entre interface web e integracoes que dependem de credenciais ou processamento backend.')}
    <h2>Banco de dados e migrations</h2>
    ${p('O diretorio <code>supabase/migrations</code> registra a evolucao do schema. Foram encontradas migrations para organizacoes, RLS, calendario, dashboard, base de conhecimento, IA, propostas, tarefas, notificacoes, disparos, tracking, admin, billing, automacoes, onboarding, CRM interno e contratos.')}
    <h2>Seguranca</h2>
    ${ul([
      'Autenticacao via Supabase Auth.',
      'Controle de organizacao e papeis por <code>organization_members</code>.',
      'Rotas protegidas por <code>ProtectedRoute</code> e area admin por <code>AdminGuard</code>.',
      'Politicas RLS para isolamento de dados por organizacao.',
      'Uso de variaveis de ambiente e cofre/plataforma backend para configuracoes sensiveis, sem valores reproduzidos neste documento.',
      'Cabecalhos e regras de servidor observados no <code>Caddyfile</code>.'
    ])}
    <h2>Deploy</h2>
    ${p('O repositorio contem <code>Dockerfile</code>, <code>docker-compose.vps.yml</code> e <code>Caddyfile</code>, indicando mecanismo de build e publicacao web. O ambiente de producao verificado e <strong>https://app.solarzap.com.br</strong>.')}
    <h2>Evidencias de producao</h2>
    ${ul([
      `URL publica verificada: <strong>${data.url}</strong>.`,
      'Aplicacao publicada em dominio proprio com tela de login SolarZap.',
      'Acesso autenticado em conta de teste fornecida pelo solicitante.',
      'Capturas internas redigidas quando continham telefone, valor ou informacao operacional sensivel.'
    ])}
    ${imageFigure(images.auth, 'Area autenticada do SolarZap em producao, conta de teste.')}
    ${imageFigure(images.calendar, 'Modulo calendario em producao.')}
    <h2>Limitacoes tecnicas</h2>
    ${ul([
      'Integracoes externas dependem de configuracao e autorizacoes especificas.',
      'Alguns modulos complementares sao evidenciados no codigo, mas nao foram tratados como nucleo principal demonstrado.',
      'A suite completa de testes nao foi executada nesta etapa final por limite de tempo local.',
      'Dados internos foram redigidos quando necessario para preservar confidencialidade.'
    ])}
  </section>`;
  return shell('Documentacao Tecnica Complementar Final', body);
}

function reqArchDoc() {
  const body = `${cover('Requisitos, arquitetura e modelagem - SolarZap', 'Documento consolidado final')}
  <section class="page-break">
    <h2>Requisitos funcionais</h2>
    ${table(['Codigo', 'Requisito', 'Classificacao'], [
      ['RF01', 'Autenticar usuarios e manter sessao.', 'Nucleo central demonstrado/evidenciado.'],
      ['RF02', 'Selecionar organizacao e operar em ambiente multiempresa.', 'Nucleo central evidenciado.'],
      ['RF03', 'Controlar acesso por papel, status, onboarding e plano.', 'Nucleo central evidenciado.'],
      ['RF04', 'Cadastrar, listar, editar, importar e atribuir leads/contatos.', 'Nucleo central demonstrado/evidenciado.'],
      ['RF05', 'Exibir conversas e interacoes associadas a leads.', 'Nucleo central demonstrado/evidenciado.'],
      ['RF06', 'Movimentar leads em pipeline comercial.', 'Nucleo central demonstrado/evidenciado.'],
      ['RF07', 'Registrar tarefas, agenda, chamadas e visitas.', 'Nucleo central demonstrado/evidenciado.'],
      ['RF08', 'Criar propostas comerciais com dados tecnicos e financeiros.', 'Nucleo central evidenciado.'],
      ['RF09', 'Configurar automacoes comerciais por organizacao.', 'Nucleo central evidenciado.'],
      ['RF10', 'Exibir dashboards e indicadores comerciais.', 'Nucleo central demonstrado/evidenciado.'],
      ['RF11', 'Registrar tracking e conversoes.', 'Implementado/evidenciado; dependente de configuracao externa.'],
      ['RF12', 'Conectar integracoes Google, Meta, WhatsApp, pagamento, e-mail e IA.', 'Modulo complementar dependente de configuracao externa.'],
      ['RF13', 'Operar admin, feature flags, billing, contratos e CRM interno.', 'Modulo complementar/administrativo evidenciado no codigo.']
    ])}
    <h2>Requisitos nao funcionais</h2>
    ${table(['Codigo', 'Requisito'], [
      ['RNF01', 'Aplicacao web responsiva e acessivel por navegador.'],
      ['RNF02', 'Tipagem estatica com TypeScript.'],
      ['RNF03', 'Separacao modular por componentes, hooks, contextos e funcoes backend.'],
      ['RNF04', 'Isolamento de dados por organizacao com RLS.'],
      ['RNF05', 'Deploy reproduzivel por Docker/Caddy.'],
      ['RNF06', 'Testabilidade por Vitest e Playwright.'],
      ['RNF07', 'Configuracoes sensiveis fora da documentacao final.'],
      ['RNF08', 'Versionamento de schema por migrations.']
    ])}
    <h2>Atores</h2>
    ${table(['Ator', 'Papel'], [
      ['Lead/cliente', 'Origem de contato comercial.'],
      ['Vendedor/consultor', 'Atende leads, move pipeline e gera propostas.'],
      ['Administrador da organizacao', 'Configura equipe, automacoes, integracoes e plano.'],
      ['Administrador do sistema', 'Opera modulos administrativos e feature flags.'],
      ['Provedores externos', 'Fornecem mensageria, marketing, pagamento, e-mail e IA quando configurados.'],
      ['Workers/automacoes', 'Executam jobs, webhooks e rotinas de backend.']
    ])}
    <h2>Casos de uso principais</h2>
    ${table(['Caso de uso', 'Fluxo resumido', 'Criterio de aceite'], [
      ['Autenticar e acessar organizacao', 'Usuario entra no sistema, escolhe organizacao e acessa rota permitida.', 'Acesso liberado somente para usuario autorizado.'],
      ['Gerenciar lead/contato', 'Usuario consulta, cria ou edita dados comerciais de lead.', 'Registro persiste com escopo correto de organizacao.'],
      ['Atender por conversa', 'Usuario visualiza historico e envia/recebe interacoes quando integracao esta configurada.', 'Interacao fica associada ao lead correto.'],
      ['Mover pipeline', 'Usuario altera etapa comercial da oportunidade.', 'Status da etapa e atualizado e refletido na interface.'],
      ['Criar proposta', 'Usuario informa dados e gera versao/documento de proposta.', 'Proposta possui dados, versao e rastreabilidade.'],
      ['Configurar automacao', 'Admin ajusta mensagens/regras por organizacao.', 'Configuracao e carregada novamente e aplicada.'],
      ['Consultar dashboard', 'Usuario visualiza indicadores do periodo.', 'Indicadores aparecem conforme dados disponiveis.'],
      ['Registrar tracking', 'Evento e recebido e pode gerar entrega a plataformas externas.', 'Evento fica armazenado e entrega tem status rastreavel.']
    ])}
    <h2>Arquitetura geral</h2>
    ${architectureSvg()}
    <h2>Fluxo principal do sistema</h2>
    ${flowSvg()}
    <h2>Modelagem de dados simplificada</h2>
    ${erSvg()}
    <h2>Explicacao da modelagem</h2>
    ${p('A modelagem usa organizacoes como unidade principal de isolamento. Usuarios pertencem a organizacoes por meio de membros e papeis. Leads concentram o ciclo comercial e se relacionam com interacoes, compromissos, tarefas, propostas, atribuicoes e conversoes. Propostas possuem versoes e eventos de entrega. Automacoes e configuracoes sao persistidas por organizacao. Modulos complementares possuem schemas/tabelas proprias, como CRM interno e contratos.')}
    <h2>Fluxo de dados</h2>
    ${ul([
      'Usuario autenticado opera a SPA React.',
      'Hooks consultam e alteram dados pelo Supabase Client.',
      'RLS e org_id restringem o acesso ao escopo correto.',
      'Edge Functions processam integracoes externas e webhooks.',
      'Jobs agendados executam notificacoes, automacoes e conversoes.',
      'Dashboards e telas operacionais exibem dados consolidados.'
    ])}
  </section>`;
  return shell('Requisitos Arquitetura Modelagem Final', body);
}

function evidenceDoc() {
  const body = `${cover('Evidencias tecnicas e de producao - SolarZap', 'Documento final de comprovacao')}
  <section class="page-break">
    <h2>1. Identificacao</h2>
    ${table(['Campo', 'Informacao'], [
      ['Aluno', data.nome],
      ['RA', data.ra],
      ['Curso', data.curso],
      ['Polo', data.polo],
      ['Sistema', data.sistema],
      ['Periodo', data.periodo],
      ['Local/data', data.localData],
      ['URL de producao', data.url]
    ])}
    <h2>2. Evidencia de producao</h2>
    ${p('O sistema SolarZap esta publicado em ambiente web de producao no dominio proprio https://app.solarzap.com.br. A tela publica de login e a area autenticada em conta de teste foram acessadas para fins de comprovacao, sem registrar credenciais ou realizar alteracoes no sistema.')}
    ${imageFigure(images.login, 'Tela publica do SolarZap em producao.')}
    ${imageFigure(images.auth, 'Area autenticada do SolarZap em producao, conta de teste.')}
    <h2>3. Evidencias funcionais visuais</h2>
    ${p('As capturas abaixo demonstram modulos centrais do sistema. Quando havia telefone, valor ou dado operacional especifico, foi usada versao redigida.')}
    ${imageFigure(images.calendar, 'Calendario em producao: agenda e eventos.')}
    ${imageFigure(images.contacts, 'Contatos/leads em producao, com telefones omitidos.')}
    ${imageFigure(images.proposals, 'Modulo de propostas em producao, com valores e identificadores omitidos.')}
    ${imageFigure(images.dashboard, 'Dashboard em producao, com valores financeiros e nomes omitidos.')}
    <h2>4. Evidencias do repositorio</h2>
    ${table(['Evidencia', 'Conteudo verificado'], [
      ['Estrutura', '<code>src</code>, <code>supabase</code>, <code>tests</code>, <code>docs</code>, <code>public</code>, <code>scripts</code>.'],
      ['Dependencias', '<code>package.json</code> com React, Vite, TypeScript, Supabase, TanStack Query, Tailwind, Playwright e Vitest.'],
      ['Rotas', '<code>src/App.tsx</code> com login, area principal, billing, onboarding, admin e contratos.'],
      ['Banco', '<code>supabase/migrations</code> com migrations de calendario, organizacoes, RLS, propostas, automacoes, tracking, billing, CRM interno e contratos.'],
      ['Backend serverless', '<code>supabase/functions</code> com funcoes de admin, WhatsApp, Google, Meta, tracking, propostas, billing, IA e contratos.'],
      ['Deploy', '<code>Dockerfile</code>, <code>docker-compose.vps.yml</code> e <code>Caddyfile</code>.'],
      ['Historico Git', 'Commits recentes evidenciam manutencao de CRM interno, midia, automacoes e correcoes.']
    ])}
    <h3>Commits recentes observados</h3>
    ${ul([
      '<code>c5c840a feat(crm): isolate internal notifications transport with dedicated whatsapp instance</code>',
      '<code>c4fe948 fix(encoding): corrige mojibake UTF-8 em textos hardcoded</code>',
      '<code>a34c71b Reestrutura CRM interno ARKAN</code>',
      '<code>4c04431 fix internal crm appointment automations</code>',
      '<code>7803767 fix: enqueue internal crm media resolver</code>'
    ])}
    <h2>5. Evidencia de build/testes</h2>
    ${p('O ambiente de producao publicado e as capturas visuais foram tratados como evidencia principal. Como evidencia complementar, o repositorio possui scripts de build, typecheck e testes. Nesta etapa documental, o typecheck foi iniciado, mas nao terminou dentro do limite local de tempo; build e suite completa de testes nao foram executados para evitar prolongar a preparacao e gerar artefatos adicionais. Essa situacao nao foi tratada como falha do projeto.')}
    <h2>6. Observacao sobre evidencias internas</h2>
    ${p('Como o sistema lida com dados comerciais, contatos e interacoes, as evidencias internas foram selecionadas e, quando necessario, redigidas. A documentacao tecnica e o codigo-fonte complementam os prints para comprovar o funcionamento dos modulos sem expor informacoes confidenciais.')}
  </section>`;
  return shell('Evidencias Tecnicas e Producao Final', body);
}

function declarationDoc() {
  const body = `${cover('Declaracao de autoria e responsabilidade tecnica', 'Modelo final para assinatura')}
  <section class="page-break">
    ${p('Eu, <strong>Rodrigo Sena Fernandes</strong>, RA <strong>2211724</strong>, aluno do curso de <strong>Ciencia de Dados</strong> da <strong>UNIVESP</strong>, declaro, para fins de solicitacao de equivalencia/convalidacao de Trabalho de Conclusao de Curso, que <strong>desenvolvi o sistema denominado SolarZap</strong>, apresentado na documentacao tecnica anexa.')}
    ${p('Declaro que o sistema SolarZap foi desenvolvido no periodo de <strong>10/01/2026 a 15/05/2026</strong>, durante o periodo de integralizacao do curso, e que possui relacao direta com a area de Computacao/Ciencia de Dados por envolver desenvolvimento de software, modelagem de dados, controle de acesso, automacao de processos, integracao e uso de dados, validacao tecnica e resolucao de problema aplicado.')}
    ${p('Declaro tambem que os documentos apresentados correspondem ao projeto descrito, incluindo relatorio tecnico, documentacao complementar, requisitos, arquitetura, modelagem e evidencias de funcionamento em ambiente de producao.')}
    ${p('Por fim, declaro que dados sensiveis, dados de clientes, credenciais, chaves de acesso, informacoes comerciais sigilosas e demais conteudos confidenciais foram omitidos, redigidos ou anonimizados dos anexos apresentados.')}
    ${p('<strong>Local e data:</strong> Marilia/SP, 18 de junho de 2026.')}
    <div class="signature"><div class="line"></div><div>Rodrigo Sena Fernandes</div><div>RA 2211724</div></div>
  </section>`;
  return shell('Declaracao de Autoria Final', body);
}

function checklistDoc() {
  const body = `${cover('Checklist final de protocolo - UNIVESP', 'Controle final antes de anexar')}
  <section class="page-break">
    ${ul([
      'Conferir se os sete arquivos finais foram gerados.',
      'Assinar a declaracao de autoria.',
      'Confirmar que a URL de producao https://app.solarzap.com.br aparece nos documentos.',
      'Conferir nome completo, RA, curso, polo, periodo e local/data.',
      'Confirmar que nao restou campo de preenchimento em aberto.',
      'Revisar confidencialidade: nenhuma credencial, chave de acesso, dado real de cliente, telefone, e-mail privado ou valor comercial sensivel deve aparecer.',
      'Conferir se os prints redigidos continuam legiveis e suficientes.',
      'Conferir se os PDFs abrem corretamente antes de anexar.',
      'Anexar os PDFs no Portal do Aluno.',
      'Colar o texto do requerimento no campo apropriado.',
      'Verificar se o portal aceitou todos os anexos.',
      'Salvar o comprovante de protocolo.',
      'Guardar copia local do pacote final ZIP.'
    ])}
  </section>`;
  return shell('Checklist Final Protocolo', body);
}

function requestText() {
  return `Solicito a analise de equivalencia/convalidacao do Trabalho de Conclusao de Curso com base na apresentacao de documentacao tecnica de desenvolvimento de software acompanhada de relatorio tecnico, conforme previsto no regulamento de TCC da UNIVESP, especialmente no Art. 8º, conforme aplicavel.

O projeto apresentado, denominado SolarZap, foi desenvolvido por mim durante o periodo de integralizacao do curso de Ciencia de Dados, entre 10/01/2026 e 15/05/2026. Trata-se de uma plataforma web/CRM com automacoes para gestao comercial no setor de energia solar, disponivel em ambiente de producao no endereco https://app.solarzap.com.br.

O sistema contempla desenvolvimento de software, modelagem de dados, autenticacao e controle de acesso, organizacao de leads e contatos, pipeline comercial, registro de interacoes, propostas comerciais, automacoes, integracoes tecnicas, documentacao de arquitetura e evidencias de funcionamento.

O projeto possui relacao direta com a area de Computacao/Ciencia de Dados por envolver arquitetura de sistemas, banco de dados, automacao de processos, integracao e uso de dados, validacao tecnica e resolucao de problema aplicado.

Dessa forma, solicito que o conjunto documental anexado seja considerado para fins de equivalencia/convalidacao de TCC, ficando a disposicao para apresentar esclarecimentos adicionais, evidencias complementares ou demonstracao do sistema, caso necessario.
`;
}

const documents = [
  ['01_RELATORIO_TECNICO_TCC_SOLARZAP_FINAL', principalReport()],
  ['02_DOCUMENTACAO_TECNICA_COMPLEMENTAR_FINAL', technicalDoc()],
  ['03_REQUISITOS_ARQUITETURA_MODELAGEM_FINAL', reqArchDoc()],
  ['04_EVIDENCIAS_TECNICAS_E_PRODUCAO_FINAL', evidenceDoc()],
  ['05_DECLARACAO_DE_AUTORIA_FINAL', declarationDoc()],
  ['07_CHECKLIST_FINAL_PROTOCOLO', checklistDoc()],
];

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, '06_TEXTO_REQUERIMENTO_UNIVESP_FINAL.txt'), requestText(), 'utf8');

for (const [name, html] of documents) {
  await fs.writeFile(path.join(outDir, `${name}.html`), html, 'utf8');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
for (const [name] of documents) {
  const htmlPath = path.join(outDir, `${name}.html`);
  await page.goto(fileUrl(htmlPath), { waitUntil: 'networkidle' });
  await page.pdf({
    path: path.join(outDir, `${name}.pdf`),
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
  });
}
await browser.close();

console.log('final-docs-generated');
