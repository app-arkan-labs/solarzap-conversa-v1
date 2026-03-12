import type { ActiveTab } from '@/types/solarzap';

export type GuidedTourStep = {
  id: string;
  title: string;
  description: string;
  selector: string;
};

export const TOUR_TABS: ActiveTab[] = ['conversas', 'pipelines', 'calendario', 'disparos'];

export const TAB_WELCOME_COPY: Record<string, { title: string; description: string }> = {
  conversas: {
    title: 'Boas-vindas ao fluxo de Conversas',
    description: 'Aqui voce acompanha conversas em tempo real, abre detalhes do lead e executa acoes comerciais.',
  },
  pipelines: {
    title: 'Boas-vindas ao Pipeline',
    description: 'Use o quadro para mover leads entre etapas e acelerar o funil.',
  },
  calendario: {
    title: 'Boas-vindas ao Calendario',
    description: 'Centralize chamadas, visitas e compromissos da operacao.',
  },
  disparos: {
    title: 'Boas-vindas a Disparos',
    description: 'Crie campanhas de WhatsApp e acompanhe envio e performance.',
  },
};

export const TAB_TOUR_STEPS: Record<string, GuidedTourStep[]> = {
  conversas: [
    {
      id: 'conversas-lista',
      title: 'Lista de conversas',
      description: 'Selecione um lead para abrir historico e acompanhar a jornada.',
      selector: '[data-testid="conversation-row"]',
    },
    {
      id: 'conversas-detalhes',
      title: 'Painel de detalhes',
      description: 'Abra o painel lateral para editar dados, mudar etapa e registrar eventos.',
      selector: '[data-testid="chat-open-details"]',
    },
    {
      id: 'conversas-criar-lead',
      title: 'Novo lead rapido',
      description: 'Use este atalho para cadastrar um lead sem sair da tela.',
      selector: '[data-testid="open-create-lead-modal"]',
    },
  ],
  pipelines: [
    {
      id: 'pipelines-nav',
      title: 'Acesso ao Pipeline',
      description: 'A navegacao lateral permite alternar de Conversas para Pipeline em um clique.',
      selector: '[data-testid="nav-tab-pipelines"]',
    },
    {
      id: 'pipelines-board',
      title: 'Quadro de etapas',
      description: 'Arraste leads entre colunas para refletir o momento comercial.',
      selector: '[data-tour="tab-pipelines-root"]',
    },
    {
      id: 'pipelines-quick-create',
      title: 'Entrada de lead',
      description: 'Crie um lead novo e já coloque no funil.',
      selector: '[data-testid="open-create-lead-modal"]',
    },
  ],
  calendario: [
    {
      id: 'calendario-nav',
      title: 'Acesso ao Calendario',
      description: 'Navegue para o calendario para acompanhar agenda do time.',
      selector: '[data-testid="nav-tab-calendario"]',
    },
    {
      id: 'calendario-main',
      title: 'Visao da agenda',
      description: 'Veja eventos agendados e disponibilidade do dia.',
      selector: '[data-tour="tab-calendario-root"]',
    },
    {
      id: 'calendario-novo',
      title: 'Novo agendamento',
      description: 'Use o botao de novo agendamento para registrar reunioes e visitas.',
      selector: '[data-tour="tab-calendario-root"] button',
    },
  ],
  disparos: [
    {
      id: 'disparos-nav',
      title: 'Acesso a Disparos',
      description: 'Abra a aba de Disparos para iniciar campanhas em lote.',
      selector: '[data-testid="nav-tab-disparos"]',
    },
    {
      id: 'disparos-painel',
      title: 'Painel de campanhas',
      description: 'Aqui voce configura mensagem, publico e acompanha status de envio.',
      selector: '[data-tour="tab-disparos-root"]',
    },
  ],
};
