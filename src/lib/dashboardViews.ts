export type DashboardVisualization = "summary" | "commercial" | "agenda" | "financial" | "losses";

export const DASHBOARD_VIEW_QUERY_PARAM = "dashboardView";

export const DASHBOARD_VIEW_OPTIONS: Array<{
  value: DashboardVisualization;
  label: string;
  subtitle: string;
}> = [
  {
    value: "summary",
    label: "Resumo",
    subtitle: "Entenda em segundos o resultado, as prioridades do dia e o que pede sua atencao agora.",
  },
  {
    value: "commercial",
    label: "Comercial",
    subtitle: "Veja onde o funil anda, onde trava e quais leads pedem destravamento comercial.",
  },
  {
    value: "agenda",
    label: "Agenda",
    subtitle: "Acompanhe a rotina do time, proximas acoes e compromissos que nao podem esfriar.",
  },
  {
    value: "financial",
    label: "Financeiro",
    subtitle: "Separe Projeto Pago, recebimentos, lucro realizado e vencimentos sem misturar conceitos.",
  },
  {
    value: "losses",
    label: "Perdas",
    subtitle: "Entenda por que os negocios estao sendo perdidos e onde atacar primeiro para recuperar conversao.",
  },
];

const DASHBOARD_VIEW_SET = new Set<DashboardVisualization>(DASHBOARD_VIEW_OPTIONS.map((option) => option.value));

export const parseDashboardVisualization = (rawValue: string | null | undefined): DashboardVisualization => {
  if (!rawValue) return "summary";

  const normalized = rawValue.trim().toLowerCase();
  if (DASHBOARD_VIEW_SET.has(normalized as DashboardVisualization)) {
    return normalized as DashboardVisualization;
  }

  return "summary";
};

export const getDashboardViewMeta = (view: DashboardVisualization) =>
  DASHBOARD_VIEW_OPTIONS.find((option) => option.value === view) || DASHBOARD_VIEW_OPTIONS[0];
