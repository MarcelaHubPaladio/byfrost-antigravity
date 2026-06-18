import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useNetwork } from './NetworkProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function GlobalNetworkIndicator() {
  const network = useNetwork();
  const insets = useSafeAreaInsets();
  
  if (network.isConnected) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top || 20 }]}>
      <View style={styles.banner}>
        <WifiOff size={14} color="#FFF" />
        <Text style={styles.text}>Você está sem conexão (Modo Offline)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  banner: {
    backgroundColor: '#EF4444', // Red color for offline
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    marginTop: 4,
  },
  text: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  }
});
