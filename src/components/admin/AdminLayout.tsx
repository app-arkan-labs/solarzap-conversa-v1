import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bot,
  CircuitBoard,
  Building2,
  CalendarDays,
  DollarSign,
  Flag,
  Home,
  KanbanSquare,
  LogOut,
  Megaphone,
  MessageSquare,
  Plug,
  ScrollText,
  Shield,
  Sun,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAdminGuardContext } from '@/components/admin/AdminGuard';
import { isInternalCrmApiError, useInternalCrmWhoAmI } from '@/modules/internal-crm/hooks/useInternalCrmApi';

type SidebarItem = {
  to: string;
  label: string;
  icon: typeof Home;
};

const crmSidebarItems: SidebarItem[] = [
  { to: '/admin/crm/dashboard', label: 'CRM Dashboard', icon: Home },
  { to: '/admin/crm/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/admin/crm/inbox', label: 'Inbox', icon: MessageSquare },
  { to: '/admin/crm/clients', label: 'Clientes', icon: Building2 },
  { to: '/admin/crm/campaigns', label: 'Campanhas', icon: Megaphone },
  { to: '/admin/crm/automations', label: 'Automacoes', icon: CircuitBoard },
  { to: '/admin/crm/calendar', label: 'Calendarios', icon: CalendarDays },
  { to: '/admin/crm/integrations', label: 'Integracoes', icon: Plug },
  { to: '/admin/crm/ai', label: 'IA', icon: Bot },
  { to: '/admin/crm/finance', label: 'Financeiro CRM', icon: DollarSign },
];

const systemSidebarItems: SidebarItem[] = [
  { to: '/admin', label: 'Dashboard Sistema', icon: Home },
  { to: '/admin/orgs', label: 'Organizacoes', icon: Building2 },
  { to: '/admin/financeiro', label: 'Financeiro SaaS', icon: DollarSign },
  { to: '/admin/flags', label: 'Feature Flags', icon: Flag },
  { to: '/admin/audit', label: 'Audit Log', icon: ScrollText },
];

function getRoleBadgeVariant(role: string | undefined): 'default' | 'secondary' | 'outline' {
  switch (role) {
    case 'super_admin':
      return 'default';
    case 'ops':
    case 'billing':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getRoleLabel(role: string | undefined): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'ops':
      return 'Operacoes';
    case 'support':
      return 'Suporte';
    case 'billing':
      return 'Financeiro';
    case 'read_only':
      return 'Leitura';
    default:
      return role ?? 'Desconhecido';
  }
}

function renderNavSection(title: string, items: SidebarItem[]) {
  return (
    <div className="space-y-1">
      <p className="px-3.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-sidebar-foreground/45">
        {title}
      </p>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'brand-gradient-bg text-white shadow-[0_18px_34px_-22px_hsl(var(--primary)/0.55)]'
                  : 'text-sidebar-foreground/68 hover:bg-sidebar-accent hover:text-sidebar-foreground',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        );
      })}
    </div>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { identity } = useAdminGuardContext();
  const crmIdentityQuery = useInternalCrmWhoAmI({ enabled: Boolean(identity?.user_id) });

  const crmAccessDenied =
    crmIdentityQuery.error &&
    isInternalCrmApiError(crmIdentityQuery.error) &&
    (crmIdentityQuery.error.code === 'not_crm_member' || crmIdentityQuery.error.code === 'insufficient_role');

  const hasCrmAccess =
    location.pathname.startsWith('/admin/crm') ||
    (!!crmIdentityQuery.data?.crm_role && crmIdentityQuery.data.crm_role !== 'none');

  return (
    <div className="app-shell-bg h-screen bg-background text-foreground overflow-hidden">
      <div className="grid h-full grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="relative hidden lg:flex lg:flex-col border-r border-sidebar-border/70 bg-[linear-gradient(180deg,hsl(var(--sidebar-background)),hsl(var(--sidebar-accent))_135%)] text-sidebar-foreground">
          <div className="px-5 py-5 border-b border-sidebar-border/80">
            <Link to="/admin" className="inline-flex items-center gap-2.5 group">
              <div className="brand-gradient-bg flex items-center justify-center w-9 h-9 rounded-lg shadow-[0_16px_30px_-16px_hsl(var(--primary)/0.45)] transition-shadow">
                <Sun className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="block text-base font-bold tracking-tight">SolarZap</span>
                <span className="block text-[10px] font-medium tracking-widest text-primary uppercase">Admin Panel</span>
              </div>
            </Link>
          </div>

          <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-5">
            {hasCrmAccess ? renderNavSection('CRM Interno', crmSidebarItems) : null}
            {crmAccessDenied ? (
              <div className="rounded-xl border border-dashed border-sidebar-border/80 px-3.5 py-3 text-xs text-sidebar-foreground/55">
                O CRM interno fica oculto para usuarios sem `crm_role`.
              </div>
            ) : null}
            {renderNavSection('Sistema', systemSidebarItems)}
          </nav>

          <div className="px-4 py-4 border-t border-sidebar-border/80">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary text-xs font-bold">
                <Shield className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">
                  {getRoleLabel(identity?.system_role)}
                </p>
                <p className="text-[10px] text-sidebar-foreground/60 truncate">
                  {identity?.user_id?.slice(0, 8) ?? ''}...
                </p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex flex-col overflow-hidden">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-card/82 backdrop-blur-md px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="brand-gradient-bg flex items-center justify-center w-8 h-8 rounded-lg">
                <Sun className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-foreground">SolarZap Admin</span>
            </div>

            <div className="hidden lg:flex items-center gap-2">
              <Badge variant={getRoleBadgeVariant(identity?.system_role)} className="text-xs">
                {getRoleLabel(identity?.system_role)}
              </Badge>
              {crmIdentityQuery.data?.crm_role && crmIdentityQuery.data.crm_role !== 'none' ? (
                <Badge variant="outline" className="text-xs">
                  CRM: {crmIdentityQuery.data.crm_role}
                </Badge>
              ) : null}
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  onClick={() => {
                    void (async () => {
                      await signOut();
                      navigate('/login', { replace: true });
                    })();
                  }}
                >
                  <LogOut className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Sair</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Encerrar sessao admin</TooltipContent>
            </Tooltip>
          </header>

          <div className="flex-1 min-h-0 flex flex-col p-5 lg:p-7 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
