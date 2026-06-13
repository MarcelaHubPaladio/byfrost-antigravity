import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { M30ClientHomeScreen } from '../screens/m30/M30ClientHomeScreen';
import { Alert, TouchableOpacity } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';

const Stack = createNativeStackNavigator();

export function M30ClientNavigator() {
  const nav = useNavigation();

  const handleLogout = async () => {
    Alert.alert("Sair", "Tem certeza que deseja sair?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sair", style: "destructive", onPress: async () => {
        await supabase.auth.signOut();
      }}
    ]);
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0A0A0A' },
        headerTintColor: '#F9FAFB',
        headerTitleStyle: { fontWeight: '600' },
        headerRight: () => (
          <TouchableOpacity onPress={handleLogout} style={{ marginRight: 16, padding: 8 }}>
            <LogOut size={24} color="#EF4444" />
          </TouchableOpacity>
        )
      }}
    >
      <Stack.Screen 
        name="M30ClientHome" 
        component={M30ClientHomeScreen} 
        options={{ title: 'Meus Entregáveis (M30)' }} 
      />
    </Stack.Navigator>
  );
}
