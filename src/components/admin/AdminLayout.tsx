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
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        {/* ── Sidebar ── */}
        <aside className="relative bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white hidden lg:flex lg:flex-col">
          {/* Brand */}
          <div className="px-5 py-5 border-b border-white/10">
            <Link to="/admin" className="inline-flex items-center gap-2.5 group">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20 group-hover:shadow-amber-500/40 transition-shadow">
                <Sun className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="block text-base font-bold tracking-tight">SolarZap</span>
                <span className="block text-[10px] font-medium tracking-widest text-amber-400/80 uppercase">Admin Panel</span>
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
                        ? 'bg-white/15 text-white shadow-sm backdrop-blur-sm'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white',
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
          <div className="px-4 py-4 border-t border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
                <Shield className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-300 truncate">
                  {getRoleLabel(identity?.system_role)}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {identity?.user_id?.slice(0, 8) ?? ''}...
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="min-w-0 flex flex-col">
          {/* Top Header */}
          <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur-md px-5 py-3 flex items-center justify-between">
            {/* Mobile brand */}
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Sun className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-slate-900">SolarZap Admin</span>
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
                  className="text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
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
