import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function PackageDeliveryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAppStore();
  
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [packageDescription, setPackageDescription] = useState('');
  const [packageSize, setPackageSize] = useState('small');
  const [loading, setLoading] = useState(false);
  const [deliveryResult, setDeliveryResult] = useState<any>(null);
  
  const pickup = {
    lat: parseFloat(params.pickupLat as string) || 6.4281,
    lng: parseFloat(params.pickupLng as string) || 3.4219,
    address: params.pickupAddress as string || 'Pickup Location'
  };
  
  const dropoff = {
    lat: parseFloat(params.dropoffLat as string) || 6.4355,
    lng: parseFloat(params.dropoffLng as string) || 3.4567,
    address: params.dropoffAddress as string || 'Dropoff Location'
  };

  const sizes = [
    { id: 'small', name: 'Small', desc: 'Envelope, documents', icon: 'document-text', price: 0 },
    { id: 'medium', name: 'Medium', desc: 'Small box, laptop', icon: 'cube', price: 200 },
    { id: 'large', name: 'Large', desc: 'Large box, luggage', icon: 'cube-outline', price: 500 },
  ];

  const requestDelivery = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Please login first');
      return;
    }
    
    if (!recipientName || !recipientPhone) {
      Alert.alert('Error', 'Please enter recipient details');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/delivery/request?sender_id=${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup_lat: pickup.lat,
          pickup_lng: pickup.lng,
          pickup_address: pickup.address,
          dropoff_lat: dropoff.lat,
          dropoff_lng: dropoff.lng,
          dropoff_address: dropoff.address,
          recipient_name: recipientName,
          recipient_phone: recipientPhone,
          package_description: packageDescription || 'Package',
          package_size: packageSize
        })
      });
      
      const data = await res.json();
      if (data.delivery_id) {
        setDeliveryResult(data);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to request delivery');
    }
    setLoading(false);
  };

  if (deliveryResult) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />
        
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={80} color="#00E676" />
            </View>
            <Text style={styles.successTitle}>Delivery Requested!</Text>
            <Text style={styles.successSubtitle}>Looking for a driver...</Text>
            
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Pickup Code</Text>
              <Text style={styles.codeValue}>{deliveryResult.pickup_code}</Text>
              <Text style={styles.codeHint}>Give this to the driver at pickup</Text>
            </View>
            
            <View style={styles.fareCard}>
              <Text style={styles.fareLabel}>Delivery Fee</Text>
              <Text style={styles.fareValue}>₦{deliveryResult.fare?.toLocaleString()}</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.trackButton}
              onPress={() => router.replace('/')}
            >
              <LinearGradient
                colors={['#6366F1', '#8B5CF6']}
                style={styles.trackGradient}
              >
                <Ionicons name="location" size={20} color="#FFFFFF" />
                <Text style={styles.trackText}>Track Delivery</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#1E293B']} style={StyleSheet.absoluteFill} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send Package</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Route Card */}
          <View style={styles.routeCard}>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#00E676' }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Pickup from</Text>
                <Text style={styles.routeText} numberOfLines={1}>{pickup.address}</Text>
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: '#EF4444' }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Deliver to</Text>
                <Text style={styles.routeText} numberOfLines={1}>{dropoff.address}</Text>
              </View>
            </View>
          </View>

          {/* Recipient Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recipient Details</Text>
            
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="Recipient Name"
                placeholderTextColor="#64748B"
                value={recipientName}
                onChangeText={setRecipientName}
              />
            </View>
            
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="Phone Number"
                placeholderTextColor="#64748B"
                value={recipientPhone}
                onChangeText={setRecipientPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Package Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Package Details</Text>
            
            <View style={styles.inputContainer}>
              <Ionicons name="cube-outline" size={20} color="#64748B" />
              <TextInput
                style={styles.input}
                placeholder="What are you sending? (optional)"
                placeholderTextColor="#64748B"
                value={packageDescription}
                onChangeText={setPackageDescription}
              />
            </View>
          </View>

          {/* Package Size */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Package Size</Text>
            
            <View style={styles.sizeOptions}>
              {sizes.map(size => (
                <TouchableOpacity
                  key={size.id}
                  style={[
                    styles.sizeCard,
                    packageSize === size.id && styles.sizeCardActive
                  ]}
                  onPress={() => setPackageSize(size.id)}
                >
                  <View style={[
                    styles.sizeIcon,
                    packageSize === size.id && styles.sizeIconActive
                  ]}>
                    <Ionicons 
                      name={size.icon as any} 
                      size={24} 
                      color={packageSize === size.id ? '#FFFFFF' : '#6366F1'} 
                    />
                  </View>
                  <Text style={[
                    styles.sizeName,
                    packageSize === size.id && styles.sizeNameActive
                  ]}>{size.name}</Text>
                  <Text style={styles.sizeDesc}>{size.desc}</Text>
                  {size.price > 0 && (
                    <Text style={styles.sizePrice}>+₦{size.price}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Request Button */}
          <TouchableOpacity 
            style={styles.requestButton} 
            onPress={requestDelivery}
            disabled={loading}
          >
            <LinearGradient
              colors={['#F59E0B', '#D97706']}
              style={styles.requestGradient}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="paper-plane" size={20} color="#FFFFFF" />
                  <Text style={styles.requestText}>Request Delivery</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  content: { flex: 1, padding: 16 },
  routeCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  routeDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  routeInfo: { flex: 1 },
  routeLabel: { fontSize: 12, color: '#94A3B8' },
  routeText: { fontSize: 15, color: '#FFFFFF', fontWeight: '500', marginTop: 2 },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginLeft: 5,
    marginVertical: 4,
  },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 12 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#FFFFFF',
  },
  sizeOptions: { flexDirection: 'row', gap: 10 },
  sizeCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sizeCardActive: {
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99,102,241,0.1)',
  },
  sizeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sizeIconActive: { backgroundColor: '#6366F1' },
  sizeName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  sizeNameActive: { color: '#A5B4FC' },
  sizeDesc: { fontSize: 11, color: '#64748B', textAlign: 'center', marginTop: 2 },
  sizePrice: { fontSize: 12, color: '#F59E0B', fontWeight: '600', marginTop: 4 },
  requestButton: { borderRadius: 16, overflow: 'hidden' },
  requestGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  requestText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  // Success screen
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  successIcon: { marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  successSubtitle: { fontSize: 15, color: '#94A3B8', marginTop: 8 },
  codeCard: {
    backgroundColor: 'rgba(0,230,118,0.1)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 32,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.3)',
  },
  codeLabel: { fontSize: 13, color: '#94A3B8' },
  codeValue: { fontSize: 36, fontWeight: '800', color: '#00E676', letterSpacing: 8, marginTop: 8 },
  codeHint: { fontSize: 12, color: '#64748B', marginTop: 8 },
  fareCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  fareLabel: { fontSize: 14, color: '#94A3B8' },
  fareValue: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  trackButton: { borderRadius: 16, overflow: 'hidden', marginTop: 32, width: '100%' },
  trackGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  trackText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
