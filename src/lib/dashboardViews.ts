export type DashboardVisualization = "today" | "sales" | "financial" | "losses";

export const DASHBOARD_VIEW_QUERY_PARAM = "dashboardView";

export const DASHBOARD_VIEW_OPTIONS: Array<{
  value: DashboardVisualization;
  label: string;
  subtitle: string;
  question: string;
}> = [
  {
    value: "today",
    label: "Geral",
    subtitle: "Acompanhe os principais numeros do periodo e as filas que precisam de resposta.",
    question: "Visao geral do comercial e do financeiro.",
  },
  {
    value: "sales",
    label: "Vendas",
    subtitle: "Acompanhe o funil, veja os canais com melhor resultado e identifique negociacoes paradas.",
    question: "Resumo comercial do periodo.",
  },
  {
    value: "financial",
    label: "Financeiro",
    subtitle: "Separe o que foi faturado, o que entrou, o que vai entrar e o que ja atrasou.",
    question: "O que entrou, o que vai entrar e o que esta atrasado?",
  },
  {
    value: "losses",
    label: "Perdas",
    subtitle: "Veja por que os negocios estao se perdendo e onde agir primeiro para recuperar conversao.",
    question: "Por que os negocios estao sendo perdidos e onde agir primeiro?",
  },
];

const DASHBOARD_VIEW_SET = new Set<DashboardVisualization>(DASHBOARD_VIEW_OPTIONS.map((option) => option.value));

export const parseDashboardVisualization = (rawValue: string | null | undefined): DashboardVisualization => {
  if (!rawValue) return "today";

  const normalized = rawValue.trim().toLowerCase();
  if (DASHBOARD_VIEW_SET.has(normalized as DashboardVisualization)) {
    return normalized as DashboardVisualization;
  }

  return "today";
};

export const getDashboardViewMeta = (view: DashboardVisualization) =>
  DASHBOARD_VIEW_OPTIONS.find((option) => option.value === view) || DASHBOARD_VIEW_OPTIONS[0];
