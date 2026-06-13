import React from 'react';
import { View, Image, TouchableOpacity, Platform } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, ShoppingBag, Package, ShieldAlert, User, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '../providers/SessionProvider';
import { useTenant } from '../providers/TenantProvider';
import { CustomTabBar } from '../components/CustomTabBar';

import Login from '../screens/Login';
import { TenantSelectScreen } from '../screens/tenant/TenantSelectScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { GuardiaoScreen } from '../screens/GuardiaoScreen';
import { CrmScreen } from '../screens/crm/CrmScreen';
import { CaseDetailScreen } from '../screens/crm/CaseDetailScreen';
import { OperacaoM30CaseScreen } from '../screens/m30/OperacaoM30CaseScreen';
import { NewOperacaoM30CaseScreen } from '../screens/m30/NewOperacaoM30CaseScreen';
import { NewLeadScreen } from '../screens/crm/NewLeadScreen';
import { OrdersScreen } from '../screens/orders/OrdersScreen';
import { NewOrderScreen } from '../screens/orders/NewOrderScreen';
import { OrderDetailScreen } from '../screens/orders/OrderDetailScreen';
import { ClientesM30Screen } from '../screens/m30/ClientesM30Screen';

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

/** Checks if current active tenant is M30 */
function isM30Tenant(tenant: any): boolean {
  if (!tenant) return false;
  const slug = (tenant.slug ?? '').toLowerCase();
  const name = (tenant.name ?? '').toLowerCase();
  return (
    slug === 'm30' ||
    slug.includes('m30') ||
    name.includes('m30') ||
    tenant.modules_json?.operacao_m30 === true
  );
}

import { Alert, ActionSheetIOS } from 'react-native';
import { supabase } from '../lib/supabase';

function AppTabs() {
  const { activeTenant, isSuperAdmin } = useTenant();
  const { user } = useSession();
  
  const isAdmin =
    isSuperAdmin ||
    activeTenant?.role === 'admin' ||
    activeTenant?.role === 'manager' ||
    activeTenant?.role === 'owner';

  const insets = useSafeAreaInsets();

  const handleChangePassword = async () => {
    if (!user?.email) {
      Alert.alert('Erro', 'Usuário não tem e-mail associado.');
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email);
      if (error) throw error;
      Alert.alert('Sucesso', 'Um e-mail de redefinição de senha foi enviado.');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao enviar e-mail.');
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e: any) {
      console.warn("Sign out error", e);
    }
  };

  const openUserMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancelar', 'Trocar Senha', 'Sair'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) handleChangePassword();
          else if (buttonIndex === 2) handleSignOut();
        }
      );
    } else {
      Alert.alert('Opções do Usuário', '', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Trocar Senha', onPress: handleChangePassword },
        { text: 'Sair', onPress: handleSignOut, style: 'destructive' },
      ]);
    }
  };

  const hasCrm = activeTenant?.modules_json?.crm !== false;
  const hasOrders = isAgroforteTenant(activeTenant);
  const hasM30 = isM30Tenant(activeTenant);

  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {isAdmin && <Tab.Screen name="Guardiao" component={GuardiaoScreen} />}
      {hasCrm && <Tab.Screen name="CRM" component={CrmScreen} />}
      {hasM30 && <Tab.Screen name="ClientesM30" component={ClientesM30Screen} />}
      {hasOrders && <Tab.Screen name="Orders" component={OrdersScreen} />}
      <Tab.Screen name="Home" component={HomeScreen} />
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
              <Stack.Screen name="OperacaoM30Case" component={OperacaoM30CaseScreen} />
              <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
            </Stack.Group>
            <Stack.Group screenOptions={{ presentation: 'modal' }}>
              <Stack.Screen name="NewLead" component={NewLeadScreen} />
              <Stack.Screen name="NewOperacaoM30Case" component={NewOperacaoM30CaseScreen} />
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
