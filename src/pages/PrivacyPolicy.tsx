import { Link } from 'react-router-dom';

const sections = [
  {
    title: '1. Coleta de dados',
    body:
      'Coletamos dados fornecidos por voce e por suas equipes no uso do SolarZap, incluindo nome, telefone, e-mail, endereco e informacoes de interacao com leads.',
  },
  {
    title: '2. Uso dos dados',
    body:
      'Os dados sao usados para operacao do CRM, atendimento comercial, automacoes, analise de desempenho e integracoes com WhatsApp (Evolution API), Google Calendar, Google Ads, Meta Ads e GA4.',
  },
  {
    title: '3. Compartilhamento',
    body:
      'Compartilhamos dados apenas com operadores e provedores necessarios para o funcionamento da plataforma, sempre com controles de acesso e finalidades legitimas.',
  },
  {
    title: '4. Seguranca',
    body:
      'Adotamos medidas tecnicas e administrativas para proteger os dados, incluindo controles de autenticacao, segregacao por organizacao e armazenamento seguro no Supabase.',
  },
  {
    title: '5. Cookies e identificadores',
    body:
      'Utilizamos cookies e identificadores tecnicos para sessao, seguranca e atribuicao de origem de campanhas, respeitando configuracoes do navegador e requisitos legais aplicaveis.',
  },
  {
    title: '6. Direitos do titular (LGPD)',
    body:
      'Voce pode solicitar confirmacao de tratamento, acesso, correcao, anonimização, portabilidade e eliminacao de dados, quando aplicavel, conforme a LGPD.',
  },
  {
    title: '7. Contato',
    body:
      'Para exercicio de direitos e duvidas sobre privacidade, entre em contato com Arkan Labs pelo e-mail aplicativos@arkanlabs.com.br.',
  },
  {
    title: '8. Vigencia e atualizacoes',
    body:
      'Esta politica entra em vigor na data de publicacao e pode ser atualizada para refletir melhorias no produto, obrigacoes legais e novos servicos.',
  },
];

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
      <div className="mx-auto w-full max-w-4xl space-y-8 rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
        <header className="space-y-3 border-b pb-6">
          <p className="text-2xl font-semibold tracking-tight">☀️ SolarZap</p>
          <h1 className="text-3xl font-bold tracking-tight">Politica de Privacidade</h1>
          <p className="text-sm text-slate-600">
            A SolarZap e um CRM para empresas de energia solar operado por Arkan Labs, em <strong>solarzap.com.br</strong>.
          </p>
          <p className="text-sm text-slate-600">Ultima atualizacao: {new Date().toLocaleDateString('pt-BR')}</p>
        </header>

        <section className="space-y-5">
          {sections.map((section) => (
            <article key={section.title} className="space-y-2">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="text-sm leading-6 text-slate-700">{section.body}</p>
            </article>
          ))}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
          <p className="text-xs text-slate-500">Arkan Labs · aplicativos@arkanlabs.com.br</p>
          <Link to="/" className="text-sm font-medium text-emerald-700 hover:text-emerald-600">
            Voltar ao app
          </Link>
        </footer>
      </div>
    </main>
  );
}
