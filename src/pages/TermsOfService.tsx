import { Link } from 'react-router-dom';

const sections = [
  {
    title: '1. Aceitacao',
    body:
      'Ao acessar ou utilizar o SolarZap, voce concorda com estes Termos de Uso e com a Politica de Privacidade aplicavel.',
  },
  {
    title: '2. Definicoes',
    body:
      'SolarZap e a plataforma de CRM para empresas de energia solar. Usuario e a pessoa autorizada pela organizacao contratante a operar a conta.',
  },
  {
    title: '3. Servicos',
    body:
      'O SolarZap oferece recursos de CRM, automacoes, registro de interacoes e integracoes com WhatsApp, Google Calendar, Google Ads, Meta Ads e GA4.',
  },
  {
    title: '4. Responsabilidades do usuario',
    body:
      'O usuario deve manter credenciais seguras, respeitar a legislacao vigente e inserir somente dados com base legal adequada para tratamento.',
  },
  {
    title: '5. Propriedade intelectual',
    body:
      'Codigo, marca, layout e conteudos da plataforma pertencem a Arkan Labs, exceto materiais de terceiros usados sob licenca.',
  },
  {
    title: '6. Limitacao de responsabilidade',
    body:
      'A plataforma e fornecida conforme disponibilidade. A Arkan Labs nao responde por indisponibilidades causadas por terceiros, provedores externos ou mau uso.',
  },
  {
    title: '7. Rescisao',
    body:
      'A Arkan Labs pode suspender ou encerrar acesso em caso de violacao destes termos, fraude, risco de seguranca ou exigencia legal.',
  },
  {
    title: '8. Foro e legislacao',
    body:
      'Este instrumento e regido pelas leis brasileiras. Fica eleito o foro competente no Brasil para resolver eventuais controversias.',
  },
  {
    title: '9. Contato',
    body:
      'Duvidas contratuais e operacionais podem ser encaminhadas para aplicativos@arkanlabs.com.br.',
  },
];

export default function TermsOfService() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
      <div className="mx-auto w-full max-w-4xl space-y-8 rounded-2xl border bg-white p-6 shadow-sm sm:p-10">
        <header className="space-y-3 border-b pb-6">
          <p className="text-2xl font-semibold tracking-tight">☀️ SolarZap</p>
          <h1 className="text-3xl font-bold tracking-tight">Termos de Uso</h1>
          <p className="text-sm text-slate-600">Estes termos regulam o uso do SolarZap em solarzap.com.br.</p>
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
