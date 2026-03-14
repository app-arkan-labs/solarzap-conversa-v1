import { Link } from 'react-router-dom';

const sections = [
  {
    title: '1. Coleta de dados',
    body:
      'Coletamos dados fornecidos por você e por suas equipes no uso do SolarZap, incluindo nome, telefone, e-mail, endereço e informações de interação com leads.',
  },
  {
    title: '2. Uso dos dados',
    body:
      'Os dados são usados para operação do CRM, atendimento comercial, automações, análise de desempenho e integrações com WhatsApp (Evolution API), Google Calendar, Google Ads, Meta Ads e GA4.',
  },
  {
    title: '3. Compartilhamento',
    body:
      'Compartilhamos dados apenas com operadores e provedores necessários para o funcionamento da plataforma, sempre com controles de acesso e finalidades legítimas.',
  },
  {
    title: '4. Segurança',
    body:
      'Adotamos medidas técnicas e administrativas para proteger os dados, incluindo controles de autenticação, segregação por organização e armazenamento seguro no Supabase.',
  },
  {
    title: '5. Cookies e identificadores',
    body:
      'Utilizamos cookies e identificadores técnicos para sessão, segurança e atribuição de origem de campanhas, respeitando configurações do navegador e requisitos legais aplicáveis.',
  },
  {
    title: '6. Direitos do titular (LGPD)',
    body:
      'Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade e eliminação de dados, quando aplicável, conforme a LGPD.',
  },
  {
    title: '7. Contato',
    body:
      'Para exercício de direitos e dúvidas sobre privacidade, entre em contato com Arkan Labs pelo e-mail aplicativos@arkanlabs.com.br.',
  },
  {
    title: '8. Vigência e atualizações',
    body:
      'Esta política entra em vigor na data de publicação e pode ser atualizada para refletir melhorias no produto, obrigações legais e novos serviços.',
  },
];

export default function PrivacyPolicy() {
  return (
    <main className="auth-shell min-h-screen px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-4xl space-y-8 rounded-3xl border border-border/70 bg-card/88 p-6 shadow-[0_28px_90px_-40px_rgba(15,23,42,0.28)] dark:shadow-[0_28px_90px_-40px_rgba(2,6,23,0.62)] backdrop-blur-xl sm:p-10">
        <header className="space-y-3 border-b pb-6">
          <p className="text-2xl font-semibold tracking-tight brand-gradient-text">SolarZap</p>
          <h1 className="text-3xl font-bold tracking-tight">Política de Privacidade</h1>
          <p className="text-sm text-muted-foreground">
            A SolarZap é um CRM para empresas de energia solar operado por Arkan Labs, em <strong>solarzap.com.br</strong>.
          </p>
          <p className="text-sm text-muted-foreground">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>
        </header>

        <section className="space-y-5">
          {sections.map((section) => (
            <article key={section.title} className="space-y-2">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{section.body}</p>
            </article>
          ))}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
          <p className="text-xs text-muted-foreground">Arkan Labs · aplicativos@arkanlabs.com.br</p>
          <Link to="/" className="text-sm font-medium text-primary hover:text-primary/80">
            Voltar ao app
          </Link>
        </footer>
      </div>
    </main>
  );
}
