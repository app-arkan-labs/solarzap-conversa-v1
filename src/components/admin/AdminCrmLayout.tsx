import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layers3, LogOut, Menu, Shield, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminGuardContext } from '@/components/admin/AdminGuard';
import { useInternalCrmGuardContext } from '@/components/admin/InternalCrmGuard';
import { adminCrmPrimaryItems, adminCrmSystemItems, getAdminCrmRouteMeta } from '@/components/admin/adminCrmNavigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

function getSystemRoleBadgeVariant(role: string | undefined): 'default' | 'secondary' | 'outline' {
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

function getSystemRoleLabel(role: string | undefined): string {
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
      return role ?? 'Admin';
  }
}

function getCrmRoleLabel(role: string | undefined): string {
  switch (role) {
    case 'owner':
      return 'CRM Owner';
    case 'ops':
      return 'CRM Ops';
    case 'sales':
      return 'CRM Sales';
    case 'viewer':
      return 'CRM Viewer';
    default:
      return role ? `CRM ${role}` : 'CRM';
  }
}

type AdminCrmNavButtonProps = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function AdminCrmNavButton(props: AdminCrmNavButtonProps) {
  const Icon = props.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={props.to}
          className={({ isActive }) =>
            cn(
              'group flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent transition-all duration-300',
              isActive
                ? 'brand-gradient-bg text-white shadow-[0_20px_42px_-22px_hsl(var(--primary)/0.58)] scale-[1.03]'
                : 'text-sidebar-foreground/58 hover:border-sidebar-border/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
            )
          }
          title={props.label}
          aria-label={props.label}
        >
          <Icon className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{props.label}</TooltipContent>
    </Tooltip>
  );
}

type SystemShortcutMenuProps = {
  onNavigate?: () => void;
};

function SystemShortcutMenu(props: SystemShortcutMenuProps) {
  return (
    <div className="space-y-1.5">
      {adminCrmSystemItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={props.onNavigate}
            end={item.to === '/admin'}
            className={({ isActive }) =>
              cn(
                'flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors',
                isActive ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/70 text-foreground',
              )
            }
          >
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.subtitle}</p>
            </div>
          </NavLink>
        );
      })}
    </div>
  );
}

export default function AdminCrmLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { identity: adminIdentity } = useAdminGuardContext();
  const { identity: crmIdentity } = useInternalCrmGuardContext();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const activeRoute = useMemo(() => getAdminCrmRouteMeta(location.pathname), [location.pathname]);
  const ActiveIcon = activeRoute.icon;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell-bg h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="flex h-full min-h-0 overflow-hidden">
        <aside className="relative hidden w-[84px] shrink-0 border-r border-sidebar-border/80 bg-[linear-gradient(180deg,hsl(var(--sidebar-background)),hsl(var(--sidebar-accent))_135%)] text-sidebar-foreground lg:flex lg:flex-col">
          <div className="flex justify-center px-3 pb-5 pt-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/admin/crm/dashboard"
                  className="brand-logo-disc flex h-12 w-12 items-center justify-center overflow-hidden transition-transform hover:scale-[1.02]"
                  aria-label="Abrir CRM interno"
                >
                  <img src="/logo.png" alt="SolarZap" className="brand-logo-image" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">SolarZap CRM Interno</TooltipContent>
            </Tooltip>
          </div>

          <nav className="flex flex-1 flex-col items-center gap-2 px-3">
            {adminCrmPrimaryItems.map((item) => (
              <AdminCrmNavButton key={item.to} to={item.to} label={item.label} icon={item.icon} />
            ))}
          </nav>

          <div className="flex flex-col items-center gap-2 px-3 pb-4 pt-4">
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="group flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent text-sidebar-foreground/58 transition-all duration-300 hover:border-sidebar-border/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                      aria-label="Abrir atalhos do sistema"
                    >
                      <Layers3 className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="right">Atalhos do sistema</TooltipContent>
              </Tooltip>
              <PopoverContent side="right" align="end" className="w-80 rounded-[24px] border-border/70 p-3">
                <div className="mb-3 rounded-2xl border border-border/60 bg-muted/40 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Painel Admin
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">Acesso rapido ao sistema principal</p>
                </div>
                <SystemShortcutMenu />
              </PopoverContent>
            </Popover>

            <div className="h-px w-10 bg-sidebar-border/80" />

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/70 text-sidebar-foreground shadow-[0_18px_38px_-30px_rgba(15,23,42,0.4)]">
                  <Shield className="h-4 w-4" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                {getSystemRoleLabel(adminIdentity?.system_role)} • {getCrmRoleLabel(crmIdentity?.crm_role)}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="group flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent text-sidebar-foreground/58 transition-all duration-300 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  aria-label="Encerrar sessao"
                >
                  <LogOut className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Encerrar sessao</TooltipContent>
            </Tooltip>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-40 border-b border-border/70 bg-card/78 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-2xl lg:hidden"
                  onClick={() => setIsMobileMenuOpen(true)}
                  aria-label="Abrir navegacao do CRM"
                >
                  <Menu className="h-4 w-4" />
                </Button>

                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary shadow-[0_18px_40px_-30px_hsl(var(--primary)/0.38)]">
                  <ActiveIcon className="h-5 w-5" />
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    SolarZap Admin • CRM Interno
                  </p>
                  <div className="flex min-w-0 items-center gap-2">
                    <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">{activeRoute.label}</h1>
                    <span className="hidden truncate text-xs text-muted-foreground md:inline">{activeRoute.subtitle}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant={getSystemRoleBadgeVariant(adminIdentity?.system_role)} className="hidden rounded-full px-3 py-1 text-xs md:inline-flex">
                  {getSystemRoleLabel(adminIdentity?.system_role)}
                </Badge>
                <Badge variant="outline" className="hidden rounded-full px-3 py-1 text-xs lg:inline-flex">
                  {getCrmRoleLabel(crmIdentity?.crm_role)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden rounded-full px-3 text-muted-foreground hover:text-foreground lg:inline-flex"
                  onClick={() => navigate('/admin')}
                >
                  <Sun className="mr-2 h-4 w-4" />
                  Sistema
                </Button>
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>

      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetContent side="left" className="w-[92vw] max-w-[360px] border-r border-border/70 px-0">
          <SheetHeader className="border-b border-border/70 px-5 pb-4 pt-6 text-left">
            <SheetTitle className="text-base font-semibold">CRM Interno</SheetTitle>
            <SheetDescription>Navegacao principal e atalhos do painel admin.</SheetDescription>
          </SheetHeader>

          <div className="flex h-full flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 py-5">
              <div className="mb-5 rounded-[24px] border border-border/70 bg-muted/35 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Area ativa
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <ActiveIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{activeRoute.label}</p>
                    <p className="text-xs text-muted-foreground">{activeRoute.subtitle}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  CRM
                </p>
                {adminCrmPrimaryItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors',
                          isActive ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/70 text-foreground',
                        )
                      }
                    >
                      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                      </div>
                    </NavLink>
                  );
                })}
              </div>

              <div className="mt-6 space-y-2">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Sistema
                </p>
                <SystemShortcutMenu onNavigate={() => setIsMobileMenuOpen(false)} />
              </div>
            </div>

            <div className="border-t border-border/70 px-4 py-4">
              <div className="mb-3 flex items-center justify-between rounded-2xl border border-border/70 bg-muted/35 px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-foreground">{getSystemRoleLabel(adminIdentity?.system_role)}</p>
                  <p className="text-[11px] text-muted-foreground">{getCrmRoleLabel(crmIdentity?.crm_role)}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Shield className="h-4 w-4" />
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full justify-center rounded-2xl"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  void handleSignOut();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Encerrar sessao
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
