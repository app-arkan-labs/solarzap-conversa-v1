import { Contact, Conversation, Message, CalendarEvent, DashboardMetrics } from '@/types/solarzap';

// Helper to create dates
const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const hoursAgo = (hours: number) => {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date;
};

const minutesAgo = (minutes: number) => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutes);
  return date;
};

const today = (hour: number, minute: number = 0) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date;
};

const tomorrow = (hour: number, minute: number = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(hour, minute, 0, 0);
  return date;
};

// Mock Contacts
export const mockContacts: Contact[] = [
  {
    id: '1',
    name: 'João Silva',
    company: 'Padaria Silva',
    phone: '(11) 98765-4321',
    email: 'joao@padariasilva.com.br',
    avatar: '👨‍💼',
    channel: 'whatsapp',
    pipelineStage: 'proposta_pronta',
    clientType: 'comercial',
    consumption: 850,
    projectValue: 45000,
    address: 'Rua das Flores, 123',
    city: 'São Paulo',
    state: 'SP',
    cpfCnpj: '12.345.678/0001-90',
    createdAt: daysAgo(15),
    lastContact: minutesAgo(30),
  },
  {
    id: '2',
    name: 'Maria Santos',
    company: 'Fazenda Boa Vista',
    phone: '(19) 99876-5432',
    email: 'maria@fazendaboavista.com.br',
    avatar: '👩‍🌾',
    channel: 'whatsapp',
    pipelineStage: 'visita_agendada',
    clientType: 'rural',
    consumption: 2100,
    projectValue: 125000,
    address: 'Estrada Municipal, Km 15',
    city: 'Campinas',
    state: 'SP',
    cpfCnpj: '98.765.432/0001-10',
    createdAt: daysAgo(10),
    lastContact: hoursAgo(3),
  },
  {
    id: '3',
    name: 'Carlos Oliveira',
    company: '',
    phone: '(21) 97654-3210',
    email: 'carlos.oliveira@gmail.com',
    avatar: '👨',
    channel: 'instagram',
    pipelineStage: 'novo_lead',
    clientType: 'residencial',
    consumption: 350,
    projectValue: 18000,
    address: 'Av. Atlântica, 456',
    city: 'Rio de Janeiro',
    state: 'RJ',
    createdAt: daysAgo(1),
    lastContact: hoursAgo(6),
  },
  {
    id: '4',
    name: 'Ana Paula Costa',
    company: 'Clínica Bem Estar',
    phone: '(31) 98888-7777',
    email: 'ana@clinicabemestar.com.br',
    avatar: '👩‍⚕️',
    channel: 'whatsapp',
    pipelineStage: 'proposta_negociacao',
    clientType: 'comercial',
    consumption: 1200,
    projectValue: 68000,
    address: 'Rua da Saúde, 789',
    city: 'Belo Horizonte',
    state: 'MG',
    cpfCnpj: '45.678.901/0001-23',
    createdAt: daysAgo(20),
    lastContact: daysAgo(1),
  },
  {
    id: '5',
    name: 'Roberto Ferreira',
    company: 'Auto Peças Ferreira',
    phone: '(41) 99999-8888',
    email: 'roberto@autopecasferreira.com.br',
    avatar: '👨‍🔧',
    channel: 'messenger',
    pipelineStage: 'chamada_agendada',
    clientType: 'comercial',
    consumption: 980,
    projectValue: 52000,
    address: 'Av. Industrial, 1000',
    city: 'Curitiba',
    state: 'PR',
    cpfCnpj: '78.901.234/0001-56',
    createdAt: daysAgo(5),
    lastContact: hoursAgo(12),
  },
  {
    id: '6',
    name: 'Fernanda Lima',
    company: '',
    phone: '(51) 97777-6666',
    email: 'fernanda.lima@hotmail.com',
    avatar: '👩',
    channel: 'whatsapp',
    pipelineStage: 'respondeu',
    clientType: 'residencial',
    consumption: 420,
    projectValue: 22000,
    address: 'Rua Garibaldi, 234',
    city: 'Porto Alegre',
    state: 'RS',
    createdAt: daysAgo(3),
    lastContact: hoursAgo(1),
  },
  {
    id: '7',
    name: 'Pedro Henrique',
    company: 'Restaurante Sabor & Arte',
    phone: '(71) 98765-1234',
    email: 'pedro@saborarte.com.br',
    avatar: '👨‍🍳',
    channel: 'email',
    pipelineStage: 'contrato_assinado',
    clientType: 'comercial',
    consumption: 1500,
    projectValue: 85000,
    address: 'Praça da Sé, 50',
    city: 'Salvador',
    state: 'BA',
    cpfCnpj: '23.456.789/0001-01',
    createdAt: daysAgo(45),
    lastContact: daysAgo(2),
  },
  {
    id: '8',
    name: 'Juliana Martins',
    company: 'Escritório JM Advocacia',
    phone: '(61) 99876-5432',
    email: 'juliana@jmadvocacia.com.br',
    avatar: '👩‍💼',
    channel: 'whatsapp',
    pipelineStage: 'financiamento',
    clientType: 'comercial',
    consumption: 680,
    projectValue: 38000,
    address: 'SCS Quadra 01, Bloco A',
    city: 'Brasília',
    state: 'DF',
    cpfCnpj: '56.789.012/0001-34',
    createdAt: daysAgo(30),
    lastContact: daysAgo(1),
  },
  {
    id: '9',
    name: 'Marcelo Souza',
    company: '',
    phone: '(85) 98888-9999',
    email: 'marcelo.souza@yahoo.com.br',
    avatar: '👨',
    channel: 'whatsapp',
    pipelineStage: 'aguardando_proposta',
    clientType: 'residencial',
    consumption: 550,
    projectValue: 28000,
    address: 'Av. Beira Mar, 1500',
    city: 'Fortaleza',
    state: 'CE',
    createdAt: daysAgo(7),
    lastContact: daysAgo(4), // Urgente!
  },
  {
    id: '10',
    name: 'Luciana Almeida',
    company: 'Pousada Sol Nascente',
    phone: '(27) 97654-3210',
    email: 'luciana@solnascente.com.br',
    avatar: '👩',
    channel: 'instagram',
    pipelineStage: 'projeto_instalado',
    clientType: 'comercial',
    consumption: 1800,
    projectValue: 105000,
    address: 'Praia de Itaparica, s/n',
    city: 'Vila Velha',
    state: 'ES',
    cpfCnpj: '89.012.345/0001-67',
    createdAt: daysAgo(90),
    lastContact: daysAgo(5),
  },
];

// Mock Messages for each conversation
const createMessages = (contactId: string, contactName: string): Message[] => {
  const messagesMap: Record<string, Message[]> = {
    '1': [
      {
        id: 'm1-1',
        contactId: '1',
        content: 'Olá! Vi o anúncio da empresa de vocês sobre energia solar. Tenho uma padaria e gasto muito com energia.',
        timestamp: daysAgo(15),
        isFromClient: true,
        isRead: true,
      },
      {
        id: 'm1-2',
        contactId: '1',
        content: 'Olá João! Obrigado pelo contato! Energia solar é perfeita para padarias, que têm alto consumo com fornos e refrigeração. Qual seu consumo médio mensal?',
        timestamp: daysAgo(15),
        isFromClient: false,
        isRead: true,
      },
      {
        id: 'm1-3',
        contactId: '1',
        content: 'Nossa conta fica em torno de R$ 1.200 por mês. Consumo uns 850 kWh.',
        timestamp: daysAgo(14),
        isFromClient: true,
        isRead: true,
      },
      {
        id: 'm1-4',
        contactId: '1',
        content: 'Excelente! Com esse consumo, você pode economizar até 95% na conta de luz. Vou preparar uma proposta personalizada para você!',
        timestamp: daysAgo(14),
        isFromClient: false,
        isRead: true,
      },
      {
        id: 'm1-5',
        contactId: '1',
        content: '🤖 Pipeline movida automaticamente para: Proposta Pronta',
        timestamp: daysAgo(2),
        isFromClient: false,
        isRead: true,
        isAutomation: true,
        automationNote: 'Proposta gerada pelo sistema',
      },
      {
        id: 'm1-6',
        contactId: '1',
        content: 'João, sua proposta está pronta! Vou enviar agora. O sistema ficou em R$ 45.000 com retorno do investimento em 3,5 anos.',
        timestamp: daysAgo(2),
        isFromClient: false,
        isRead: true,
      },
      {
        id: 'm1-7',
        contactId: '1',
        content: 'Recebi a proposta, muito interessante! Gostaria de saber se consigo fazer em 48x?',
        timestamp: minutesAgo(30),
        isFromClient: true,
        isRead: false,
      },
    ],
    '2': [
      {
        id: 'm2-1',
        contactId: '2',
        content: 'Boa tarde! Tenho uma fazenda e quero reduzir os custos com energia para irrigação.',
        timestamp: daysAgo(10),
        isFromClient: true,
        isRead: true,
      },
      {
        id: 'm2-2',
        contactId: '2',
        content: 'Boa tarde Maria! Fazendas têm excelente potencial para energia solar. Qual o consumo mensal da propriedade?',
        timestamp: daysAgo(10),
        isFromClient: false,
        isRead: true,
      },
      {
        id: 'm2-3',
        contactId: '2',
        content: 'Consumimos cerca de 2.100 kWh/mês, principalmente com bombeamento de água.',
        timestamp: daysAgo(9),
        isFromClient: true,
        isRead: true,
      },
      {
        id: 'm2-4',
        contactId: '2',
        content: 'Perfeito! Para esse volume, recomendo um sistema de aproximadamente 15 kWp. Posso agendar uma visita técnica para avaliar o local?',
        timestamp: daysAgo(8),
        isFromClient: false,
        isRead: true,
      },
      {
        id: 'm2-5',
        contactId: '2',
        content: 'Pode ser quinta-feira de manhã?',
        timestamp: hoursAgo(3),
        isFromClient: true,
        isRead: true,
      },
      {
        id: 'm2-6',
        contactId: '2',
        content: '🤖 Pipeline movida automaticamente para: Visita Agendada',
        timestamp: hoursAgo(2),
        isFromClient: false,
        isRead: true,
        isAutomation: true,
        automationNote: 'Visita agendada pelo vendedor',
      },
    ],
    '3': [
      {
        id: 'm3-1',
        contactId: '3',
        content: 'Oi, vi o perfil de vocês no Instagram. Quanto custa para colocar energia solar numa casa?',
        timestamp: daysAgo(1),
        isFromClient: true,
        isRead: true,
      },
      {
        id: 'm3-2',
        contactId: '3',
        content: 'Olá Carlos! O valor depende do seu consumo de energia. Você sabe quanto gasta por mês em kWh?',
        timestamp: hoursAgo(6),
        isFromClient: false,
        isRead: true,
      },
    ],
    '6': [
      {
        id: 'm6-1',
        contactId: '6',
        content: 'Olá! Moro em apartamento mas tenho interesse em energia solar. É possível?',
        timestamp: daysAgo(3),
        isFromClient: true,
        isRead: true,
      },
      {
        id: 'm6-2',
        contactId: '6',
        content: 'Oi Fernanda! Sim, é possível! Existem algumas opções: instalação na área comum do prédio (com aprovação do condomínio) ou fazendas solares compartilhadas.',
        timestamp: daysAgo(3),
        isFromClient: false,
        isRead: true,
      },
      {
        id: 'm6-3',
        contactId: '6',
        content: 'Interessante! Me conta mais sobre as fazendas solares.',
        timestamp: hoursAgo(1),
        isFromClient: true,
        isRead: false,
      },
    ],
  };

  return messagesMap[contactId] || [
    {
      id: `m${contactId}-default`,
      contactId,
      content: `Olá! Tenho interesse em energia solar.`,
      timestamp: daysAgo(5),
      isFromClient: true,
      isRead: true,
    },
  ];
};

// Generate Conversations from Contacts
export const mockConversations: Conversation[] = mockContacts.map(contact => {
  const messages = createMessages(contact.id, contact.name);
  const lastMessage = messages[messages.length - 1];
  const unreadCount = messages.filter(m => m.isFromClient && !m.isRead).length;
  
  const daysSinceContact = Math.floor((Date.now() - contact.lastContact.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    id: `conv-${contact.id}`,
    contact,
    messages,
    unreadCount,
    lastMessage,
    isUrgent: daysSinceContact >= 3,
    hasFollowupToday: contact.id === '5', // Roberto tem followup hoje
  };
});

// Mock Calendar Events
export const mockEvents: CalendarEvent[] = [
  {
    id: 'evt-1',
    contactId: '2',
    title: 'Visita Técnica - Fazenda Boa Vista',
    description: 'Avaliar local para instalação de 15 kWp',
    type: 'visita',
    startDate: tomorrow(9, 0),
    endDate: tomorrow(11, 0),
    isCompleted: false,
  },
  {
    id: 'evt-2',
    contactId: '5',
    title: 'Ligação - Auto Peças Ferreira',
    description: 'Apresentar proposta comercial',
    type: 'chamada',
    startDate: today(14, 0),
    endDate: today(14, 30),
    isCompleted: false,
  },
  {
    id: 'evt-3',
    contactId: '1',
    title: 'Follow-up - Padaria Silva',
    description: 'Acompanhar resposta sobre financiamento',
    type: 'followup',
    startDate: today(16, 0),
    endDate: today(16, 15),
    isCompleted: false,
  },
  {
    id: 'evt-4',
    contactId: '7',
    title: 'Instalação - Restaurante Sabor & Arte',
    description: 'Início da instalação do sistema 18 kWp',
    type: 'instalacao',
    startDate: tomorrow(7, 0),
    endDate: tomorrow(17, 0),
    isCompleted: false,
  },
  {
    id: 'evt-5',
    contactId: '4',
    title: 'Reunião - Clínica Bem Estar',
    description: 'Negociação final da proposta',
    type: 'reuniao',
    startDate: today(10, 0),
    endDate: today(11, 0),
    isCompleted: true,
  },
];

// Mock Dashboard Metrics
export const mockMetrics: DashboardMetrics = {
  leadsThisMonth: 247,
  leadsChange: 12.5,
  totalSales: 890000,
  salesChange: 8.3,
  conversionRate: 12.4,
  conversionChange: 2.1,
  avgCycleDays: 23,
  cycleChange: -3.2,
};

// Pipeline data organized by stage
export const getContactsByStage = () => {
  const byStage: Record<string, Contact[]> = {};
  
  mockContacts.forEach(contact => {
    if (!byStage[contact.pipelineStage]) {
      byStage[contact.pipelineStage] = [];
    }
    byStage[contact.pipelineStage].push(contact);
  });
  
  return byStage;
};

// Lead sources for dashboard
export const mockLeadSources = [
  { name: 'WhatsApp', value: 45, color: '#25D366' },
  { name: 'Instagram', value: 25, color: '#E4405F' },
  { name: 'Facebook', value: 15, color: '#1877F2' },
  { name: 'Indicação', value: 10, color: '#FFC107' },
  { name: 'Site', value: 5, color: '#6B7280' },
];

// Monthly performance for dashboard
export const mockMonthlyPerformance = [
  { month: 'Jul', leads: 180, vendas: 420000 },
  { month: 'Ago', leads: 210, vendas: 580000 },
  { month: 'Set', leads: 195, vendas: 510000 },
  { month: 'Out', leads: 230, vendas: 720000 },
  { month: 'Nov', leads: 220, vendas: 650000 },
  { month: 'Dez', leads: 247, vendas: 890000 },
];

// Sales funnel data
export const mockFunnelData = [
  { stage: 'Novos Leads', count: 247, value: 4940000 },
  { stage: 'Responderam', count: 185, value: 3700000 },
  { stage: 'Proposta Enviada', count: 92, value: 1840000 },
  { stage: 'Em Negociação', count: 45, value: 900000 },
  { stage: 'Fechados', count: 31, value: 890000 },
];

// Top sellers for dashboard
export const mockTopSellers = [
  { name: 'Ricardo Mendes', sales: 320000, deals: 8, avatar: '👨‍💼' },
  { name: 'Camila Torres', sales: 280000, deals: 7, avatar: '👩‍💼' },
  { name: 'Bruno Costa', sales: 190000, deals: 5, avatar: '👨' },
  { name: 'Patricia Lima', sales: 100000, deals: 3, avatar: '👩' },
];
