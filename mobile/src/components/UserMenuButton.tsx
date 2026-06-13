import React from 'react';
import { View, TouchableOpacity, ActionSheetIOS, Platform, Alert, StyleSheet } from 'react-native';
import { User } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useSession } from '../providers/SessionProvider';
import { useTenant } from '../providers/TenantProvider';

export function UserMenuButton() {
  const { user } = useSession();
  const { activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';

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

  const openMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancelar', 'Trocar Senha', 'Sair'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            handleChangePassword();
          } else if (buttonIndex === 2) {
            handleSignOut();
          }
        }
      );
    } else {
      Alert.alert(
        'Opções do Usuário',
        '',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Trocar Senha', onPress: handleChangePassword },
          { text: 'Sair', onPress: handleSignOut, style: 'destructive' },
        ]
      );
    }
  };

  return (
    <TouchableOpacity 
      style={[styles.button, { borderColor: neon }]} 
      onPress={openMenu}
    >
      <User size={18} color={neon} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
