import { ExternalLink, LinkIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

type DealCheckoutModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealTitle: string;
  checkoutUrl: string;
  isGenerating: boolean;
  onGenerate: () => void;
};

export function DealCheckoutModal(props: DealCheckoutModalProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Checkout Stripe</DialogTitle>
          <DialogDescription>
            Gere o link de checkout para o deal {props.dealTitle || 'selecionado'}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Button onClick={props.onGenerate} disabled={props.isGenerating}>
            {props.isGenerating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-1.5 h-4 w-4" />}
            Gerar checkout
          </Button>

          <Input value={props.checkoutUrl} readOnly placeholder="O link aparecerá aqui após a geração" />

          {props.checkoutUrl ? (
            <Button variant="outline" onClick={() => window.open(props.checkoutUrl, '_blank', 'noopener,noreferrer')}>
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Abrir checkout
            </Button>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
