import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from './src/providers/SessionProvider';
import { TenantProvider } from './src/providers/TenantProvider';
import { QueryProvider } from './src/providers/QueryProvider';
import { PushNotificationProvider } from './src/providers/PushNotificationProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NetworkProvider } from './src/providers/NetworkProvider';
import { GlobalNetworkIndicator } from './src/providers/GlobalNetworkIndicator';
import { SyncEngine } from './src/lib/SyncEngine';
import { processSyncJob } from './src/lib/syncProcessor';

export default function App() {
  return (
    <SafeAreaProvider>
      <NetworkProvider onConnect={() => {
        SyncEngine.processQueue(processSyncJob).catch(console.error);
      }}>
        <QueryProvider>
          <SessionProvider>
            <TenantProvider>
              <PushNotificationProvider>
                <RootNavigator />
                <GlobalNetworkIndicator />
                <StatusBar style="light" />
              </PushNotificationProvider>
            </TenantProvider>
          </SessionProvider>
        </QueryProvider>
      </NetworkProvider>
    </SafeAreaProvider>
  );
}
