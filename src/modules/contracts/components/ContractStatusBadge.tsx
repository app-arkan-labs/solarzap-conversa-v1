import { Badge } from '@/components/ui/badge';
import { getContractStatusLabel } from '../lib/stateMachine';
import type { ContractStatus } from '../lib/domain';

const STATUS_CLASSNAME: Record<ContractStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border border-slate-200',
  review_ready: 'bg-amber-100 text-amber-800 border border-amber-200',
  preview_generated: 'bg-sky-100 text-sky-800 border border-sky-200',
  pdf_generated: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  sent_for_signature: 'bg-violet-100 text-violet-800 border border-violet-200',
  signed: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  cancelled: 'bg-rose-100 text-rose-800 border border-rose-200',
  expired: 'bg-orange-100 text-orange-800 border border-orange-200',
  failed: 'bg-rose-100 text-rose-800 border border-rose-200',
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  return (
    <Badge className={STATUS_CLASSNAME[status]}>
      {getContractStatusLabel(status)}
    </Badge>
  );
}
