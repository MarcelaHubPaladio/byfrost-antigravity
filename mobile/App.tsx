import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SessionProvider } from './src/providers/SessionProvider';
import { TenantProvider } from './src/providers/TenantProvider';
import { QueryProvider } from './src/providers/QueryProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <SessionProvider>
          <TenantProvider>
            <RootNavigator />
            <StatusBar style="light" />
          </TenantProvider>
        </SessionProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
