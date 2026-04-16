import type { LucideIcon } from 'lucide-react';
import {
  Bot,
  Building2,
  CalendarDays,
  CircuitBoard,
  DollarSign,
  FileText,
  Flag,
  Home,
  KanbanSquare,
  Megaphone,
  MessageSquare,
  Plug,
  ScrollText,
} from 'lucide-react';
import { matchPath } from 'react-router-dom';

export type AdminCrmNavItem = {
  to: string;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  patterns: string[];
};

export const adminCrmPrimaryItems: AdminCrmNavItem[] = [
  {
    to: '/admin/crm/dashboard',
    label: 'Dashboard',
    subtitle: 'Visao consolidada do comercial interno.',
    icon: Home,
    patterns: ['/admin/crm', '/admin/crm/dashboard'],
  },
  {
    to: '/admin/crm/pipeline',
    label: 'Pipeline',
    subtitle: 'Etapas, deals e negociacoes em andamento.',
    icon: KanbanSquare,
    patterns: ['/admin/crm/pipeline'],
  },
  {
    to: '/admin/crm/inbox',
    label: 'Inbox',
    subtitle: 'Conversas, atendimento e proximas acoes.',
    icon: MessageSquare,
    patterns: ['/admin/crm/inbox'],
  },
  {
    to: '/admin/crm/clients',
    label: 'Clientes',
    subtitle: 'Base comercial, relacionamento e historico.',
    icon: Building2,
    patterns: ['/admin/crm/clients'],
  },
  {
    to: '/admin/crm/contracts',
    label: 'Contratos',
    subtitle: 'Formalizacao, preview, PDF e sessao publica de embed.',
    icon: FileText,
    patterns: ['/admin/crm/contracts'],
  },
  {
    to: '/admin/crm/campaigns',
    label: 'Campanhas',
    subtitle: 'Disparos, audiencias e acompanhamento.',
    icon: Megaphone,
    patterns: ['/admin/crm/campaigns'],
  },
  {
    to: '/admin/crm/automations',
    label: 'Automacoes',
    subtitle: 'Regras operacionais e rotinas internas.',
    icon: CircuitBoard,
    patterns: ['/admin/crm/automations'],
  },
  {
    to: '/admin/crm/calendar',
    label: 'Calendario',
    subtitle: 'Compromissos, reunioes e agenda comercial.',
    icon: CalendarDays,
    patterns: ['/admin/crm/calendar'],
  },
  {
    to: '/admin/crm/integrations',
    label: 'Integracoes',
    subtitle: 'WhatsApp e canais usados pela operacao.',
    icon: Plug,
    patterns: ['/admin/crm/integrations'],
  },
  {
    to: '/admin/crm/ai',
    label: 'IA',
    subtitle: 'Prompts, fila de jobs e automacao inteligente.',
    icon: Bot,
    patterns: ['/admin/crm/ai'],
  },
  {
    to: '/admin/crm/finance',
    label: 'Financeiro',
    subtitle: 'Receita, assinatura e pendencias do CRM.',
    icon: DollarSign,
    patterns: ['/admin/crm/finance'],
  },
];

export const adminCrmSystemItems: AdminCrmNavItem[] = [
  {
    to: '/admin',
    label: 'Dashboard Sistema',
    subtitle: 'Metricas do ambiente administrativo.',
    icon: Home,
    patterns: ['/admin'],
  },
  {
    to: '/admin/orgs',
    label: 'Organizacoes',
    subtitle: 'Gestao de contas e tenants.',
    icon: Building2,
    patterns: ['/admin/orgs', '/admin/orgs/:id'],
  },
  {
    to: '/admin/financeiro',
    label: 'Financeiro SaaS',
    subtitle: 'Receita recorrente e saude do produto.',
    icon: DollarSign,
    patterns: ['/admin/financeiro'],
  },
  {
    to: '/admin/flags',
    label: 'Feature Flags',
    subtitle: 'Controles e liberacoes de modulo.',
    icon: Flag,
    patterns: ['/admin/flags'],
  },
  {
    to: '/admin/audit',
    label: 'Audit Log',
    subtitle: 'Historico operacional e trilha de auditoria.',
    icon: ScrollText,
    patterns: ['/admin/audit'],
  },
];

export function getAdminCrmRouteMeta(pathname: string): AdminCrmNavItem {
  const allItems = [...adminCrmPrimaryItems, ...adminCrmSystemItems];
  const matchedItem = allItems.find((item) =>
    item.patterns.some((pattern) => Boolean(matchPath({ path: pattern, end: true }, pathname))),
  );

  return matchedItem ?? adminCrmPrimaryItems[0];
}
