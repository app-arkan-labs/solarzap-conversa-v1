import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useProposalTheme } from '@/hooks/useProposalTheme';
import { useProposalLogo } from '@/hooks/useProposalLogo';
import {
  PROPOSAL_THEMES,
  THEME_IDS,
  getThemeById,
  isValidThemeHex,
  normalizeThemeHex,
  toCustomThemeValue,
} from '@/utils/proposalColorThemes';
import { cn } from '@/lib/utils';
import { ImagePlus, Palette, X } from 'lucide-react';

export interface BrandingSettingsCardProps {
  canEdit: boolean;
  className?: string;
}

const SECONDARY_PALETTE = [
  '#1D4ED8',
  '#EA580C',
  '#DC2626',
  '#0D9488',
  '#7C3AED',
  '#CA8A04',
  '#334155',
  '#16A34A',
];

export function BrandingSettingsCard({ canEdit, className }: BrandingSettingsCardProps) {
  const { toast } = useToast();
  const { themeId, secondaryColorHex, updateTheme, updateSecondaryColor } = useProposalTheme();
  const { logoUrl, uploadLogo, removeLogo, loading: logoLoading } = useProposalLogo();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [customThemeHex, setCustomThemeHex] = useState('');
  const [customSecondaryHex, setCustomSecondaryHex] = useState('');

  useEffect(() => {
    const themeHex = getThemeById(themeId).swatch;
    setCustomThemeHex(String(themeHex || '').toUpperCase());
  }, [themeId]);

  useEffect(() => {
    setCustomSecondaryHex(secondaryColorHex ? secondaryColorHex.toUpperCase() : '');
  }, [secondaryColorHex]);

  const handleApplyCustomTheme = () => {
    if (!canEdit || !customThemeHex.trim()) return;
    if (!isValidThemeHex(customThemeHex)) {
      toast({ title: 'Cor invalida', description: 'Use um codigo HEX valido, ex: #1D4ED8', variant: 'destructive' });
      return;
    }
    const customValue = toCustomThemeValue(customThemeHex);
    if (!customValue) return;
    void updateTheme(customValue);
    setCustomThemeHex(customValue.replace('custom:', '').toUpperCase());
  };

  const handleApplySecondaryColor = () => {
    if (!canEdit) return;
    const normalized = normalizeThemeHex(customSecondaryHex || '');
    if (!normalized) {
      toast({ title: 'Cor secundaria invalida', description: 'Use um codigo HEX valido, ex: #1D4ED8', variant: 'destructive' });
      return;
    }
    void updateSecondaryColor(normalized);
    setCustomSecondaryHex(normalized.toUpperCase());
  };

  const handleResetSecondaryColor = () => {
    if (!canEdit) return;
    void updateSecondaryColor(null);
    setCustomSecondaryHex('');
  };

  const handleLogoClick = () => {
    if (!canEdit || logoLoading) return;
    logoInputRef.current?.click();
  };

  return (
    <Card className={cn('border-border/70 shadow-sm', className)}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Identidade visual</CardTitle>
        <CardDescription>Defina logo, cor primaria e cor secundaria para as proximas propostas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          disabled={!canEdit || logoLoading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file && canEdit) void uploadLogo(file);
            event.target.value = '';
          }}
        />

        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:gap-6">
          <div className="flex flex-col gap-2 min-w-[140px]">
            <span className="text-xs font-medium text-muted-foreground">Logo</span>
            {logoUrl ? (
              <div className="relative w-10 h-10">
                <button
                  type="button"
                  title="Alterar logo"
                  onClick={handleLogoClick}
                  disabled={!canEdit || logoLoading}
                  className="w-10 h-10 rounded-lg border border-border overflow-hidden bg-white hover:ring-2 hover:ring-primary/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <img src={logoUrl} alt="Logo da empresa" className="w-full h-full object-contain p-0.5" />
                </button>
                <button
                  type="button"
                  title="Remover logo"
                  onClick={() => {
                    if (!canEdit) return;
                    void removeLogo();
                  }}
                  disabled={!canEdit || logoLoading}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                title="Enviar logo da empresa"
                onClick={handleLogoClick}
                disabled={!canEdit || logoLoading}
                className="w-10 h-10 rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:border-primary/50 hover:bg-white/50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {logoLoading ? (
                  <div className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                ) : (
                  <ImagePlus className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Cor primaria</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 px-2 py-1 rounded-full border border-border/50 bg-muted/30">
                {THEME_IDS.map((id) => {
                  const theme = PROPOSAL_THEMES[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      title={theme.label}
                      disabled={!canEdit}
                      onClick={() => {
                        if (!canEdit) return;
                        setCustomThemeHex(String(theme.swatch || '').toUpperCase());
                        void updateTheme(id);
                      }}
                      className={cn(
                        'w-6 h-6 rounded-full border border-black/10 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed',
                        canEdit ? 'hover:scale-110' : '',
                        themeId === id ? 'ring-2 ring-primary ring-offset-1 scale-110' : '',
                      )}
                      style={{ backgroundColor: theme.swatch }}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  value={customThemeHex}
                  onChange={(event) => setCustomThemeHex(event.target.value)}
                  placeholder="#1D4ED8"
                  className="h-8 w-28 text-xs uppercase"
                  disabled={!canEdit}
                />
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleApplyCustomTheme} disabled={!canEdit}>
                  Aplicar
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            <span className="text-xs font-medium text-muted-foreground">Cor secundaria</span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5 px-2 py-1 rounded-full border border-border/50 bg-muted/30">
                {SECONDARY_PALETTE.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    title={`Cor secundaria ${hex}`}
                    disabled={!canEdit}
                    onClick={() => {
                      if (!canEdit) return;
                      setCustomSecondaryHex(hex);
                      void updateSecondaryColor(hex);
                    }}
                    className={cn(
                      'w-5 h-5 rounded-full border border-black/10 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed',
                      canEdit ? 'hover:scale-110' : '',
                      (secondaryColorHex || '').toUpperCase() === hex ? 'ring-2 ring-primary ring-offset-1 scale-110' : '',
                    )}
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  value={customSecondaryHex}
                  onChange={(event) => setCustomSecondaryHex(event.target.value)}
                  placeholder="#1D4ED8"
                  className="h-8 w-28 text-xs uppercase"
                  disabled={!canEdit}
                />
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={handleApplySecondaryColor} disabled={!canEdit}>
                  Aplicar
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={handleResetSecondaryColor} disabled={!canEdit}>
                  Auto
                </Button>
              </div>
            </div>
          </div>
        </div>

        {!canEdit ? (
          <p className="text-xs text-muted-foreground">Somente owner/admin podem alterar a identidade visual.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
