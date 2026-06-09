import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Package } from 'lucide-react-native';

import { useSession } from '../providers/SessionProvider';
import { useTenant } from '../providers/TenantProvider';

import Login from '../screens/Login';
import { TenantSelectScreen } from '../screens/tenant/TenantSelectScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { CrmScreen } from '../screens/crm/CrmScreen';

import { CaseDetailScreen } from '../screens/crm/CaseDetailScreen';
import { NewLeadScreen } from '../screens/crm/NewLeadScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AppTabs() {
  const { activeTenant } = useTenant();
  
  // Show CRM tab only if CRM module is enabled
  // Default to true if not explicitly disabled just to avoid hiding it during dev,
  // but let's check modules_json properly.
  const hasCrm = activeTenant?.modules_json?.crm !== false;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopColor: '#1F2937',
        },
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen} 
        options={{
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      {hasCrm && (
        <Tab.Screen 
          name="CRM" 
          component={CrmScreen}
          options={{
            tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
          }}
        />
      )}
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { session, loading: sessionLoading } = useSession();
  const { activeTenantId, loading: tenantLoading } = useTenant();

  if (sessionLoading || (session && tenantLoading)) {
    return null; // Return splash screen or loading spinner
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Login" component={Login} />
        ) : !activeTenantId ? (
          <Stack.Screen name="TenantSelect" component={TenantSelectScreen} />
        ) : (
          <>
            <Stack.Group>
              <Stack.Screen name="App" component={AppTabs} />
              <Stack.Screen name="CaseDetail" component={CaseDetailScreen} />
            </Stack.Group>
            <Stack.Group screenOptions={{ presentation: 'modal' }}>
              <Stack.Screen name="NewLead" component={NewLeadScreen} />
            </Stack.Group>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
