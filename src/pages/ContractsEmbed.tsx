import { useSearchParams } from 'react-router-dom';
import { ContractsEmbedSurface } from '@/modules/contracts/components/ContractsEmbedSurface';

const ContractsEmbedPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  return <ContractsEmbedSurface token={token} />;
};

export default ContractsEmbedPage;
