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

  /**
   * The API explains exactly what went wrong — "Maximum 5 emergency contacts
   * allowed", "This contact is already added" — in `detail`. Falling back to
   * `e.message` would show "Request failed with status code 400" instead.
   */
  const messageFor = (e: any, fallback: string): string =>
    e?.response?.data?.detail || e?.message || fallback;

  const createContact = useCallback(
    async (contact: EmergencyContact): Promise<boolean> => {
      if (!userId) return false;
      setError(null);
      try {
        await addEmergencyContact(userId, contact);
        await refresh();
        return true;
      } catch (e: any) {
        setError(messageFor(e, 'Could not add that contact.'));
        return false;
      }
    },
    [refresh, userId]
  );

  const deleteContact = useCallback(
    async (phone: string): Promise<boolean> => {
      if (!userId) return false;
      setError(null);
      try {
        await removeEmergencyContact(userId, phone);
        await refresh();
        return true;
      } catch (e: any) {
        setError(messageFor(e, 'Could not remove that contact.'));
        return false;
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
