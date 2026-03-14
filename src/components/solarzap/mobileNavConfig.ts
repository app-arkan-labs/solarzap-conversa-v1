import type { ActiveTab } from '@/types/solarzap';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  Bot,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Kanban,
  MessageCircle,
  Bell,
  Plug,
  Send,
  Settings,
  User,
  UserCog,
  Users,
  Zap,
} from 'lucide-react';

export interface SolarZapTabPermissions {
  ia_agentes: boolean;
  automacoes: boolean;
  integracoes: boolean;
  tracking: boolean;
  banco_ia: boolean;
  minha_conta: boolean;
  meu_plano: boolean;
}

export interface SolarZapNavContext {
  tabPermissions: SolarZapTabPermissions;
  isAdminUser: boolean;
  hasMultipleOrganizations: boolean;
}

export type SolarZapNavActionId = 'notifications' | 'settings' | 'admin_members' | 'switch_organization';

type VisibilityRule = (context: SolarZapNavContext) => boolean;

interface BaseNavItem {
  icon: LucideIcon;
  label: string;
  testId?: string;
  title?: string;
  isVisible?: VisibilityRule;
}

export interface SolarZapTabNavItem extends BaseNavItem {
  type: 'tab';
  id: ActiveTab;
}

export interface SolarZapActionNavItem extends BaseNavItem {
  type: 'action';
  id: SolarZapNavActionId;
}

export type SolarZapNavItem = SolarZapTabNavItem | SolarZapActionNavItem;

const canSeeIaAgentes = (context: SolarZapNavContext) => context.tabPermissions.ia_agentes;
const canSeeAutomacoes = (context: SolarZapNavContext) => context.tabPermissions.automacoes;
const canSeeIntegracoes = (context: SolarZapNavContext) => context.tabPermissions.integracoes;
const canSeeTracking = (context: SolarZapNavContext) => context.tabPermissions.tracking;
const canSeeBancoIa = (context: SolarZapNavContext) => context.tabPermissions.banco_ia;
const canSeeMinhaConta = (context: SolarZapNavContext) => context.tabPermissions.minha_conta;
const canSeeMeuPlano = (context: SolarZapNavContext) => context.tabPermissions.meu_plano;
const canSeeAdminMembers = (context: SolarZapNavContext) => context.isAdminUser;
const canSeeSwitchOrganization = (context: SolarZapNavContext) => context.hasMultipleOrganizations;

export const desktopPrimaryNavItems: SolarZapTabNavItem[] = [
  { type: 'tab', id: 'conversas', icon: MessageCircle, label: 'Conversas' },
  { type: 'tab', id: 'pipelines', icon: Kanban, label: 'Pipelines' },
  { type: 'tab', id: 'calendario', icon: Calendar, label: 'Calendario' },
  { type: 'tab', id: 'contatos', icon: Users, label: 'Contatos' },
  { type: 'tab', id: 'disparos', icon: Send, label: 'Disparos' },
  { type: 'tab', id: 'propostas', icon: FileText, label: 'Propostas' },
  { type: 'tab', id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
];

export const mobilePrimaryNavItems: SolarZapTabNavItem[] = [
  { type: 'tab', id: 'conversas', icon: MessageCircle, label: 'Conversas' },
  { type: 'tab', id: 'pipelines', icon: Kanban, label: 'Pipelines' },
  { type: 'tab', id: 'calendario', icon: Calendar, label: 'Calendario' },
];

export const mobileMoreMainItems: SolarZapNavItem[] = [
  { type: 'tab', id: 'contatos', icon: Users, label: 'Contatos' },
  { type: 'tab', id: 'disparos', icon: Send, label: 'Disparos' },
  { type: 'tab', id: 'propostas', icon: FileText, label: 'Propostas' },
  { type: 'tab', id: 'dashboard', icon: BarChart3, label: 'Dashboard' },
  { type: 'action', id: 'notifications', icon: Bell, label: 'Notificacoes' },
  { type: 'action', id: 'settings', icon: Settings, label: 'Configuracoes' },
];

export const desktopSettingsMainItems: SolarZapNavItem[] = [
  { type: 'action', id: 'admin_members', icon: UserCog, label: 'Gestao de Equipe', testId: 'nav-admin-members', isVisible: canSeeAdminMembers },
  { type: 'tab', id: 'ia_agentes', icon: Bot, label: 'Inteligencia Artificial', testId: 'nav-ia-agentes', title: 'Inteligencia Artificial', isVisible: canSeeIaAgentes },
  { type: 'tab', id: 'automacoes', icon: Zap, label: 'Automacoes', testId: 'nav-automacoes', title: 'Automacoes', isVisible: canSeeAutomacoes },
  { type: 'tab', id: 'tracking', icon: Activity, label: 'Tracking e Conversoes', testId: 'nav-tracking', title: 'Tracking e Conversoes', isVisible: canSeeTracking },
  { type: 'tab', id: 'integracoes', icon: Plug, label: 'Central de Integracoes', testId: 'nav-integracoes', title: 'Central de Integracoes', isVisible: canSeeIntegracoes },
  { type: 'tab', id: 'banco_ia', icon: Building2, label: 'Minha Empresa', isVisible: canSeeBancoIa },
];

export const desktopSettingsAccountItems: SolarZapNavItem[] = [
  { type: 'tab', id: 'meu_plano', icon: CreditCard, label: 'Meu Plano', testId: 'nav-menu-meu-plano', isVisible: canSeeMeuPlano },
  { type: 'tab', id: 'minha_conta', icon: User, label: 'Minha Conta', testId: 'nav-menu-minha-conta', isVisible: canSeeMinhaConta },
  { type: 'action', id: 'switch_organization', icon: ArrowRightLeft, label: 'Trocar Empresa', testId: 'nav-switch-org', isVisible: canSeeSwitchOrganization },
];

export const mobileSettingsItems: SolarZapNavItem[] = [
  { type: 'tab', id: 'ia_agentes', icon: Bot, label: 'Inteligencia Artificial', isVisible: canSeeIaAgentes },
  { type: 'tab', id: 'automacoes', icon: Zap, label: 'Automacoes', isVisible: canSeeAutomacoes },
  { type: 'tab', id: 'integracoes', icon: Plug, label: 'Central de Integracoes', isVisible: canSeeIntegracoes },
  { type: 'tab', id: 'tracking', icon: Activity, label: 'Tracking e Conversoes', isVisible: canSeeTracking },
  { type: 'tab', id: 'banco_ia', icon: Building2, label: 'Minha Empresa', isVisible: canSeeBancoIa },
  { type: 'tab', id: 'meu_plano', icon: CreditCard, label: 'Meu Plano', isVisible: canSeeMeuPlano },
  { type: 'tab', id: 'minha_conta', icon: User, label: 'Minha Conta', isVisible: canSeeMinhaConta },
  { type: 'action', id: 'admin_members', icon: UserCog, label: 'Gestao de Equipe', isVisible: canSeeAdminMembers },
  { type: 'action', id: 'switch_organization', icon: ArrowRightLeft, label: 'Trocar Empresa', isVisible: canSeeSwitchOrganization },
];

const MOBILE_PRIMARY_TAB_SET = new Set<ActiveTab>(mobilePrimaryNavItems.map((item) => item.id));

export function getVisibleNavItems<T extends SolarZapNavItem>(items: T[], context: SolarZapNavContext): T[] {
  return items.filter((item) => (item.isVisible ? item.isVisible(context) : true));
}

export function isMobileMoreTabActive(activeTab: ActiveTab): boolean {
  return !MOBILE_PRIMARY_TAB_SET.has(activeTab);
}