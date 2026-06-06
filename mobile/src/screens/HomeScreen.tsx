import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSession } from '../providers/SessionProvider';
import { useTenant } from '../providers/TenantProvider';
import { supabase } from '../lib/supabase';
import { LogOut } from 'lucide-react-native';

export function HomeScreen() {
  const { user } = useSession();
  const { activeTenant } = useTenant();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Home</Text>
      <Text style={styles.subtitle}>
        Logado como: {user?.email}
      </Text>
      <Text style={styles.tenant}>
        Ambiente: {activeTenant?.name ?? 'Nenhum'}
      </Text>
      
      <TouchableOpacity 
        style={styles.logoutButton} 
        onPress={() => supabase.auth.signOut()}
      >
        <LogOut size={20} color="#EF4444" />
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  tenant: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 32,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
});
