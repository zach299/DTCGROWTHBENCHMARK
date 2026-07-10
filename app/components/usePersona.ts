'use client';

// Shared persona lens hook — single source of truth for the "What do you
// sell?" setting. Reads the stored value (localStorage, keyed per Supabase
// user like the quota counters), subscribes to both the same-tab custom
// event and the cross-tab 'storage' event, and persists + broadcasts on set
// so every open view (Settings, report narrative, Top Movers, TAM builder)
// stays in sync.

import { useCallback, useEffect, useState } from 'react';
import { isPersona, personaStorageKey, type Persona } from '@/lib/persona';
import { useAuth } from './AuthProvider';

export const PERSONA_CHANGED_EVENT = 'tam-persona-changed';

export function usePersona(): [Persona, (p: Persona) => void] {
  const { user } = useAuth();
  const key = personaStorageKey(user?.id);
  const [persona, setPersonaState] = useState<Persona>('other');

  useEffect(() => {
    // Initial read — private mode / disabled storage falls back to 'other'.
    try {
      const stored = localStorage.getItem(key);
      setPersonaState(isPersona(stored) ? stored : 'other');
    } catch {
      setPersonaState('other');
    }
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (isPersona(detail)) setPersonaState(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key && isPersona(e.newValue)) setPersonaState(e.newValue);
    };
    window.addEventListener(PERSONA_CHANGED_EVENT, onChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PERSONA_CHANGED_EVENT, onChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, [key]);

  const setPersona = useCallback(
    (p: Persona) => {
      setPersonaState(p);
      try {
        localStorage.setItem(key, p);
      } catch {
        /* still update in-memory state */
      }
      window.dispatchEvent(new CustomEvent<Persona>(PERSONA_CHANGED_EVENT, { detail: p }));
    },
    [key]
  );

  return [persona, setPersona];
}
