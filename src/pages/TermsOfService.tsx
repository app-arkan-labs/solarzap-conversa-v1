import { Link } from 'react-router-dom';

const sections = [
  {
    title: '1. Aceitação',
    body:
      'Ao acessar ou utilizar o SolarZap, você concorda com estes Termos de Uso e com a Política de Privacidade aplicável.',
  },
  {
    title: '2. Definições',
    body:
      'SolarZap é a plataforma de CRM para empresas de energia solar. Usuário é a pessoa autorizada pela organização contratante a operar a conta.',
  },
  {
    title: '3. Serviços',
    body:
      'O SolarZap oferece recursos de CRM, automações, registro de interações e integrações com WhatsApp, Google Calendar, Google Ads, Meta Ads e GA4.',
  },
  {
    title: '4. Responsabilidades do usuário',
    body:
      'O usuário deve manter credenciais seguras, respeitar a legislação vigente e inserir somente dados com base legal adequada para tratamento.',
  },
  {
    title: '5. Propriedade intelectual',
    body:
      'Código, marca, layout e conteúdos da plataforma pertencem a Arkan Labs, exceto materiais de terceiros usados sob licença.',
  },
  {
    title: '6. Limitação de responsabilidade',
    body:
      'A plataforma é fornecida conforme disponibilidade. A Arkan Labs não responde por indisponibilidades causadas por terceiros, provedores externos ou mau uso.',
  },
  {
    title: '7. Rescisão',
    body:
      'A Arkan Labs pode suspender ou encerrar acesso em caso de violação destes termos, fraude, risco de segurança ou exigência legal.',
  },
  {
    title: '8. Foro e legislação',
    body:
      'Este instrumento é regido pelas leis brasileiras. Fica eleito o foro competente no Brasil para resolver eventuais controvérsias.',
  },
  {
    title: '9. Contato',
    body:
      'Dúvidas contratuais e operacionais podem ser encaminhadas para aplicativos@arkanlabs.com.br.',
  },
];

export default function TermsOfService() {
  return (
    <main className="auth-shell min-h-screen px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-4xl space-y-8 rounded-3xl border border-border/70 bg-card/88 p-6 shadow-[0_28px_90px_-40px_rgba(15,23,42,0.28)] dark:shadow-[0_28px_90px_-40px_rgba(2,6,23,0.62)] backdrop-blur-xl sm:p-10">
        <header className="space-y-3 border-b pb-6">
          <p className="text-2xl font-semibold tracking-tight brand-gradient-text">SolarZap</p>
          <h1 className="text-3xl font-bold tracking-tight">Termos de Uso</h1>
          <p className="text-sm text-muted-foreground">Estes termos regulam o uso do SolarZap em solarzap.com.br.</p>
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
