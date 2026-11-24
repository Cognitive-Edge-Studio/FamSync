import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

export function useMediaScope(stop: () => void) {
  useFocusEffect(useCallback(() => () => stop(), [stop]));
  useEffect(() => {
    const app = AppState.addEventListener('change', (next) => { if (next !== 'active') stop(); });
    return () => { app.remove(); stop(); };
  }, [stop]);
}
