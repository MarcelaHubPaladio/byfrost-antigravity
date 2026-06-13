import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { X, MapPin, LocateFixed } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useTenant } from '../../providers/TenantProvider';

export function NewLeadScreen() {
  const navigation = useNavigation();
  const { activeTenant } = useTenant();
  const neon = activeTenant?.neon_primary || '#A3FF47';
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('+55');
  const [email, setEmail] = useState('');
  
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  const handleGetLocation = async () => {
    setLoadingLocation(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Precisamos de acesso à sua localização para usar o GPS.');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
    } catch (e: any) {
      Alert.alert('Erro', 'Não foi possível obter a localização.');
    } finally {
      setLoadingLocation(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Novo lead</Text>
            <Text style={styles.headerSub}>Cria um lead no CRM ativo.</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <X color="#9CA3AF" size={24} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.formContainer}>
          {/* Nome */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>NOME</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Maria Souza"
              placeholderTextColor="#6B7280"
              value={name}
              onChangeText={setName}
            />
          </View>

          {/* WhatsApp */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>WHATSAPP</Text>
            <TextInput
              style={styles.input}
              placeholder="+55"
              placeholderTextColor="#6B7280"
              keyboardType="phone-pad"
              value={whatsapp}
              onChangeText={setWhatsapp}
            />
            <Text style={styles.helpText}>Aceita com ou sem +55 (DDDs brasileiros).</Text>
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>EMAIL (OPCIONAL)</Text>
            <TextInput
              style={styles.input}
              placeholder="maria@exemplo.com"
              placeholderTextColor="#6B7280"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          {/* Localização (Placeholder) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>LOCALIZAÇÃO DO LEAD</Text>
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapHeader}>
                <View style={styles.mapHeaderLeft}>
                  <MapPin color="#6B7280" size={16} />
                  <Text style={styles.mapHeaderText}>Mova o pin ou clique no mapa</Text>
                </View>
                <TouchableOpacity style={styles.gpsBtn} onPress={handleGetLocation}>
                  {loadingLocation ? (
                    <ActivityIndicator size="small" color="#374151" />
                  ) : (
                    <>
                      <LocateFixed color="#374151" size={16} />
                      <Text style={styles.gpsBtnText}>GPS</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.mapVisual}>
                {location ? (
                  <>
                    <Text style={[styles.mapVisualText, { color: '#059669', marginBottom: 4 }]}>Localização Encontrada!</Text>
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>
                      Lat: {location.coords.latitude.toFixed(6)}
                    </Text>
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>
                      Lon: {location.coords.longitude.toFixed(6)}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.mapVisualText}>[ Mapa Interativo ]</Text>
                )}
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.createBtn, { backgroundColor: neon }]} onPress={() => {
            console.log('Create lead', { name, whatsapp, email, location });
            navigation.goBack();
          }}>
            <Text style={styles.createBtnText}>Criar lead</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  formContainer: {
    flex: 1,
    padding: 24,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9CA3AF',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    fontSize: 16,
    color: '#F9FAFB',
    backgroundColor: '#1A1A1A',
  },
  helpText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 6,
  },
  mapPlaceholder: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    overflow: 'hidden',
  },
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
    backgroundColor: '#1A1A1A',
  },
  mapHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapHeaderText: {
    fontSize: 14,
    color: '#D1D5DB',
    fontWeight: '500',
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  gpsBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#D1D5DB',
  },
  mapVisual: {
    height: 120,
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapVisualText: {
    color: '#4B5563',
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#9CA3AF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  createBtn: {
    flex: 2,
    backgroundColor: '#A3FF47',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  createBtnText: {
    color: '#000000',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
