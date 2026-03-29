import { useMemo, useState } from 'react';
import { InternalCrmDashboardView } from '@/modules/internal-crm/components/dashboard/InternalCrmDashboardView';

export default function InternalCrmDashboardPage() {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(todayIso);

  return (
    <InternalCrmDashboardView
      fromDate={fromDate}
      toDate={toDate}
      onFromDateChange={setFromDate}
      onToDateChange={setToDate}
    />
  );
}
