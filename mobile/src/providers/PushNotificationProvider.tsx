import React, { useEffect, useRef, useState } from 'react';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useSession } from './SessionProvider';
import { supabase } from '../lib/supabase';
import { useTenant } from './TenantProvider';

const isExpoGoAndroid = (Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo') && Platform.OS === 'android';

let Notifications: any = null;
if (!isExpoGoAndroid) {
  try {
    Notifications = require('expo-notifications');
  } catch (e) {
    console.warn('Could not require expo-notifications', e);
  }
}

if (Notifications) {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (e) {
    console.warn('Failed to set notification handler', e);
  }
}

export function PushNotificationProvider({ children }: { children: React.ReactNode }) {
  const [expoPushToken, setExpoPushToken] = useState('');
  const { session } = useSession();
  const { activeTenantId } = useTenant();
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    if (isExpoGoAndroid) return;

    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    try {
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        console.log('Notification Received', notification);
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification Response', response);
      });
    } catch (e) {
      console.warn('Failed to add notification listeners', e);
    }

    return () => {
      if (notificationListener.current && typeof notificationListener.current.remove === 'function') {
        notificationListener.current.remove();
      }
      if (responseListener.current && typeof responseListener.current.remove === 'function') {
        responseListener.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (expoPushToken && session?.user?.id) {
      savePushTokenToDB(expoPushToken, session.user.id, activeTenantId);
    }
  }, [expoPushToken, session?.user?.id, activeTenantId]);

  async function savePushTokenToDB(token: string, userId: string, tenantId: string | null) {
    try {
      await supabase
        .from('user_push_tokens')
        .upsert({ 
          user_id: userId, 
          expo_push_token: token,
          last_tenant_id: tenantId || null,
          updated_at: new Date().toISOString()
        });
    } catch (err) {
      console.error('Error saving push token', err);
    }
  }

  return <>{children}</>;
}

async function registerForPushNotificationsAsync() {
  if (isExpoGoAndroid) return null;
  let token;

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#A3FF47',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      if (!projectId) {
        console.log('Project ID not found for expo push notification');
      }
      try {
        const pushTokenString = (
          await Notifications.getExpoPushTokenAsync({
            projectId,
          })
        ).data;
        token = pushTokenString;
      } catch (e: unknown) {
        console.log('Error getting push token', e);
      }
    } else {
      console.log('Must use physical device for Push Notifications');
    }
  } catch (err) {
    console.warn('registerForPushNotificationsAsync failed', err);
  }

  return token;
}
