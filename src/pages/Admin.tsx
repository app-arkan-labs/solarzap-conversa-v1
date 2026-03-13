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
      </Route>

      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
