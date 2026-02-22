import React, { useCallback, useEffect, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMembers, type MemberDto } from "@/lib/orgAdminClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, User } from "lucide-react";
import { getMemberDisplayName } from "@/lib/memberDisplayName";
import { useSellerPermissions } from "@/hooks/useSellerPermissions";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

interface AssignMemberSelectProps {
    contactId: string;
    currentAssigneeId?: string | null;
    className?: string;
    triggerClassName?: string;
}

let membersCache: MemberDto[] | null = null;
let membersCachePromise: Promise<MemberDto[]> | null = null;

const loadMembersCached = async (): Promise<MemberDto[]> => {
    if (membersCache) return membersCache;
    if (membersCachePromise) return membersCachePromise;

    membersCachePromise = (async () => {
        const res = await listMembers();
        const loadedMembers = res.ok && res.members ? res.members : [];
        membersCache = loadedMembers;
        return loadedMembers;
    })();

    try {
        return await membersCachePromise;
    } finally {
        membersCachePromise = null;
    }
};

export function AssignMemberSelect({ contactId, currentAssigneeId, className, triggerClassName }: AssignMemberSelectProps) {
    const [members, setMembers] = useState<MemberDto[]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const { toast } = useToast();
    const [isUpdating, setIsUpdating] = useState(false);
    const { role, orgId } = useAuth();
    const { permissions } = useSellerPermissions();
    const mountedRef = useRef(true);

    const canAssign = role === "owner" || role === "admin" || permissions.can_assign_leads;

    const loadMembers = useCallback(async () => {
        if (!mountedRef.current) return;

        setIsLoadingMembers(true);
        try {
            const loadedMembers = await loadMembersCached();
            if (!mountedRef.current) return;

            setMembers(loadedMembers);
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
        if (!orgId) return;

        setIsUpdating(true);
        try {
            const { error } = await supabase
                .from("leads")
                .update({ assigned_to_user_id: userId === "unassigned" ? null : userId })
                .eq("id", Number(contactId))
                .eq("org_id", orgId);

            if (error) throw error;

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

    const assigneeMember = currentAssigneeId
        ? members.find((member) => member.user_id === currentAssigneeId)
        : undefined;

    const assigneeName = currentAssigneeId
        ? (assigneeMember ? getMemberDisplayName(assigneeMember) : "Responsavel")
        : "Nao atribuido";

    if (!canAssign) {
        return (
            <div className={`flex items-center gap-2 ${className || ""}`}>
                <Badge variant="outline" className="h-7 text-[11px] font-normal max-w-full overflow-hidden">
                    <User className="w-3 h-3 mr-1 flex-shrink-0" />
                    <span className="truncate">{assigneeName}</span>
                </Badge>
            </div>
        );
    }

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

