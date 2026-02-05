import React, { useState, useMemo } from 'react';
import { Message } from '@/types/solarzap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  contactName: string;
}

export function ChatSearchModal({ isOpen, onClose, messages, contactName }: ChatSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return [];
    
    return messages.filter(msg => 
      msg.content.toLowerCase().includes(searchQuery.toLowerCase())
    ).reverse(); // Most recent first
  }, [messages, searchQuery]);

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-700 px-0.5 rounded">{part}</mark>
        : part
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredMessages.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Pesquisar em {contactName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Digite para pesquisar..."
              className="pl-10 pr-10"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Results count */}
          {searchQuery && (
            <div className="text-sm text-muted-foreground">
              {filteredMessages.length === 0 
                ? 'Nenhuma mensagem encontrada'
                : `${filteredMessages.length} mensagem(ns) encontrada(s)`
              }
            </div>
          )}

          {/* Navigation */}
          {filteredMessages.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedIndex + 1} de {filteredMessages.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSelectedIndex(prev => Math.max(prev - 1, 0))}
                disabled={selectedIndex === 0}
              >
                <ArrowUp className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSelectedIndex(prev => Math.min(prev + 1, filteredMessages.length - 1))}
                disabled={selectedIndex === filteredMessages.length - 1}
              >
                <ArrowDown className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Results */}
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {filteredMessages.map((msg, index) => (
                <div
                  key={msg.id}
                  className={cn(
                    'p-3 rounded-lg cursor-pointer transition-colors',
                    index === selectedIndex 
                      ? 'bg-primary/10 border border-primary/30' 
                      : 'bg-muted/50 hover:bg-muted'
                  )}
                  onClick={() => setSelectedIndex(index)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      {msg.isFromClient ? contactName : 'Você'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(msg.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground line-clamp-3">
                    {highlightText(msg.content, searchQuery)}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
