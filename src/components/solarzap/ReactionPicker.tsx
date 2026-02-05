import React, { useState } from 'react';
import { Plus, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';

interface ReactionPickerProps {
    onSelect: (emoji: string) => void;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function ReactionPicker({ onSelect, isOpen, onOpenChange }: ReactionPickerProps) {
    const [showFullPicker, setShowFullPicker] = useState(false);

    return (
        <Popover open={isOpen} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <button
                    className="p-1 bg-background/50 rounded-full shadow-sm hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
                    title="Reagir"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Smile className="w-4 h-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-auto p-1.5 rounded-full bg-background border shadow-lg flex items-center gap-1"
                side="top"
                align="center"
                sideOffset={5}
            >
                {QUICK_REACTIONS.map((emoji) => (
                    <button
                        key={emoji}
                        onClick={() => {
                            onSelect(emoji);
                            onOpenChange(false);
                        }}
                        className="w-8 h-8 flex items-center justify-center text-xl hover:scale-125 transition-transform cursor-pointer rounded-full hover:bg-muted"
                    >
                        {emoji}
                    </button>
                ))}

                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Mais reações"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-none" side="top" align="center">
                        <EmojiPicker
                            onEmojiClick={(data: EmojiClickData) => {
                                onSelect(data.emoji);
                                onOpenChange(false);
                                setShowFullPicker(false);
                            }}
                            theme={Theme.LIGHT}
                            lazyLoadEmojis={true}
                        />
                    </PopoverContent>
                </Popover>
            </PopoverContent>
        </Popover>
    );
}
