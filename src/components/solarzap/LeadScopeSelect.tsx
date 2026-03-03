import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getMemberDisplayName } from '@/lib/memberDisplayName';
import type { MemberDto } from '@/lib/orgAdminClient';

export type LeadScopeValue = 'mine' | 'org_all' | `user:${string}`;

interface LeadScopeSelectProps {
  value: LeadScopeValue;
  onChange: (value: LeadScopeValue) => void;
  members?: MemberDto[];
  loading?: boolean;
  currentUserId?: string | null;
  triggerClassName?: string;
  testId?: string;
}

export function LeadScopeSelect({
  value,
  onChange,
  members = [],
  loading = false,
  currentUserId = null,
  triggerClassName = 'w-[220px] bg-background border-border/50 shadow-sm glass',
  testId,
}: LeadScopeSelectProps) {
  const currentUserLabel = useMemo(() => {
    const currentMember = members.find((member) => member.user_id === currentUserId);
    if (!currentMember) return 'Conta ativa';
    return getMemberDisplayName(currentMember);
  }, [currentUserId, members]);

  const uniqueMembers = useMemo(() => {
    const seen = new Set<string>();
    return members.filter((member) => {
      if (!member.user_id || member.user_id === currentUserId) return false;
      if (seen.has(member.user_id)) return false;
      seen.add(member.user_id);
      return true;
    });
  }, [currentUserId, members]);

  return (
    <Select value={value} onValueChange={(nextValue) => onChange(nextValue as LeadScopeValue)}>
      <SelectTrigger data-testid={testId} className={triggerClassName}>
        <SelectValue placeholder="Conta ativa" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="mine">{currentUserLabel}</SelectItem>
        <SelectItem value="org_all">Geral</SelectItem>
        {uniqueMembers.map((member) => (
          <SelectItem key={member.user_id} value={`user:${member.user_id}`}>
            {getMemberDisplayName(member)}
          </SelectItem>
        ))}
        {loading && uniqueMembers.length === 0 ? (
          <SelectItem value="loading-users" disabled>
            Carregando responsaveis...
          </SelectItem>
        ) : null}
      </SelectContent>
    </Select>
  );
}
