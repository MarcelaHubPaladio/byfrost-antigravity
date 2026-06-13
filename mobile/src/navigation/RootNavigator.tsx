import React from 'react';
import { View, Image, TouchableOpacity, Platform } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, ShoppingBag, Package, ShieldAlert } from 'lucide-react-native';

import { useSession } from '../providers/SessionProvider';
import { useTenant } from '../providers/TenantProvider';

import Login from '../screens/Login';
import { TenantSelectScreen } from '../screens/tenant/TenantSelectScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { GuardiaoScreen } from '../screens/GuardiaoScreen';
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
  const { activeTenant, isSuperAdmin } = useTenant();
  
  const isAdmin =
    isSuperAdmin ||
    activeTenant?.role === 'admin' ||
    activeTenant?.role === 'manager' ||
    activeTenant?.role === 'owner';

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
        tabBarActiveTintColor: activeTenant?.neon_primary || '#A3FF47',
        tabBarInactiveTintColor: '#4B5563',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      {isAdmin && (
        <Tab.Screen
          name="Guardiao"
          component={GuardiaoScreen}
          options={{
            tabBarLabel: 'Guardião',
            tabBarIcon: ({ color, size }) => <ShieldAlert color={color} size={size} />,
          }}
        />
      )}

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

      {activeTenant && (
        <Tab.Screen
          name="TenantLogo"
          component={View} // Dummy component
          options={{
            tabBarButton: (props) => {
              const primaryColor = activeTenant.primary_color || '#A3FF47';
              console.log("[DEBUG] activeTenant logo_url:", activeTenant.logo_url);
              // Filter out delayLongPress which has a TS mismatch, and destructure style
              const { delayLongPress, style, ...restProps } = props as any;
              
              return (
                <TouchableOpacity 
                  {...restProps} 
                  activeOpacity={0.8}
                  style={[style, {
                    flex: 0,
                    width: 70, // Fixed width prevents squishing other tabs
                    top: Platform.OS === 'ios' ? -15 : -20,
                    justifyContent: 'center',
                    alignItems: 'center',
                    ...Platform.select({
                      ios: {
                        shadowColor: primaryColor,
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.6,
                        shadowRadius: 10,
                      },
                      android: {
                        elevation: 10,
                        shadowColor: primaryColor,
                      }
                    })
                  }]}
                >
                  <View style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: '#FFFFFF',
                    borderWidth: 2,
                    borderColor: primaryColor,
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden',
                    padding: 4,
                  }}>
                    {activeTenant.logo_url ? (
                      <Image 
                        source={{ uri: activeTenant.logo_url }} 
                        style={{ width: '100%', height: '100%', resizeMode: 'contain' }} 
                      />
                    ) : (
                      <View style={{ width: 30, height: 30, backgroundColor: primaryColor, borderRadius: 15 }} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            }
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

      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Tarefas',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
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
