import React, { useMemo, useState } from 'react';
import { format, parseISO, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, TrendingDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useLossAnalytics } from '@/hooks/useLossAnalytics';

interface LossAnalyticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerUserId?: string | null;
}

const formatDateInput = (date: Date) => format(date, 'yyyy-MM-dd');

export function LossAnalyticsModal({ open, onOpenChange, ownerUserId = null }: LossAnalyticsModalProps) {
  const [from, setFrom] = useState(() => formatDateInput(subDays(new Date(), 30)));
  const [to, setTo] = useState(() => formatDateInput(new Date()));

  const startDate = useMemo(() => new Date(`${from}T00:00:00`), [from]);
  const endDate = useMemo(() => new Date(`${to}T23:59:59`), [to]);

  const { data, isLoading, error } = useLossAnalytics({
    startDate,
    endDate,
    ownerUserId,
    enabled: open,
  });

  const trendTone = (data?.changePercentage || 0) > 0 ? 'text-rose-600' : 'text-emerald-600';
  const trendIcon = (data?.changePercentage || 0) > 0 ? ArrowUpRight : ArrowDownRight;
  const TrendIcon = trendIcon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1200px] h-[92vh] p-0 overflow-hidden">
        <div className="border-b border-border/60 p-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <TrendingDown className="h-5 w-5 text-rose-500" />
              Analise de perdas
            </DialogTitle>
            <DialogDescription>
              Motivos mais frequentes, historico recente e acoes sugeridas para reduzir perdas comerciais.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="md:w-[180px]" />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="md:w-[180px]" />
            <Button type="button" variant="outline" onClick={() => {
              setFrom(formatDateInput(subDays(new Date(), 30)));
              setTo(formatDateInput(new Date()));
            }}>
              Últimos 30 dias
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[calc(92vh-128px)]">
          <div className="space-y-6 p-6">
            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
                Falha ao carregar analise de perdas. {error instanceof Error ? error.message : 'Tente novamente.'}
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <Card className="border-border/50 bg-background/80 shadow-sm">
                    <CardHeader>
                      <CardDescription>Perdas no periodo</CardDescription>
                      <CardTitle className="text-3xl">{data?.totalLosses || 0}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className={`flex items-center gap-2 text-sm font-medium ${trendTone}`}>
                        <TrendIcon className="h-4 w-4" />
                        {data?.changePercentage === 0
                          ? 'Mesmo volume do periodo anterior'
                          : `${Math.abs(data?.changePercentage || 0)}% ${((data?.changePercentage || 0) > 0) ? 'acima' : 'abaixo'} do periodo anterior`}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 bg-background/80 shadow-sm">
                    <CardHeader>
                      <CardDescription>Motivo lider</CardDescription>
                      <CardTitle className="text-xl">{data?.topReason?.label || 'Sem perdas'}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-muted-foreground">
                      {data?.topReason
                        ? `${data.topReason.count} registros, ${data.topReason.share}% do total.`
                        : 'Nenhuma perda registrada no intervalo selecionado.'}
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 bg-background/80 shadow-sm">
                    <CardHeader>
                      <CardDescription>Leitura rapida</CardDescription>
                      <CardTitle className="text-xl">{(data?.chartData || []).length} motivos ativos</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm text-muted-foreground">
                      {(data?.chartData || []).length > 0
                        ? 'Concentre a mitigacao nos 3 principais motivos para reduzir perdas com mais velocidade.'
                        : 'O painel fica mais util assim que as perdas forem registradas no pipeline.'}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
                  <Card className="border-border/50 bg-background/80 shadow-sm">
                    <CardHeader>
                      <CardTitle>Motivos mais frequentes</CardTitle>
                      <CardDescription>Distribuicao das perdas registradas no periodo selecionado.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[320px]">
                      {(data?.chartData || []).length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data?.chartData} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
                            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" angle={-18} textAnchor="end" height={60} interval={0} tickLine={false} axisLine={false} />
                            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                            <Tooltip formatter={(value: number) => [`${value} perdas`, 'Quantidade']} />
                            <Bar dataKey="count" fill="#ef4444" radius={[10, 10, 0, 0]} maxBarSize={54} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 text-center">
                          <AlertTriangle className="mb-3 h-6 w-6 text-muted-foreground" />
                          <p className="text-sm font-medium text-foreground">Nenhuma perda registrada no periodo</p>
                          <p className="mt-1 max-w-md text-sm text-muted-foreground">
                            Assim que os vendedores registrarem perdas no Pipeline, este grafico passa a destacar concentracao por motivo.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 bg-background/80 shadow-sm">
                    <CardHeader>
                      <CardTitle>Acoes recomendadas</CardTitle>
                      <CardDescription>Leitura taticamente orientada pelos principais motivos.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(data?.actionItems || []).length > 0 ? (
                        data?.actionItems.map((item) => (
                          <div key={item.title} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                            <p className="text-sm font-semibold text-foreground">{item.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                          Sem dados suficientes para sugerir mitigacoes neste periodo.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <Card className="border-border/50 bg-background/80 shadow-sm">
                    <CardHeader>
                      <CardTitle>Motivos em destaque</CardTitle>
                      <CardDescription>Os motivos com mais impacto no periodo atual.</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {(data?.chartData || []).slice(0, 6).map((item) => (
                        <Badge key={item.key} variant="secondary" className="px-3 py-1 text-sm">
                          {item.label} · {item.count}
                        </Badge>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-border/50 bg-background/80 shadow-sm">
                    <CardHeader>
                      <CardTitle>Historico recente</CardTitle>
                      <CardDescription>Ultimas perdas registradas com contexto para acompanhamento.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(data?.recentLosses || []).length > 0 ? (
                        <div className="space-y-3">
                          {data?.recentLosses.map((entry) => (
                            <div key={entry.id} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{entry.leadName}</p>
                                  <p className="text-sm text-muted-foreground">{entry.reasonLabel}</p>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {format(parseISO(entry.createdAt), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                                </p>
                              </div>
                              {entry.detail ? (
                                <p className="mt-2 text-sm text-muted-foreground">{entry.detail}</p>
                              ) : null}
                              {entry.author ? (
                                <p className="mt-2 text-xs text-muted-foreground">Registrado por {entry.author}</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                          Nenhuma perda registrada ainda no periodo selecionado.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}