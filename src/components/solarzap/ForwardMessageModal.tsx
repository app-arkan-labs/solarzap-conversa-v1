import React, { useEffect, useMemo, useState } from 'react';
import { Search, Building2, Check, MessageSquare, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Conversation } from '@/types/solarzap';
import { ScrollArea } from '@/components/ui/scroll-area';
import { listMembers, type MemberDto } from '@/lib/orgAdminClient';
import { useAuth } from '@/contexts/AuthContext';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMessagesCount: number;
  conversations: Conversation[];
  onForwardToContacts: (contactIds: string[]) => void;
  onForwardInternally: (teamMemberIds: string[]) => void;
}

type ForwardMode = 'select' | 'contacts' | 'internal';

function memberDisplayName(member: MemberDto) {
  if (member.email) {
    const [prefix] = member.email.split('@');
    return prefix || member.email;
  }
  return `user-${member.user_id.slice(0, 8)}`;
}

export function ForwardMessageModal({
  isOpen,
  onClose,
  selectedMessagesCount,
  conversations,
  onForwardToContacts,
  onForwardInternally,
}: ForwardMessageModalProps) {
  const { orgId } = useAuth();
  const [mode, setMode] = useState<ForwardMode>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);
  const [teamMembers, setTeamMembers] = useState<MemberDto[]>([]);
  const [loadingTeamMembers, setLoadingTeamMembers] = useState(false);
  const [teamLoadError, setTeamLoadError] = useState<string | null>(null);

  const handleClose = () => {
    setMode('select');
    setSearchQuery('');
    setSelectedContacts([]);
    setSelectedTeamMembers([]);
    setTeamLoadError(null);
    onClose();
  };

  useEffect(() => {
    const shouldLoadTeam = isOpen && mode === 'internal';
    if (!shouldLoadTeam) {
      return;
    }

    let active = true;
    const loadTeamMembers = async () => {
      setLoadingTeamMembers(true);
      setTeamLoadError(null);

      try {
        const response = await listMembers(orgId ?? undefined);
        if (!active) return;
        setTeamMembers(response.members);
      } catch (error) {
        if (!active) return;
        const message =
          error instanceof Error ? error.message : 'Nao foi possivel carregar membros da equipe.';
        setTeamLoadError(message);
        setTeamMembers([]);
      } finally {
        if (active) {
          setLoadingTeamMembers(false);
        }
      }
    };

    void loadTeamMembers();

    return () => {
      active = false;
    };
  }, [isOpen, mode, orgId]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(
      (conv) =>
        conv.contact.name.toLowerCase().includes(query) ||
        conv.contact.phone.includes(query) ||
        conv.contact.company?.toLowerCase().includes(query),
    );
  }, [conversations, searchQuery]);

  const filteredTeamMembers = useMemo(() => {
    if (!searchQuery.trim()) return teamMembers;
    const query = searchQuery.toLowerCase();
    return teamMembers.filter((member) => {
      const displayName = memberDisplayName(member).toLowerCase();
      const email = (member.email || '').toLowerCase();
      return displayName.includes(query) || email.includes(query) || member.role.includes(query);
    });
  }, [searchQuery, teamMembers]);

  const toggleContact = (contactId: string) => {
    setSelectedContacts((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId],
    );
  };

  const toggleTeamMember = (memberId: string) => {
    setSelectedTeamMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId],
    );
  };

  const handleForward = () => {
    if (mode === 'contacts' && selectedContacts.length > 0) {
      onForwardToContacts(selectedContacts);
      handleClose();
    } else if (mode === 'internal' && selectedTeamMembers.length > 0) {
      onForwardInternally(selectedTeamMembers);
      handleClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-semibold">
              {mode === 'select' && 'Encaminhar mensagens'}
              {mode === 'contacts' && 'Selecionar contatos'}
              {mode === 'internal' && 'Encaminhar internamente'}
            </DialogTitle>
            {mode !== 'select' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode('select');
                  setSearchQuery('');
                }}
              >
                Voltar
              </Button>
            )}
          </div>
          {mode === 'select' && (
            <p className="text-sm text-muted-foreground mt-1">
              {selectedMessagesCount}{' '}
              {selectedMessagesCount === 1 ? 'mensagem selecionada' : 'mensagens selecionadas'}
            </p>
          )}
        </DialogHeader>

        {mode === 'select' && (
          <div className="p-4 space-y-3">
            <button
              onClick={() => setMode('contacts')}
              className="w-full flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Para contatos</p>
                <p className="text-sm text-muted-foreground">
                  Encaminhar para clientes da lista de conversas
                </p>
              </div>
            </button>

            <button
              onClick={() => setMode('internal')}
              className="w-full flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <Building2 className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Internamente</p>
                <p className="text-sm text-muted-foreground">Encaminhar para membros reais da org</p>
              </div>
            </button>
          </div>
        )}

        {mode === 'contacts' && (
          <div className="flex flex-col h-[400px]">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar contatos..."
                  className="pl-10 bg-muted border-0"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2">
                {filteredConversations.map((conv) => {
                  const isSelected = selectedContacts.includes(conv.contact.id);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => toggleContact(conv.contact.id)}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                        isSelected ? 'bg-primary/10' : 'hover:bg-muted',
                      )}
                    >
                      <div
                        className={cn(
                          'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                          isSelected ? 'bg-primary border-primary' : 'border-muted-foreground',
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg">
                        {conv.contact.avatar || 'C'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{conv.contact.name}</p>
                        {conv.contact.company && (
                          <p className="text-sm text-muted-foreground truncate">{conv.contact.company}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
                {filteredConversations.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">Nenhum contato encontrado</div>
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedContacts.length} {selectedContacts.length === 1 ? 'selecionado' : 'selecionados'}
              </span>
              <Button onClick={handleForward} disabled={selectedContacts.length === 0} className="min-w-[100px]">
                Enviar
              </Button>
            </div>
          </div>
        )}

        {mode === 'internal' && (
          <div className="flex flex-col h-[400px]">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar equipe..."
                  className="pl-10 bg-muted border-0"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Equipe interna
                </div>

                {loadingTeamMembers && (
                  <div className="px-3 py-8 text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando membros...
                  </div>
                )}

                {!loadingTeamMembers && teamLoadError && (
                  <div className="px-3 py-6 text-sm text-destructive">
                    {teamLoadError}
                  </div>
                )}

                {!loadingTeamMembers &&
                  !teamLoadError &&
                  filteredTeamMembers.map((member) => {
                    const isSelected = selectedTeamMembers.includes(member.user_id);
                    return (
                      <button
                        key={member.user_id}
                        onClick={() => toggleTeamMember(member.user_id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                          isSelected ? 'bg-primary/10' : 'hover:bg-muted',
                        )}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                            isSelected ? 'bg-primary border-primary' : 'border-muted-foreground',
                          )}
                        >
                          {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs uppercase font-semibold">
                          {memberDisplayName(member).slice(0, 2)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{memberDisplayName(member)}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {member.role} {member.email ? `• ${member.email}` : ''}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                {!loadingTeamMembers && !teamLoadError && filteredTeamMembers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">Nenhum membro encontrado</div>
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedTeamMembers.length}{' '}
                {selectedTeamMembers.length === 1 ? 'selecionado' : 'selecionados'}
              </span>
              <Button
                onClick={handleForward}
                disabled={selectedTeamMembers.length === 0 || loadingTeamMembers}
                className="min-w-[100px]"
              >
                Enviar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
