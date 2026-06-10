import React from 'react';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, ShoppingBag, Package } from 'lucide-react-native';

import { useSession } from '../providers/SessionProvider';
import { useTenant } from '../providers/TenantProvider';

import Login from '../screens/Login';
import { TenantSelectScreen } from '../screens/tenant/TenantSelectScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { CrmScreen } from '../screens/crm/CrmScreen';
import { CaseDetailScreen } from '../screens/crm/CaseDetailScreen';
import { NewLeadScreen } from '../screens/crm/NewLeadScreen';
import { OrdersScreen } from '../screens/orders/OrdersScreen';
import { NewOrderScreen } from '../screens/orders/NewOrderScreen';
import { OrderDetailScreen } from '../screens/orders/OrderDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

/** Checks if current active tenant is Agroforte */
function isAgroforteTenant(tenant: any): boolean {
  if (!tenant) return false;
  const slug = (tenant.slug ?? '').toLowerCase();
  const name = (tenant.name ?? '').toLowerCase();
  return (
    slug === 'agroforte' ||
    slug.includes('agroforte') ||
    name.includes('agroforte') ||
    tenant.modules_json?.orders === true
  );
}

function AppTabs() {
  const { activeTenant } = useTenant();

  const hasCrm = activeTenant?.modules_json?.crm !== false;
  const hasOrders = isAgroforteTenant(activeTenant);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0A0A0A',
          borderTopColor: '#1A1A1A',
          height: 64,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#A3FF47',
        tabBarInactiveTintColor: '#4B5563',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Tarefas',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />

      {hasCrm && (
        <Tab.Screen
          name="CRM"
          component={CrmScreen}
          options={{
            tabBarLabel: 'CRM',
            tabBarIcon: ({ color, size }) => <Package color={color} size={size} />,
          }}
        />
      )}

      {hasOrders && (
        <Tab.Screen
          name="Orders"
          component={OrdersScreen}
          options={{
            tabBarLabel: 'Pedidos',
            tabBarIcon: ({ color, size }) => <ShoppingBag color={color} size={size} />,
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
              <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            </Stack.Group>
            <Stack.Group screenOptions={{ presentation: 'modal' }}>
              <Stack.Screen name="NewLead" component={NewLeadScreen} />
              <Stack.Screen
                name="NewOrder"
                component={NewOrderScreen}
                options={{ gestureEnabled: true }}
              />
            </Stack.Group>
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
