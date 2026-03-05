import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, Flag, Home, LogOut, Shield, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminGuardContext } from '@/components/admin/AdminGuard';

const sidebarItems = [
  { to: '/admin', label: 'Dashboard', icon: Home },
  { to: '/admin/orgs', label: 'Organizacoes', icon: Building2 },
  { to: '/admin/flags', label: 'Feature Flags', icon: Flag },
  { to: '/admin/audit', label: 'Audit Log', icon: Users },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { identity } = useAdminGuardContext();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r bg-white">
          <div className="p-4 border-b">
            <Link to="/admin" className="inline-flex items-center gap-2 font-semibold">
              <Shield className="h-5 w-5 text-emerald-600" />
              SolarZap Admin
            </Link>
          </div>
          <nav className="p-3 space-y-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/admin'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                    )
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">
          <header className="border-b bg-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="uppercase">
                {identity?.system_role ?? 'unknown'}
              </Badge>
              <span className="text-xs text-slate-500">{identity?.user_id ?? ''}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void (async () => {
                  await signOut();
                  navigate('/login', { replace: true });
                })();
              }}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </header>
          <div className="p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
