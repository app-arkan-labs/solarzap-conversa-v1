import React, { useCallback, useEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeads } from "@/hooks/domain/useLeads";
import { listMembers, type MemberDto } from "@/lib/orgAdminClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, User } from "lucide-react";
import { getMemberDisplayName } from "@/lib/memberDisplayName";

interface AssignMemberSelectProps {
    contactId: string;
    currentAssigneeId?: string | null;
    className?: string;
    triggerClassName?: string;
}

export function AssignMemberSelect({ contactId, currentAssigneeId, className, triggerClassName }: AssignMemberSelectProps) {
    const [members, setMembers] = useState<MemberDto[]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const { updateLead } = useLeads();
    const { toast } = useToast();
    const [isUpdating, setIsUpdating] = useState(false);
    const { role } = useAuth();
    const mountedRef = useRef(true);

    // Check if user has permission to assign leads (owner, admin, consultant)
    const canAssign = role === "owner" || role === "admin" || role === "consultant";

    const loadMembers = useCallback(async () => {
        if (!mountedRef.current) return;

        setIsLoadingMembers(true);
        try {
            const res = await listMembers();
            if (!mountedRef.current) return;

            if (res.ok && res.members) {
                setMembers(res.members);
            }
        } catch (err) {
            console.error("Failed to load members for assignment:", err);
        } finally {
            if (mountedRef.current) {
                setIsLoadingMembers(false);
            }
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void loadMembers();

        return () => {
            mountedRef.current = false;
        };
    }, [loadMembers]);

    const handleAssign = async (userId: string) => {
        if (userId === currentAssigneeId) return;

        setIsUpdating(true);
        try {
            await updateLead({
                contactId,
                data: {
                    assigned_to_user_id: userId === "unassigned" ? null : userId
                }
            });
            toast({
                title: "Atribuicao atualizada",
                description: "O contato foi reatribuido com sucesso.",
            });
        } catch (err: any) {
            toast({
                variant: "destructive",
                title: "Erro ao atribuir",
                description: err.message || "Nao foi possivel atribuir o contato.",
            });
        } finally {
            setIsUpdating(false);
        }
    };

    if (!canAssign) return null;

    return (
        <div className={`flex items-center gap-2 ${className || ""}`}>
            <Select
                value={currentAssigneeId || "unassigned"}
                onValueChange={handleAssign}
                onOpenChange={(open) => {
                    if (open) {
                        void loadMembers();
                    }
                }}
                disabled={isUpdating || isLoadingMembers}
            >
                <SelectTrigger
                    data-testid={`assign-member-select-trigger-${contactId}`}
                    className={`h-8 text-xs max-w-[130px] truncate ${triggerClassName || "w-[130px]"}`}
                >
                    <div className="flex items-center gap-2 overflow-hidden w-full">
                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" /> : <User className="w-3 h-3 flex-shrink-0" />}
                        <SelectValue placeholder="Atribuir..." className="truncate font-medium flex-1 text-left" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="unassigned" className="text-muted-foreground italic">
                        Nao atribuido
                    </SelectItem>
                    {members.map((member) => (
                        <SelectItem
                            key={member.user_id}
                            value={member.user_id}
                            data-testid={`assign-member-option-${member.user_id}`}
                        >
                            {getMemberDisplayName(member)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

