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

const handleGlobalError = (error: Error) => {
  console.error('Global Query Error:', error);
  const errorMessage = error.message?.toLowerCase() || '';

  if (
    errorMessage.includes('jwt expired') ||
    errorMessage.includes('401') ||
    errorMessage.includes('authapierror') ||
    errorMessage.includes('invalid token')
  ) {
    console.warn('Authentication expired. Redirecting to login...');
    supabase.auth.signOut().then(() => {
      window.location.href = '/login';
    });
  }
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
  queryCache: new QueryCache({
    onError: handleGlobalError,
  }),
  mutationCache: new MutationCache({
    onError: handleGlobalError,
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
