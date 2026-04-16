import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminCrmLayout from '@/components/admin/AdminCrmLayout';
import AdminDashboard from '@/components/admin/AdminDashboard';
import OrgsList from '@/components/admin/OrgsList';
import OrgDetails from '@/components/admin/OrgDetails';
import AuditLogViewer from '@/components/admin/AuditLogViewer';
import FeatureFlagsPanel from '@/components/admin/FeatureFlagsPanel';
import FinancialPanel from '@/components/admin/FinancialPanel';
import MfaSetup from '@/components/admin/MfaSetup';
import MfaChallenge from '@/components/admin/MfaChallenge';
import { InternalCrmGuard } from '@/components/admin/InternalCrmGuard';
import InternalCrmDashboardPage from '@/modules/internal-crm/pages/InternalCrmDashboardPage';
import InternalCrmPipelinePage from '@/modules/internal-crm/pages/InternalCrmPipelinePage';
import InternalCrmInboxPage from '@/modules/internal-crm/pages/InternalCrmInboxPage';
import InternalCrmClientsPage from '@/modules/internal-crm/pages/InternalCrmClientsPage';
import InternalCrmCampaignsPage from '@/modules/internal-crm/pages/InternalCrmCampaignsPage';
import InternalCrmAutomationsPage from '@/modules/internal-crm/pages/InternalCrmAutomationsPage';
import InternalCrmAiPage from '@/modules/internal-crm/pages/InternalCrmAiPage';
import InternalCrmFinancePage from '@/modules/internal-crm/pages/InternalCrmFinancePage';
import InternalCrmCalendarPage from '@/modules/internal-crm/pages/InternalCrmCalendarPage';
import InternalCrmIntegrationsPage from '@/modules/internal-crm/pages/InternalCrmIntegrationsPage';
import { InternalCrmPageLayout } from '@/modules/internal-crm/components/InternalCrmPageLayout';
import { ContractsWorkspace } from '@/modules/contracts/components/ContractsWorkspace';

export default function Admin() {
  return (
    <Routes>
      <Route path="mfa-setup" element={<MfaSetup />} />
      <Route path="mfa-verify" element={<MfaChallenge />} />

      <Route element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="orgs" element={<OrgsList />} />
        <Route path="orgs/:id" element={<OrgDetails />} />
        <Route path="contracts" element={<Navigate to="/admin/crm/contracts" replace />} />
        <Route path="financeiro" element={<FinancialPanel />} />
        <Route path="audit" element={<AuditLogViewer />} />
        <Route path="flags" element={<FeatureFlagsPanel />} />
      </Route>

      <Route
        path="crm"
        element={
          <InternalCrmGuard>
            <AdminCrmLayout />
          </InternalCrmGuard>
        }
      >
        <Route index element={<Navigate to="/admin/crm/dashboard" replace />} />
        <Route
          path="dashboard"
          element={
            <InternalCrmPageLayout>
              <InternalCrmDashboardPage />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="pipeline"
          element={
            <InternalCrmPageLayout
              mode="immersive"
              className="max-w-none px-0 py-0 sm:px-0 sm:py-0 lg:px-0 lg:py-0"
            >
              <InternalCrmPipelinePage />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="inbox"
          element={
            <InternalCrmPageLayout mode="immersive">
              <InternalCrmInboxPage />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="clients"
          element={
            <InternalCrmPageLayout mode="immersive">
              <InternalCrmClientsPage />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="contracts"
          element={
            <InternalCrmPageLayout>
              <ContractsWorkspace mode="crm_admin" />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="campaigns"
          element={
            <InternalCrmPageLayout>
              <InternalCrmCampaignsPage />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="automations"
          element={
            <InternalCrmPageLayout>
              <InternalCrmAutomationsPage />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="calendar"
          element={
            <InternalCrmPageLayout mode="immersive">
              <InternalCrmCalendarPage />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="integrations"
          element={
            <InternalCrmPageLayout>
              <InternalCrmIntegrationsPage />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="ai"
          element={
            <InternalCrmPageLayout>
              <InternalCrmAiPage />
            </InternalCrmPageLayout>
          }
        />
        <Route
          path="finance"
          element={
            <InternalCrmPageLayout>
              <InternalCrmFinancePage />
            </InternalCrmPageLayout>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
