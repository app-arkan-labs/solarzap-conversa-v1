import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  adminQueryKeys,
  isAdminApiError,
  useAdminMutation,
  useAdminSubscriptionPlans,
  type AdminCreateOrgWithUserResponse,
  type AdminUserOrgStatusResponse,
} from '@/hooks/useAdminApi';

type CreateOrgDialogProps = {
  initialEmail?: string;
  onCreated?: () => void;
};

type EmailCheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'not_found' }
  | { kind: 'exists_without_org' }
  | { kind: 'exists_with_org'; orgName: string | null };

export default function CreateOrgDialog({ initialEmail, onCreated }: CreateOrgDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail ?? '');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [plan, setPlan] = useState('none');
  const [startTrial, setStartTrial] = useState(false);
  const [checkState, setCheckState] = useState<EmailCheckState>({ kind: 'idle' });
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const plansQuery = useAdminSubscriptionPlans();
  const availablePlans = plansQuery.data?.plans ?? [];

  const checkMutation = useAdminMutation<AdminUserOrgStatusResponse>();
  const createMutation = useAdminMutation<AdminCreateOrgWithUserResponse>({
    invalidate: [['admin', 'orgs'], adminQueryKeys.systemMetrics()],
    onSuccess: async (data) => {
      setGeneratedPassword(data.temp_password || null);
      toast({
        title: 'Organização criada com sucesso',
        description: `${data.user_email} vinculado à nova organização`,
      });
      await onCreated?.();
    },
    onError: (error) => {
      toast({
        title: 'Falha ao criar organização',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!open) {
      setEmail(initialEmail ?? '');
      setPassword('');
      setOrgName('');
      setPlan('none');
      setStartTrial(false);
      setCheckState({ kind: 'idle' });
      setGeneratedPassword(null);
    }
  }, [open, initialEmail]);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const canSubmit =
    normalizedEmail.length > 0 &&
    checkState.kind !== 'exists_with_org' &&
    checkState.kind !== 'checking' &&
    !createMutation.isPending;

  const handleCheckEmail = async () => {
    if (!normalizedEmail) {
      setCheckState({ kind: 'idle' });
      return;
    }

    setCheckState({ kind: 'checking' });
    try {
      const result = await checkMutation.mutateAsync({
        action: 'check_user_org_status',
        email: normalizedEmail,
      });

      if (!result.exists) {
        setCheckState({ kind: 'not_found' });
        return;
      }

      if (result.has_org) {
        setCheckState({ kind: 'exists_with_org', orgName: result.org_name ?? null });
        return;
      }

      setCheckState({ kind: 'exists_without_org' });
    } catch (error) {
      setCheckState({ kind: 'idle' });
      toast({
        title: 'Falha ao validar email',
        description: isAdminApiError(error) ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  const handleCreate = () => {
    if (!canSubmit) return;

    createMutation.mutate({
      action: 'create_org_with_user',
      email: normalizedEmail,
      password: password.trim() || undefined,
      org_name: orgName.trim() || undefined,
      plan: plan === 'none' ? undefined : plan,
      start_trial: startTrial,
    });
  };

  const statusBadge = (() => {
    if (checkState.kind === 'checking') {
      return <Badge variant="outline">Validando...</Badge>;
    }
    if (checkState.kind === 'not_found') {
      return <Badge className="bg-amber-100 text-amber-800">Novo usuário será criado</Badge>;
    }
    if (checkState.kind === 'exists_without_org') {
      return <Badge className="bg-emerald-100 text-emerald-800">Usuário encontrado sem organização</Badge>;
    }
    if (checkState.kind === 'exists_with_org') {
      return <Badge variant="destructive">Usuário já possui organização</Badge>;
    }
    return null;
  })();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Criar Organização
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Criar organização e conta do cliente</DialogTitle>
          <DialogDescription>
            Use este fluxo para criar o usuário e a organização sem depender do onboarding.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-create-email">Email do usuário</Label>
            <Input
              id="admin-create-email"
              placeholder="cliente@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={handleCheckEmail}
            />
            {statusBadge}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-create-password">Senha (opcional)</Label>
            <Input
              id="admin-create-password"
              type="password"
              placeholder="Se vazio, será gerada senha temporária"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-create-org-name">Nome da organização (opcional)</Label>
            <Input
              id="admin-create-org-name"
              placeholder="Se vazio, usa o email para gerar o nome"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Plano inicial</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem plano definido</SelectItem>
                {availablePlans.map((item) => (
                  <SelectItem key={item.plan_key} value={item.plan_key}>
                    {item.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="admin-create-start-trial"
              checked={startTrial}
              onCheckedChange={(checked) => setStartTrial(checked === true)}
            />
            <Label htmlFor="admin-create-start-trial" className="font-normal">
              Iniciar trial de 7 dias automaticamente
            </Label>
          </div>

          {checkState.kind === 'exists_with_org' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Usuário já vinculado</AlertTitle>
              <AlertDescription>
                {checkState.orgName
                  ? `Este usuário já pertence à organização "${checkState.orgName}".`
                  : 'Este usuário já pertence a uma organização.'}
              </AlertDescription>
            </Alert>
          )}

          {generatedPassword && (
            <Alert>
              <AlertTitle>Senha temporária gerada</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Compartilhe com o cliente e peça para trocar no primeiro acesso.</p>
                <div className="flex gap-2">
                  <Input readOnly value={generatedPassword} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(generatedPassword);
                      toast({ title: 'Senha copiada' });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Fechar
          </Button>
          <Button onClick={handleCreate} disabled={!canSubmit}>
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Criando...
              </>
            ) : (
              'Criar conta + organização'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
