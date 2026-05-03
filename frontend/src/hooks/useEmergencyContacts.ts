import { useCallback, useEffect, useState } from 'react';
import {
  addEmergencyContact,
  getEmergencyContacts,
  removeEmergencyContact,
} from '@/src/services/api';

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
  added_at?: string;
}

export function useEmergencyContacts(userId?: string | null) {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setContacts([]);
      return;
    }
    setLoading(true);
    try {
      const response = await getEmergencyContacts(userId);
      setContacts(Array.isArray(response.data?.contacts) ? response.data.contacts : []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const [error, setError] = useState<string | null>(null);

  const createContact = useCallback(
    async (contact: EmergencyContact) => {
      if (!userId) return;
      setError(null);
      try {
        await addEmergencyContact(userId, contact);
        await refresh();
      } catch (e: any) {
        setError(e?.message ?? 'Failed to add contact');
      }
    },
    [refresh, userId]
  );

  const deleteContact = useCallback(
    async (phone: string) => {
      if (!userId) return;
      setError(null);
      try {
        await removeEmergencyContact(userId, phone);
        await refresh();
      } catch (e: any) {
        setError(e?.message ?? 'Failed to remove contact');
      }
    },
    [refresh, userId]
  );

  return {
    contacts,
    loading,
    error,
    refresh,
    createContact,
    deleteContact,
  };
}
