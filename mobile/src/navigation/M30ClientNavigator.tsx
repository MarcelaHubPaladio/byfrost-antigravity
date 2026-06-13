import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { M30ClientHomeScreen } from '../screens/m30/M30ClientHomeScreen';
import { M30ClientReportsScreen } from '../screens/m30/M30ClientReportsScreen';
import { Alert, TouchableOpacity, View } from 'react-native';
import { LogOut, Package, BarChart3 } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { useTenant } from '../providers/TenantProvider';
import { CustomTabBar } from '../components/CustomTabBar';

const Tab = createBottomTabNavigator();

export function M30ClientNavigator() {
  const nav = useNavigation();
  const { activeTenant } = useTenant();

  return (
    <Tab.Navigator
      tabBar={props => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0A' },
        headerTintColor: '#F9FAFB',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tab.Screen 
        name="M30ClientHome" 
        component={M30ClientHomeScreen} 
        options={{ 
          title: 'Entregáveis',
          tabBarIcon: ({ color, size }) => <Package color={color} size={size} />
        }} 
      />
      <Tab.Screen 
        name="M30ClientReports" 
        component={M30ClientReportsScreen} 
        options={{ 
          title: 'Relatórios',
          tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} />
        }} 
      />
    </Tab.Navigator>
  );
}
