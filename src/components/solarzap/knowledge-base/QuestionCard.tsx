import React from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Check, HelpCircle } from 'lucide-react';
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface QuestionCardProps {
    question: string;
    hint?: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    multiline?: boolean;
    rows?: number;
    maxLength?: number;
    isSaved?: boolean;
    className?: string;
}

export function QuestionCard({
    question,
    hint,
    placeholder,
    value,
    onChange,
    multiline = false,
    rows = 4,
    maxLength,
    isSaved = false,
    className
}: QuestionCardProps) {
    const hasContent = value && value.trim().length > 0;

    return (
        <Card className={cn(
            "transition-all duration-200 border-l-4",
            hasContent ? "border-l-primary bg-primary/6" : "border-l-primary/30 hover:border-l-primary",
            className
        )}>
            <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-base font-medium text-foreground">{question}</span>
                        {hint && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                        <p className="text-sm">{hint}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                    {hasContent && isSaved && (
                        <div className="flex items-center gap-1 text-primary text-sm">
                            <Check className="w-4 h-4" />
                            <span>Salvo</span>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
                {multiline ? (
                    <div className="space-y-1">
                        <Textarea
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={placeholder}
                            rows={rows}
                            maxLength={maxLength}
                            className="resize-none bg-background/92"
                        />
                        {maxLength && (
                            <div className="text-xs text-muted-foreground text-right">
                                {value.length}/{maxLength} caracteres
                            </div>
                        )}
                    </div>
                ) : (
                    <Input
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={placeholder}
                        className="bg-background/92"
                    />
                )}
            </CardContent>
        </Card>
    );
}
