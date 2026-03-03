import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AutomationProvider } from "@/contexts/AutomationContext";
import { GoogleIntegrationProvider } from "@/contexts/GoogleIntegrationContext";
import { IntegrationsProvider } from "@/contexts/IntegrationsContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import UpdatePassword from "./pages/UpdatePassword";
import NotFound from "./pages/NotFound";
import CallQrRedirect from "./pages/CallQrRedirect";
import { supabase } from "@/lib/supabase";
import { extractAuthErrorMetadata, shouldAttemptAuthRecovery } from "@/lib/authSessionGuard";

let authRecoveryInFlight: Promise<void> | null = null;

const recoverAuthSession = async (origin: string, error: unknown) => {
  if (authRecoveryInFlight) {
    await authRecoveryInFlight;
    return;
  }

  authRecoveryInFlight = (async () => {
    const metadata = extractAuthErrorMetadata(error);

    console.warn('[AuthGuard] Candidate auth failure detected', {
      origin,
      status: metadata.status,
      code: metadata.code,
      name: metadata.name,
      message: metadata.message,
    });

    const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('[AuthGuard] Failed to inspect current session', {
        origin,
        status: sessionError.status,
        code: sessionError.code,
        message: sessionError.message,
      });
      return;
    }

    if (!sessionResult.session) {
      await supabase.auth.signOut();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
      return;
    }

    const { data: refreshResult, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshResult.session) {
      console.error('[AuthGuard] Session refresh failed, forcing sign-out', {
        origin,
        status: refreshError?.status,
        code: refreshError?.code,
        message: refreshError?.message,
      });
      await supabase.auth.signOut();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
      return;
    }

    console.info('[AuthGuard] Session recovered without logout', {
      origin,
      expiresAt: refreshResult.session.expires_at,
    });
  })().finally(() => {
    authRecoveryInFlight = null;
  });

  await authRecoveryInFlight;
};

const handleGlobalError = (error: unknown, origin: string) => {
  console.error('Global Query Error:', { origin, error });
  if (!shouldAttemptAuthRecovery(error)) return;

  void recoverAuthSession(origin, error);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      handleGlobalError(error, `query:${query.queryHash}`);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      handleGlobalError(error, `mutation:${mutation.mutationId}`);
    },
  }),
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AutomationProvider>
        <GoogleIntegrationProvider>
          <IntegrationsProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/update-password" element={<UpdatePassword />} />
                  <Route path="/qr/call" element={<CallQrRedirect />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Index />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/members"
                    element={
                      <ProtectedRoute requiredRoles={['owner', 'admin']}>
                        <Index />
                      </ProtectedRoute>
                    }
                  />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </IntegrationsProvider>
        </GoogleIntegrationProvider>
      </AutomationProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
