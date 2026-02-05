import React, { useMemo } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuGroup
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, Check, Smartphone, Mail, MessageCircle, Instagram, Facebook, Palette } from 'lucide-react';
import { UserWhatsAppInstance } from '@/hooks/useUserWhatsAppInstances';
import { cn } from '@/lib/utils';
import { WHATSAPP_COLORS } from '@/constants';

// Icon mapping for supported channels
const ChannelIcons = {
    whatsapp: <Smartphone className="w-4 h-4 text-green-500" />,
    messenger: <Facebook className="w-4 h-4 text-blue-600" />,
    instagram: <Instagram className="w-4 h-4 text-pink-500" />,
    email: <Mail className="w-4 h-4 text-gray-500" />,
};

interface InstanceSelectorProps {
    instances: UserWhatsAppInstance[];
    selectedInstanceId: string | null;
    onSelect: (instance: UserWhatsAppInstance) => void;
    onUpdateColor?: (instanceId: string, color: string) => Promise<boolean>;
    className?: string;
}

export function InstanceSelector({
    instances,
    selectedInstanceId,
    onSelect,
    onUpdateColor,
    className
}: InstanceSelectorProps) {

    const connectedInstances = useMemo(() => {
        return instances.filter(i => i.status === 'connected');
    }, [instances]);

    const selectedInstance = useMemo(() => {
        return connectedInstances.find(i => i.id === selectedInstanceId) || connectedInstances[0] || null;
    }, [connectedInstances, selectedInstanceId]);

    // If no instances connected, show disabled state
    if (connectedInstances.length === 0) {
        return (
            <Button variant="outline" size="sm" disabled className={cn("text-xs opacity-50", className)}>
                <Smartphone className="w-3 h-3 mr-2" />
                Sem conexão
            </Button>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className={cn("flex items-center gap-2 h-8 text-xs font-normal border-dashed", className)}
                >
                    {selectedInstance ? (
                        <>
                            {/* Show color dot if available */}
                            {selectedInstance.color && (
                                <div
                                    className="w-2 h-2 rounded-full mr-1"
                                    style={{ backgroundColor: selectedInstance.color }}
                                />
                            )}
                            {!selectedInstance.color && ChannelIcons.whatsapp}

                            {selectedInstance.display_name}
                        </>
                    ) : (
                        <>Selecione</>
                    )}
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[240px]">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Canal de Envio</DropdownMenuLabel>

                {/* WhatsApp Group */}
                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-xs flex items-center gap-2">
                        <Smartphone className="w-3 h-3 text-green-500" />
                        WhatsApp
                        <span className="ml-auto text-xs text-muted-foreground">{connectedInstances.length}</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-[220px]">
                        <DropdownMenuLabel className="text-xs mb-1">Selecionar Instância</DropdownMenuLabel>
                        {connectedInstances.map(instance => (
                            <DropdownMenuItem
                                key={instance.id}
                                onClick={() => onSelect(instance)}
                                className="text-xs flex items-center justify-between cursor-pointer"
                            >
                                <div className="flex items-center gap-2">
                                    {instance.color && (
                                        <div
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: instance.color }}
                                        />
                                    )}
                                    {instance.display_name}
                                </div>
                                {selectedInstance?.id === instance.id && <Check className="w-3 h-3 text-primary" />}
                            </DropdownMenuItem>
                        ))}

                        {/* Color Customization Submenu */}
                        {onUpdateColor && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger className="text-xs flex items-center gap-2">
                                        <Palette className="w-3 h-3 text-muted-foreground" />
                                        Personalizar Cores
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent className="w-[200px]">
                                        {connectedInstances.map(instance => (
                                            <DropdownMenuSub key={instance.id}>
                                                <DropdownMenuSubTrigger className="text-xs flex items-center gap-2">
                                                    <div
                                                        className="w-2 h-2 rounded-full"
                                                        style={{ backgroundColor: instance.color || '#25D366' }}
                                                    />
                                                    {instance.display_name}
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent className="p-2 grid grid-cols-4 gap-2 w-[160px]">
                                                    {WHATSAPP_COLORS.map(color => (
                                                        <button
                                                            key={color}
                                                            className={cn(
                                                                "w-6 h-6 rounded-full border border-border hover:scale-110 transition-transform",
                                                                instance.color === color && "ring-2 ring-primary"
                                                            )}
                                                            style={{ backgroundColor: color }}
                                                            onClick={(e) => {
                                                                e.stopPropagation(); // Keep menu open? No, DropdownMenuItem usually closes.
                                                                onUpdateColor(instance.id, color);
                                                            }}
                                                        />
                                                    ))}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                        ))}
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                            </>
                        )}
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                {/* Placeholders */}
                <DropdownMenuItem disabled className="text-xs flex items-center gap-2 opacity-50">
                    <Facebook className="w-3 h-3 text-blue-600" />
                    Messenger (Em breve)
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-xs flex items-center gap-2 opacity-50">
                    <Instagram className="w-3 h-3 text-pink-500" />
                    Instagram (Em breve)
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-xs flex items-center gap-2 opacity-50">
                    <Mail className="w-3 h-3 text-gray-500" />
                    E-mail (Em breve)
                </DropdownMenuItem>

            </DropdownMenuContent>
        </DropdownMenu>
    );
}
