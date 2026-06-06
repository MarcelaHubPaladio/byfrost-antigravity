import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';

// Completes the auth session if the app returns from the browser
WebBrowser.maybeCompleteAuthSession();

type Mode = 'signin' | 'signup' | 'forgot';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('signin');

  async function signInWithEmail() {
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) {
      Alert.alert('Erro', 'Informe um email válido.');
      return;
    }
    if (!password) {
      Alert.alert('Erro', 'Informe sua senha.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: e,
      password: password,
    });

    if (error) {
      Alert.alert('Falha no login', error.message);
    }
    setLoading(false);
  }

  async function signInWithGoogle() {
    setLoading(true);
    
    // Let's hardcode the native scheme to test if Supabase is rejecting exp:// specifically
    const redirectUrl = 'byfrost://auth/callback';

    // Just to help debugging, let's print it to console
    console.log("Redirect URL for Supabase:", redirectUrl);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: true, // We will handle the browser redirect ourselves
        queryParams: {
          prompt: 'consent', // Forces Google to show the account chooser
        },
      },
    });

    console.log("Supabase Auth URL:", data?.url);

    if (error) {
      Alert.alert('Erro no login', error.message);
      setLoading(false);
      return;
    }

    if (data?.url) {
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
      
      if (res.type === 'success') {
        const { url } = res;
        
        // Use expo-auth-session's QueryParams to reliably parse hash fragments from Supabase
        const { params } = require('expo-auth-session/build/QueryParams').getQueryParams(url);
        
        const access_token = params?.access_token;
        const refresh_token = params?.refresh_token;
        
        if (access_token && refresh_token) {
          await supabase.auth.setSession({
            access_token,
            refresh_token
          });
        }
      }
    }
    
    setLoading(false);
  }

  async function signUpWithEmail() {
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) return Alert.alert('Erro', 'Informe um email válido.');
    if (password.length < 8) return Alert.alert('Erro', 'A senha deve ter pelo menos 8 caracteres.');
    if (password !== confirm) return Alert.alert('Erro', 'As senhas não conferem.');

    setLoading(true);
    const {
      data: { session },
      error,
    } = await supabase.auth.signUp({
      email: e,
      password: password,
    });

    if (error) {
      Alert.alert('Erro ao criar conta', error.message);
    } else if (!session) {
      Alert.alert('Sucesso', 'Verifique sua caixa de entrada para confirmar o e-mail!');
      setMode('signin');
      setPassword('');
      setConfirm('');
    }
    setLoading(false);
  }

  async function sendResetEmail() {
    const e = email.trim().toLowerCase();
    if (!e.includes('@')) return Alert.alert('Erro', 'Informe um email válido.');

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(e);
    if (error) {
      Alert.alert('Erro', error.message);
    } else {
      Alert.alert('Sucesso', 'Instruções enviadas para o seu e-mail!');
      setMode('signin');
      setPassword('');
      setConfirm('');
    }
    setLoading(false);
  }

  const handleSubmit = () => {
    if (mode === 'signin') signInWithEmail();
    else if (mode === 'signup') signUpWithEmail();
    else sendResetEmail();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>Painel Byfrost.ia</Text>
        </View>

        <Text style={styles.title}>Guardião do Negócio.</Text>
        <Text style={styles.subtitle}>
          Acesso por email e senha, com governança.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>
              {mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Recuperar senha'}
            </Text>
            <View style={styles.toggleGroup}>
              <TouchableOpacity onPress={() => setMode('signin')}>
                <Text style={[styles.toggleText, mode === 'signin' && styles.toggleTextActive]}>
                  entrar
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode('signup')}>
                <Text style={[styles.toggleText, mode === 'signup' && styles.toggleTextActive]}>
                  criar
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              onChangeText={(text) => setEmail(text)}
              value={email}
              placeholder="nome@empresa.com"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
          </View>

          {mode !== 'forgot' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Senha</Text>
              <TextInput
                style={styles.input}
                onChangeText={(text) => setPassword(text)}
                value={password}
                secureTextEntry={true}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                editable={!loading}
              />
              {mode === 'signin' && (
                <TouchableOpacity onPress={() => setMode('forgot')} style={styles.forgotButton}>
                  <Text style={styles.forgotText}>Esqueci minha senha</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {mode === 'signup' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirmar senha</Text>
              <TextInput
                style={styles.input}
                onChangeText={(text) => setConfirm(text)}
                value={confirm}
                secureTextEntry={true}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                editable={!loading}
              />
            </View>
          )}

          <TouchableOpacity
            style={styles.button}
            disabled={loading}
            onPress={handleSubmit}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'signin'
                  ? 'Entrar'
                  : mode === 'signup'
                  ? 'Criar conta'
                  : 'Enviar email'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.googleButton}
            disabled={loading}
            onPress={signInWithGoogle}
          >
            <Text style={styles.googleButtonText}>Entrar com Google</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 24,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6', // Accent fallback
    marginRight: 8,
  },
  badgeText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  title: {
    fontSize: 36,
    fontWeight: '600',
    color: '#0f172a',
    letterSpacing: -1,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
    marginBottom: 32,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  toggleTextActive: {
    color: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  forgotButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  forgotText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    paddingHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '600',
  },
});
