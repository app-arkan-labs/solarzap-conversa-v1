import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Loader2, Zap, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { createPackCheckoutSession } from '@/hooks/useOrgBilling';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

type AddonRow = {
  addon_key: string;
  display_name: string;
  price_cents: number;
  credit_amount: number;
};

export type PackType = 'disparo' | 'ai';

interface PackPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packType: PackType;
}

const PACK_KEYS: Record<PackType, string[]> = {
  disparo: ['disparo_pack_1k', 'disparo_pack_5k', 'disparo_pack_25k'],
  ai: ['ai_pack_1k', 'ai_pack_5k', 'ai_pack_20k'],
};

const PACK_CONFIG: Record<PackType, { title: string; description: string; icon: typeof Zap; unit: string; gradient: string }> = {
  disparo: {
    title: 'Packs de Disparo',
    description: 'Amplie seu volume de envios mensais comprando créditos extras.',
    icon: Zap,
    unit: 'créditos',
    gradient: 'from-orange-500 to-amber-600',
  },
  ai: {
    title: 'Packs de IA',
    description: 'Aumente o volume de requisições de IA para automações e assistente.',
    icon: Brain,
    unit: 'requisições',
    gradient: 'from-violet-500 to-purple-600',
  },
};

function formatCurrency(cents: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(cents || 0) / 100);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function PackPurchaseModal({ open, onOpenChange, packType }: PackPurchaseModalProps) {
  const { toast } = useToast();
  const { orgId } = useAuth();
  const [packs, setPacks] = useState<AddonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPack, setBusyPack] = useState<string | null>(null);

  const config = PACK_CONFIG[packType];
  const Icon = config.icon;

  useEffect(() => {
    if (!open) return;
    let isMounted = true;
    setLoading(true);

    void (async () => {
      const { data } = await supabase
        .from('_admin_addon_catalog')
        .select('addon_key, display_name, price_cents, credit_amount')
        .eq('is_active', true)
        .in('addon_key', PACK_KEYS[packType])
        .order('price_cents', { ascending: true });

      if (!isMounted) return;
      setPacks(
        (data || []).map((row) => ({
          addon_key: String(row.addon_key),
          display_name: String(row.display_name || row.addon_key),
          price_cents: Number(row.price_cents || 0),
          credit_amount: Number(row.credit_amount || 0),
        })),
      );
      setLoading(false);
    })();

    return () => { isMounted = false; };
  }, [open, packType]);

  const handleBuyPack = async (addonKey: string) => {
    try {
      setBusyPack(addonKey);
      const url = await createPackCheckoutSession(addonKey, 1, orgId);
      window.location.href = url;
    } catch (error) {
      toast({
        title: 'Falha ao abrir compra de pacote',
        description: error instanceof Error ? error.message : 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setBusyPack(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${config.gradient} shadow-lg`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle>{config.title}</DialogTitle>
              <DialogDescription className="mt-0.5">
                {config.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando packs...
            </div>
          ) : packs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum pack disponível no momento.
            </p>
          ) : (
            packs.map((pack) => (
              <div
                key={pack.addon_key}
                className="group flex items-center justify-between rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/30"
              >
                <div>
                  <p className="font-semibold">{pack.display_name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-normal">
                      +{formatNumber(pack.credit_amount)} {config.unit}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold">{formatCurrency(pack.price_cents)}</span>
                  <Button
                    size="sm"
                    className={`bg-gradient-to-r ${config.gradient} text-white shadow hover:shadow-md`}
                    onClick={() => handleBuyPack(pack.addon_key)}
                    disabled={busyPack === pack.addon_key}
                  >
                    {busyPack === pack.addon_key ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                        Comprar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PackPurchaseModal;
