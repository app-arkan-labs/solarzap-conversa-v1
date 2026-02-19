import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { type OrgRole } from '@/lib/orgAdminClient';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: OrgRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRoles }) => {
  const { user, loading, role } = useAuth();
  const { toast } = useToast();
  const hasShownAccessToastRef = useRef(false);

  const missingRequiredRole =
    !!requiredRoles &&
    requiredRoles.length > 0 &&
    (!role || !requiredRoles.includes(role as OrgRole));

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    if (missingRequiredRole && !hasShownAccessToastRef.current) {
      toast({
        title: 'Acesso restrito',
        description: 'Apenas owner/admin podem acessar esta pagina.',
        variant: 'destructive',
      });
      hasShownAccessToastRef.current = true;
      return;
    }

    if (!missingRequiredRole) {
      hasShownAccessToastRef.current = false;
    }
  }, [loading, user, missingRequiredRole, toast]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          <p className="text-green-700">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (missingRequiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
