import { Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from '@/components/admin/AdminLayout';
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
import InternalCrmAiPage from '@/modules/internal-crm/pages/InternalCrmAiPage';
import InternalCrmFinancePage from '@/modules/internal-crm/pages/InternalCrmFinancePage';

export default function Admin() {
  return (
    <Routes>
      <Route path="mfa-setup" element={<MfaSetup />} />
      <Route path="mfa-verify" element={<MfaChallenge />} />

      <Route element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="orgs" element={<OrgsList />} />
        <Route path="orgs/:id" element={<OrgDetails />} />
        <Route path="financeiro" element={<FinancialPanel />} />
        <Route path="audit" element={<AuditLogViewer />} />
        <Route path="flags" element={<FeatureFlagsPanel />} />
        <Route path="crm" element={<Navigate to="/admin/crm/dashboard" replace />} />
        <Route path="crm/dashboard" element={<InternalCrmGuard><InternalCrmDashboardPage /></InternalCrmGuard>} />
        <Route path="crm/pipeline" element={<InternalCrmGuard><InternalCrmPipelinePage /></InternalCrmGuard>} />
        <Route path="crm/inbox" element={<InternalCrmGuard><InternalCrmInboxPage /></InternalCrmGuard>} />
        <Route path="crm/clients" element={<InternalCrmGuard><InternalCrmClientsPage /></InternalCrmGuard>} />
        <Route path="crm/campaigns" element={<InternalCrmGuard><InternalCrmCampaignsPage /></InternalCrmGuard>} />
        <Route path="crm/ai" element={<InternalCrmGuard><InternalCrmAiPage /></InternalCrmGuard>} />
        <Route path="crm/finance" element={<InternalCrmGuard><InternalCrmFinancePage /></InternalCrmGuard>} />
      </Route>

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
