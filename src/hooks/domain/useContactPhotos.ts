import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DEV_MODE } from '@/config/devMode';
import { useAuth } from '@/contexts/AuthContext';
import { getContactPhoto } from '@/lib/evolutionApi';
import type { Contact } from '@/types/solarzap';

const PHOTO_TTL_MS = 24 * 60 * 60 * 1000;

export function useContactPhotos(contacts: Contact[]) {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const latest = useRef(contacts);
  latest.current = contacts;

  useEffect(() => {
    if (DEV_MODE || !orgId) return;
    const attempted = new Set<string>();
    let stopped = false;
    let running = false;

    const refresh = async () => {
      if (running || stopped) return;
      const targets = latest.current.filter(contact =>
        contact.instanceName && (contact.phoneE164 || contact.phone)
        && !attempted.has(contact.id)
        && !(Date.now() - Date.parse(contact.photoRefreshedAt || '') < PHOTO_TTL_MS)
      ).slice(0, 4);
      if (!targets.length) return;

      running = true;
      for (const contact of targets) attempted.add(contact.id);
      try {
        const photos = new Map<string, { photoUrl: string | null; refreshedAt: string }>();
        await Promise.all(targets.map(async contact => {
          const result = await getContactPhoto(contact.id, contact.instanceName!, orgId);
          if (result.success && result.data) photos.set(contact.id, result.data);
        }));
        if (stopped || !photos.size) return;
        queryClient.setQueriesData<Contact[]>({ queryKey: ['leads', orgId] }, existing =>
          Array.isArray(existing) ? existing.map(contact => {
            const photo = photos.get(contact.id);
            return photo ? { ...contact, photoUrl: photo.photoUrl, photoRefreshedAt: photo.refreshedAt } : contact;
          }) : existing
        );
      } finally {
        running = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 6000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [orgId, queryClient]);
}
