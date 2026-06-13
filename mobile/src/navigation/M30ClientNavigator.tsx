import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { M30ClientHomeScreen } from '../screens/m30/M30ClientHomeScreen';
import { M30ClientReportsScreen } from '../screens/m30/M30ClientReportsScreen';
import { Alert, TouchableOpacity, View } from 'react-native';
import { LogOut, Package, BarChart3 } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { useTenant } from '../providers/TenantProvider';

const Tab = createBottomTabNavigator();

export function M30ClientNavigator() {
  const nav = useNavigation();
  const { activeTenant } = useTenant();
  
  const neonColor = activeTenant?.neon_primary || '#A3FF47';

  const handleLogout = async () => {
    Alert.alert("Sair", "Tem certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: async () => {
        await supabase.auth.signOut();
      }}
    ]);
  };

  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0A' },
        headerTintColor: '#F9FAFB',
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => (
          <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16, padding: 8 }}>
            <LogOut size={24} color="#EF4444" />
          </TouchableOpacity>
        ),
        tabBarStyle: {
          backgroundColor: '#0A0A0A',
          borderTopColor: '#1A1A1A',
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarActiveTintColor: neonColor,
        tabBarInactiveTintColor: '#4B5563',
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
