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
    subtitle: "Acompanhe os principais números do período e as filas que precisam de resposta.",
    question: "Visão geral do comercial e do financeiro.",
  },
  {
    value: "sales",
    label: "Vendas",
    subtitle: "Acompanhe o funil, veja os canais com melhor resultado e identifique negociações paradas.",
    question: "Resumo comercial do período.",
  },
  {
    value: "financial",
    label: "Financeiro",
    subtitle: "Separe o que foi faturado, o que entrou, o que vai entrar e o que já atrasou.",
    question: "O que entrou, o que vai entrar e o que está atrasado?",
  },
  {
    value: "losses",
    label: "Perdas",
    subtitle: "Veja por que os negócios estão se perdendo e onde agir primeiro para recuperar conversão.",
    question: "Por que os negócios estão sendo perdidos e onde agir primeiro?",
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
