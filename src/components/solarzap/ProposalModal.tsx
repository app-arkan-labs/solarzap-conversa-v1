import { Contact } from '@/types/solarzap';
import { ProposalWizardModal } from './proposal-wizard/ProposalWizardModal';
import type { ProposalData } from '@/hooks/useProposalForm';

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  onGenerate: (data: ProposalData) => Promise<{ proposalVersionId: string | null; proposal?: any } | void>;
}

export type { ProposalData };

export function ProposalModal(props: ProposalModalProps) {
  return <ProposalWizardModal {...props} />;
}
