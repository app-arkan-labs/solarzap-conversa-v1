import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMembers, type MemberDto } from "@/lib/orgAdminClient";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, User } from "lucide-react";
import { getMemberDisplayName } from "@/lib/memberDisplayName";
import { useSellerPermissions } from "@/hooks/useSellerPermissions";
import { supabase } from "@/lib/supabase";

interface AssignMemberSelectProps {
    contactId: string;
    currentAssigneeId?: string | null;
    className?: string;
    triggerClassName?: string;
}

export function AssignMemberSelect({ contactId, currentAssigneeId, className, triggerClassName }: AssignMemberSelectProps) {
    const [members, setMembers] = useState<MemberDto[]>([]);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const { toast } = useToast();
    const [isUpdating, setIsUpdating] = useState(false);
    const { role, orgId } = useAuth();
    const { permissions } = useSellerPermissions();
    const queryClient = useQueryClient();
    const mountedRef = useRef(true);

    const canAssign = role === "owner" || role === "admin" || permissions.can_assign_leads;

    const loadMembers = useCallback(async (forceRefresh = false) => {
        if (!mountedRef.current) return;
        if (!forceRefresh && members.length > 0) return;

        setIsLoadingMembers(true);
        try {
            const res = await listMembers(orgId ?? undefined, { forceRefresh });
            const loadedMembers = res.ok && res.members ? res.members : [];
            if (!mountedRef.current) return;

            setMembers(loadedMembers);
        } catch (err) {
            console.error("Failed to load members for assignment:", err);
        } finally {
            if (mountedRef.current) {
                setIsLoadingMembers(false);
            }
        }
    }, [members.length, orgId]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        setMembers([]);
    }, [orgId]);

    const handleAssign = async (userId: string) => {
        if (userId === currentAssigneeId) return;
        if (!orgId) return;
        if (!canAssign) return;

        setIsUpdating(true);
        const nextAssigneeId = userId === "unassigned" ? null : userId;
        const snapshot = queryClient.getQueriesData({ queryKey: ["leads", orgId] });

        queryClient.setQueriesData({ queryKey: ["leads", orgId] }, (oldData: unknown) => {
            if (!Array.isArray(oldData)) return oldData;
            return oldData.map((item: any) =>
                String(item?.id) === String(contactId)
                    ? { ...item, assignedToUserId: nextAssigneeId, assigned_to_user_id: nextAssigneeId }
                    : item
            );
        });

        try {
            const { error } = await supabase
                .from("leads")
                .update({ assigned_to_user_id: nextAssigneeId })
                .eq("id", Number(contactId))
                .eq("org_id", orgId);

            if (error) throw error;

            toast({
                title: "Atribuicao atualizada",
                description: "O contato foi reatribuido com sucesso.",
            });
            queryClient.invalidateQueries({ queryKey: ["leads", orgId] });
        } catch (err: any) {
            snapshot.forEach(([key, data]) => {
                queryClient.setQueryData(key, data);
            });
            toast({
                variant: "destructive",
                title: "Erro ao atribuir",
                description: err.message || "Nao foi possivel atribuir o contato.",
            });
        } finally {
            setIsUpdating(false);
        }
    };

    if (!canAssign) {
        return null;
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
                    className={`h-8 w-full max-w-full truncate text-xs sm:max-w-[130px] ${triggerClassName || "w-full sm:w-[130px]"}`}
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

