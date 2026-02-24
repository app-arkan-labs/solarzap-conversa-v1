import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageSquare, Send, Loader2, Trash2, Calendar, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Comment {
  id: number;
  lead_id: number;
  texto: string;
  autor: string;
  created_at: string;
}

interface LeadCommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
}

export function LeadCommentsModal({ isOpen, onClose, leadId, leadName }: LeadCommentsModalProps) {
  const { orgId, user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { toast } = useToast();

  // Derive author name from authenticated user
  const authorName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0]
    || 'Vendedor';

  // Fetch comments when modal opens
  useEffect(() => {
    if (isOpen && leadId) {
      fetchComments();
    }
  }, [isOpen, leadId]);

  // Reset date filters when modal opens
  useEffect(() => {
    if (isOpen) {
      setStartDate('');
      setEndDate('');
    }
  }, [isOpen]);

  const fetchComments = async () => {
    setIsLoading(true);
    try {
      const leadIdNum = parseInt(leadId);
      if (isNaN(leadIdNum)) {
        // For mock data, just show empty comments
        setComments([]);
        return;
      }

      const { data, error } = await supabase
        .from('comentarios_leads')
        .select('*')
        .eq('lead_id', leadIdNum)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching comments:', error);
        // Table might not exist yet, show empty list
        setComments([]);
      } else {
        setComments(data || []);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
      setComments([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter comments by date
  const filteredComments = useMemo(() => {
    if (!startDate && !endDate) return comments;

    return comments.filter(comment => {
      const commentDate = parseISO(comment.created_at);
      
      if (startDate && endDate) {
        return isWithinInterval(commentDate, {
          start: startOfDay(parseISO(startDate)),
          end: endOfDay(parseISO(endDate)),
        });
      }
      
      if (startDate) {
        return commentDate >= startOfDay(parseISO(startDate));
      }
      
      if (endDate) {
        return commentDate <= endOfDay(parseISO(endDate));
      }
      
      return true;
    });
  }, [comments, startDate, endDate]);

  const clearDateFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    if (!orgId) {
      toast({
        title: "Erro ao adicionar",
        description: "Organizacao nao vinculada ao usuario.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      const leadIdNum = parseInt(leadId);
      
      if (isNaN(leadIdNum)) {
        // For mock data, simulate adding comment
        const mockComment: Comment = {
          id: Date.now(),
          lead_id: 0,
          texto: newComment,
          autor: authorName,
          created_at: new Date().toISOString(),
        };
        setComments([mockComment, ...comments]);
        setNewComment('');
        toast({
          title: "Comentário adicionado!",
          description: "O comentário foi salvo com sucesso.",
        });
        return;
      }

      const { data, error } = await supabase
        .from('comentarios_leads')
        .insert([
          {
            org_id: orgId,
            lead_id: leadIdNum,
            texto: newComment,
            autor: authorName,
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Error adding comment:', error);
        toast({
          title: "Erro ao adicionar",
          description: "A tabela de comentários precisa ser criada no Supabase.",
          variant: "destructive",
        });
      } else {
        setComments([data, ...comments]);
        setNewComment('');
        toast({
          title: "Comentário adicionado!",
          description: "O comentário foi salvo com sucesso.",
        });
      }
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      const { error } = await supabase
        .from('comentarios_leads')
        .delete()
        .eq('id', commentId);

      if (error) {
        console.error('Error deleting comment:', error);
      } else {
        setComments(comments.filter(c => c.id !== commentId));
        toast({
          title: "Comentário excluído",
        });
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <MessageSquare className="w-5 h-5 text-primary" />
            Comentários - {leadName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0 gap-4">
          {/* Add comment form */}
          <div className="flex gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Adicionar comentário..."
              rows={2}
              className="resize-none flex-1"
            />
            <Button
              onClick={handleAddComment}
              disabled={!newComment.trim() || isSending}
              size="icon"
              className="h-auto"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Date filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <Label htmlFor="startDate" className="text-sm text-muted-foreground">De:</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-auto h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="endDate" className="text-sm text-muted-foreground">Até:</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-auto h-8 text-sm"
              />
            </div>
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDateFilters}
                className="h-8 px-2"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Filtered results count */}
          {(startDate || endDate) && (
            <p className="text-xs text-muted-foreground">
              {filteredComments.length} de {comments.length} comentários
            </p>
          )}

          {/* Comments list */}
          <ScrollArea className="flex-1 min-h-[200px] max-h-[350px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
                <p>{comments.length === 0 ? 'Nenhum comentário ainda' : 'Nenhum comentário encontrado'}</p>
                <p className="text-sm">
                  {comments.length === 0 ? 'Adicione o primeiro comentário acima' : 'Ajuste o filtro de data'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 pr-4">
                {filteredComments.map((comment) => (
                  <div
                    key={comment.id}
                    className="p-3 bg-muted rounded-lg group relative"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">
                        {comment.autor}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(comment.created_at)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDeleteComment(comment.id)}
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {comment.texto}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
