import type { ActiveTab } from '@/types/solarzap';

export type GuidedTourStep = {
  id: string;
  tab: ActiveTab;
  title: string;
  content: string;
  target: string;
  fallbackSelector?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  waitForMs?: number;
  disableScroll?: boolean;
};

// V2 global tour steps - linear progression across tabs
export const GLOBAL_TOUR_STEPS: GuidedTourStep[] = [
  {
    id: 'conversas-intro',
    tab: 'conversas',
    title: 'Boas-vindas ao SolarZap!',
    content: 'Este é o seu Tour Guiado. Você pode reiniciar este passo a passo a qualquer momento clicando na nossa **Logo verde** lá no canto superior esquerdo! Aqui nesta tela, você acompanha todas as suas conversas em um único lugar.',
    target: '[data-testid="conversation-row"]',
    fallbackSelector: '[data-testid="conversation-empty-state"]', // Em caso de nao ter conversas
    placement: 'right',
  },
  {
    id: 'conversas-criar',
    tab: 'conversas',
    title: 'Novo lead rápido',
    content: 'Use este atalho para cadastrar um lead novo sem sair da tela e começar o atendimento.',
    target: '[data-testid="open-create-lead-modal"]',
    placement: 'top',
  },
  {
    id: 'pipelines-nav',
    tab: 'conversas', // It happens while still in conversas before navigating
    title: 'Acesse o Pipeline',
    content: 'A navegação principal fica aqui. Vamos para o Pipeline ver seu funil de vendas.',
    target: '[data-testid="nav-tab-pipelines"]',
    placement: 'right',
  },
  {
    id: 'pipelines-board',
    tab: 'pipelines',
    title: 'Quadro de Etapas',
    content: 'Arraste os leads entre as colunas para refletir o momento comercial. Isso aciona automações de reengajamento.',
    target: '[data-tour="tab-pipelines-root"]',
    placement: 'center',
  },
  {
    id: 'calendario-nav',
    tab: 'pipelines',
    title: 'Acesse a Agenda',
    content: 'Você pode acompanhar os compromissos clicando no Calendário.',
    target: '[data-testid="nav-tab-calendario"]',
    placement: 'right',
  },
  {
    id: 'calendario-main',
    tab: 'calendario',
    title: 'Visão da Agenda',
    content: 'Aqui ficam registrados todos os compromissos, agendamentos e visitas de sua equipe.',
    target: '[data-tour="tab-calendario-root"]',
    placement: 'center',
  },
  {
    id: 'disparos-nav',
    tab: 'calendario',
    title: 'Campanhas em Massa',
    content: 'E na aba de Disparos, você pode iniciar campanhas de reengajamento.',
    target: '[data-testid="nav-tab-disparos"]',
    placement: 'right',
  },
  {
    id: 'disparos-painel',
    tab: 'disparos',
    title: 'Painel de Campanhas',
    content: 'Selecione públicos, agende envios e recupere leads perdidos de forma automática.',
    target: '[data-tour="tab-disparos-root"]',
    placement: 'center',
  }
];

export const GUIDED_TOUR_VERSION = 'v2-global-01';
