import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import Login from './src/screens/Login';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session on initial load
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f172a" />
      </View>
    );
  }

  // If no active session, show the login screen
  if (!session) {
    return (
      <>
        <StatusBar style="dark" />
        <Login />
      </>
    );
  }

  // If logged in, show a basic Dashboard/Home
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.welcomeText}>
        Bem-vindo!{'\n'}
        <Text style={styles.emailText}>{session.user.email}</Text>
      </Text>
      
      <TouchableOpacity 
        style={styles.logoutButton}
        onPress={() => supabase.auth.signOut()}
      >
        <Text style={styles.logoutButtonText}>Sair (Logout)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 32,
  },
  emailText: {
    fontSize: 16,
    color: '#475569',
    fontWeight: '400',
  },
  logoutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  logoutButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 14,
  },
});
