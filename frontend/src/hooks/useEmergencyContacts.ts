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

  const createContact = useCallback(
    async (contact: EmergencyContact) => {
      if (!userId) return;
      await addEmergencyContact(userId, contact);
      await refresh();
    },
    [refresh, userId]
  );

  const deleteContact = useCallback(
    async (phone: string) => {
      if (!userId) return;
      await removeEmergencyContact(userId, phone);
      await refresh();
    },
    [refresh, userId]
  );

  return {
    contacts,
    loading,
    refresh,
    createContact,
    deleteContact,
  };
}
