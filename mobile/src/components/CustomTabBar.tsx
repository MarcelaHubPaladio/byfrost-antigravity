import React, { useState } from 'react';
import { View, TouchableOpacity, Text, Image, Platform, ActionSheetIOS, Alert } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldAlert, Package, Users, ShoppingBag, Home, User, Menu } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useTenant } from '../providers/TenantProvider';
import { useSession } from '../providers/SessionProvider';

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { activeTenant, isSuperAdmin, tenants, clearActiveTenant } = useTenant();
  const { user } = useSession();

  const isAdmin = isSuperAdmin || activeTenant?.role === 'admin' || activeTenant?.role === 'manager' || activeTenant?.role === 'owner';
  const hasCrm = activeTenant?.modules_json?.crm !== false;
  
  const isAgroforte = (activeTenant?.slug ?? '').toLowerCase().includes('agroforte') || (activeTenant?.name ?? '').toLowerCase().includes('agroforte') || activeTenant?.modules_json?.orders === true;
  const isM30 = (activeTenant?.slug ?? '').toLowerCase().includes('m30') || (activeTenant?.name ?? '').toLowerCase().includes('m30') || activeTenant?.modules_json?.operacao_m30 === true;

  const canSwitchTenant = isSuperAdmin || (tenants && tenants.length > 1);

  const handleChangePassword = async () => {
    if (!user?.email) return Alert.alert('Erro', 'Usuário não tem e-mail associado.');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email);
      if (error) throw error;
      Alert.alert('Sucesso', 'E-mail de redefinição de senha enviado.');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Falha ao enviar e-mail.');
    }
  };

  const handleSignOut = async () => {
    try { await supabase.auth.signOut(); } catch (e) {}
  };

  const openUserMenu = () => {
    const options = ['Cancelar', 'Trocar Senha'];
    if (canSwitchTenant) options.push('Trocar Workspace');
    options.push('Sair');

    const destructiveIndex = options.length - 1;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: destructiveIndex, cancelButtonIndex: 0 },
        (btnIdx) => { 
          const option = options[btnIdx];
          if (option === 'Trocar Senha') handleChangePassword(); 
          else if (option === 'Trocar Workspace') clearActiveTenant();
          else if (option === 'Sair') handleSignOut(); 
        }
      );
    } else {
      const alertOptions = [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Trocar Senha', onPress: handleChangePassword },
      ];
      if (canSwitchTenant) {
        alertOptions.push({ text: 'Trocar Workspace', onPress: clearActiveTenant });
      }
      alertOptions.push({ text: 'Sair', onPress: handleSignOut, style: 'destructive' });
      
      Alert.alert('Opções do Usuário', '', alertOptions as any);
    }
  };

  // Define all possible items
  const allItems = [];
  if (isAdmin) allItems.push({ name: 'Guardiao', label: 'Guardião', icon: ShieldAlert });
  if (hasCrm) allItems.push({ name: 'CRM', label: 'CRM', icon: Package });
  if (isM30) allItems.push({ name: 'ClientesM30', label: 'Clientes M30', icon: Users });
  if (isAgroforte) allItems.push({ name: 'Orders', label: 'Pedidos', icon: ShoppingBag });
  allItems.push({ name: 'Home', label: 'Tarefas', icon: Home });
  allItems.push({ name: 'UserMenu', label: 'Perfil', icon: User, isAction: true });

  const primaryColor = activeTenant?.primary_color || '#A3FF47';
  const neonColor = activeTenant?.neon_primary || '#A3FF47';

  // Layout logic
  let leftItems = [];
  let rightItems = [];
  let overflowItems = [];

  if (allItems.length <= 4) {
    leftItems = allItems.slice(0, 2);
    rightItems = allItems.slice(2, 4);
    // Pad with empty items if needed to maintain 2-1-2 structure
    while (leftItems.length < 2) leftItems.push(null);
    while (rightItems.length < 2) rightItems.push(null);
  } else {
    leftItems = allItems.slice(0, 2);
    rightItems = [allItems[2]];
    overflowItems = allItems.slice(3);
    rightItems.push({ name: 'OverflowMenu', label: 'Mais', icon: Menu, isOverflow: true });
  }

  const handlePress = (item: any) => {
    if (!item) return;
    if (item.isAction && item.name === 'UserMenu') {
      openUserMenu();
      return;
    }
    if (item.isOverflow) {
      const options = ['Cancelar', ...overflowItems.map(i => i.label)];
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options, cancelButtonIndex: 0 },
          (btnIdx) => {
            if (btnIdx > 0) {
              const selected = overflowItems[btnIdx - 1];
              handlePress(selected);
            }
          }
        );
      } else {
        Alert.alert('Menu', 'Selecione uma opção', [
          ...overflowItems.map(i => ({ text: i.label, onPress: () => handlePress(i) })),
          { text: 'Cancelar', style: 'cancel' }
        ]);
      }
      return;
    }
    navigation.navigate(item.name);
  };

  const renderTab = (item: any, index: number) => {
    if (!item) return <View key={`empty-${index}`} style={{ flex: 1, maxWidth: 90 }} />;
    const isFocused = state.routes[state.index].name === item.name;
    const Icon = item.icon;
    const color = isFocused ? neonColor : '#4B5563';

    return (
      <TouchableOpacity 
        key={item.name} 
        onPress={() => handlePress(item)} 
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', maxWidth: 90, paddingBottom: 4 }}
      >
        <Icon color={color} size={24} />
        <Text style={{ color, fontSize: 11, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>{item.label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#0A0A0A',
      borderTopColor: '#1A1A1A',
      borderTopWidth: 1,
      minHeight: 64 + Math.max(insets.bottom, 16),
      paddingBottom: Math.max(insets.bottom, 16),
      paddingTop: 8,
      paddingHorizontal: 24,
      justifyContent: 'center',
    }}>
      {leftItems.map((item, i) => renderTab(item, i))}

      <TouchableOpacity 
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Home')}
        style={{
          width: 70,
          top: Platform.OS === 'ios' ? -15 : -20,
          justifyContent: 'center',
          alignItems: 'center',
          ...Platform.select({
            ios: { shadowColor: primaryColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10 },
            android: { elevation: 10, shadowColor: primaryColor }
          })
        }}
      >
        <View style={{
          width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: primaryColor,
          justifyContent: 'center', alignItems: 'center', overflow: 'hidden', padding: 4,
        }}>
          {activeTenant?.logo_url ? (
            <Image source={{ uri: activeTenant.logo_url }} style={{ width: '100%', height: '100%', resizeMode: 'contain' }} />
          ) : (
            <View style={{ width: 30, height: 30, backgroundColor: primaryColor, borderRadius: 15 }} />
          )}
        </View>
      </TouchableOpacity>

      {rightItems.map((item, i) => renderTab(item, i + 2))}
    </View>
  );
}
