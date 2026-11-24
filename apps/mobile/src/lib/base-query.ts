import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useQuery } from './query';

/** Family Base is kept in memory only. Recheck visibility on focus, foreground and while open. */
export function useBaseQuery<T>(family: string, key: string, load: (signal: AbortSignal) => Promise<T>) {
  const query = useQuery(family, key, load, false);
  useFocusEffect(useCallback(() => {
    const app = AppState.addEventListener('change', (next) => { if (next === 'active') query.refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') query.refresh(); }, 60_000);
    return () => { app.remove(); clearInterval(timer); };
  }, [query.refresh]));
  return query;
}
