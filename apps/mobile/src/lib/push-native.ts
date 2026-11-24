import Constants from 'expo-constants';
import { isDevice } from 'expo-device';
import { Platform } from 'react-native';

export const supportsPhonePush = Platform.OS === 'android' && isDevice && !Constants.expoGoConfig;
export async function phoneNotifications() {
  if (!supportsPhonePush) return null;
  return import('expo-notifications');
}
