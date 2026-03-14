import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, DollarSign, Flag, Home, LogOut, ScrollText, Shield, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAdminGuardContext } from '@/components/admin/AdminGuard';

const sidebarItems = [
  { to: '/admin', label: 'Dashboard', icon: Home },
  { to: '/admin/orgs', label: 'Organizações', icon: Building2 },
  { to: '/admin/financeiro', label: 'Financeiro', icon: DollarSign },
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
    case 'super_admin': return 'Super Admin';
    case 'ops': return 'Operações';
    case 'support': return 'Suporte';
    case 'billing': return 'Financeiro';
    case 'read_only': return 'Leitura';
    default: return role ?? 'Desconhecido';
  }
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { identity } = useAdminGuardContext();

  return (
    <div className="app-shell-bg min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        {/* ── Sidebar ── */}
        <aside className="relative hidden lg:flex lg:flex-col border-r border-sidebar-border/70 bg-[linear-gradient(180deg,hsl(var(--sidebar-background)),hsl(var(--sidebar-accent))_135%)] text-sidebar-foreground">
          {/* Brand */}
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

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {sidebarItems.map((item) => {
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
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* Footer - Admin info */}
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

        {/* ── Main Content ── */}
        <main className="min-w-0 flex flex-col">
          {/* Top Header */}
          <header className="sticky top-0 z-30 border-b border-border/70 bg-card/82 backdrop-blur-md px-5 py-3 flex items-center justify-between">
            {/* Mobile brand */}
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
              <TooltipContent>Encerrar sessão admin</TooltipContent>
            </Tooltip>
          </header>

          {/* Page Content */}
          <div className="flex-1 p-5 lg:p-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
