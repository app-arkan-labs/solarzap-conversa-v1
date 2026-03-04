import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function BroadcastView() {
  return (
    <div className="h-full p-6 overflow-auto">
      <Card>
        <CardHeader>
          <CardTitle>Disparos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Painel de disparos em configuracao.</p>
        </CardContent>
      </Card>
    </div>
  );
}
