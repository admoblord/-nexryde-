import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useAppStore } from '@/src/store/appStore';

const { width, height } = Dimensions.get('window');

// Colors based on NEXRYDE logo
const COLORS = {
  background: '#0D1420',
  primary: '#19253F',
  surface: '#19253F',
  surfaceLight: '#243654',
  green: '#3AD173',
  greenLight: '#80EE50',
  greenSoft: 'rgba(58, 209, 115, 0.15)',
  blue: '#3A8CD1',
  blueDark: '#1A5AA6',
  blueSoft: 'rgba(58, 140, 209, 0.15)',
  white: '#FFFFFF',
  textSecondary: '#A8B8D0',
  textMuted: '#6B7A94',
  gray700: '#2D3748',
  google: '#4285F4',
  googleSoft: 'rgba(66, 133, 244, 0.15)',
};

// Emergent Auth URL
const EMERGENT_AUTH_BASE = 'https://auth.emergentagent.com';

// Backend URL - HARDCODED for reliability
const BACKEND_URL = 'https://rideapp-admin-1.preview.emergentagent.com';

// Warm up WebBrowser for faster auth
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { setPhone: storePhone, setUser, setIsAuthenticated } = useAppStore();
  
  // CRITICAL: Ref to prevent double processing of session_id
  const isProcessingSession = useRef(false);
  const processedSessionIds = useRef<Set<string>>(new Set());

  const handleContinue = async () => {
    if (phone.length < 10) return;
    setLoading(true);
    storePhone(phone);
    
    const backendUrl = BACKEND_URL;
    console.log('=== Phone Login Started ===');
    console.log('BACKEND_URL:', backendUrl);
    console.log('Phone:', `+234${phone}`);
    
    try {
      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(`${backendUrl}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+234${phone}` }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);
      
      if (response.ok) {
        console.log('OTP sent successfully, navigating to verify screen');
        
        // Store OTP data for verify screen to access
        const otpData = {
          phone: phone,
          pin_id: data.pin_id || '',
          provider: data.provider || 'mock',
          mock_otp: data.otp || ''
        };
        
        // Store in app state for the verify screen
        storePhone(phone);
        
        // Reset loading BEFORE navigation
        setLoading(false);
        
        // Use simple object-based navigation (works better with expo-router 5.x)
        router.replace({
          pathname: '/(auth)/verify',
          params: otpData
        });
      } else {
        Alert.alert('Error', data.detail || 'Failed to send OTP');
        setLoading(false);
      }
    } catch (error: any) {
      console.error('OTP Error:', error);
      if (error.name === 'AbortError') {
        Alert.alert('Timeout', 'Request took too long. Please check your internet connection and try again.');
      } else {
        Alert.alert('Error', error.message || 'Failed to send OTP. Please try again.');
      }
      setLoading(false);
    }
  };

  // Extract session_id from URL (supports both hash and query params)
  const extractSessionId = (url: string): string | null => {
    try {
      console.log('Extracting session_id from URL:', url);
      
      // Method 1: Check hash fragment (#session_id=...)
      if (url.includes('#')) {
        const hashPart = url.split('#')[1];
        if (hashPart && hashPart.includes('session_id')) {
          const params = new URLSearchParams(hashPart);
          const sessionId = params.get('session_id');
          if (sessionId) {
            console.log('Found session_id in hash');
            return decodeURIComponent(sessionId);
          }
        }
      }
      
      // Method 2: Check query params (?session_id=... or &session_id=...)
      if (url.includes('session_id=')) {
        // Handle URLs like exp://...?session_id=xxx or exp://...&session_id=xxx
        const match = url.match(/[?&]session_id=([^&#]+)/);
        if (match && match[1]) {
          console.log('Found session_id in query params');
          return decodeURIComponent(match[1]);
        }
      }
      
      console.log('No session_id found in URL');
      return null;
    } catch (error) {
      console.error('Error extracting session_id:', error);
      return null;
    }
  };

  // Process Google auth with session_id - with duplicate protection
  const processGoogleAuth = async (sessionId: string): Promise<boolean> => {
    // CRITICAL: Check if we've already processed this session_id
    if (processedSessionIds.current.has(sessionId)) {
      console.log('Session already processed, skipping');
      return false;
    }
    
    // CRITICAL: Check if we're currently processing a session
    if (isProcessingSession.current) {
      console.log('Already processing a session, skipping');
      return false;
    }
    
    // Mark as processing
    isProcessingSession.current = true;
    processedSessionIds.current.add(sessionId);
    
    try {
      console.log('Processing Google auth with session_id:', sessionId.substring(0, 15) + '...');
      console.log('Using backend URL:', BACKEND_URL);
      
      const response = await fetch(`${BACKEND_URL}/api/auth/google/exchange`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId }),
      });
      
      console.log('Backend response status:', response.status);
      
      // Check if response is ok before parsing
      const contentType = response.headers.get('content-type');
      console.log('Response content-type:', contentType);
      
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Response is not JSON. Content-Type:', contentType);
        const textResponse = await response.text();
        console.error('Raw response:', textResponse.substring(0, 200));
        Alert.alert('Error', 'Server returned an unexpected response. Please try again.');
        return false;
      }
      
      let data;
      try {
        const responseText = await response.text();
        console.log('Response text length:', responseText.length);
        
        if (!responseText || responseText.trim() === '') {
          console.error('Empty response from server');
          Alert.alert('Error', 'Server returned empty response. Please try again.');
          return false;
        }
        
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        Alert.alert('Error', 'Could not process server response. Please try again.');
        return false;
      }
      
      if (!response.ok) {
        const errorMessage = data.detail || data.message || 'Authentication failed';
        console.error('Auth error:', errorMessage);
        Alert.alert('Sign In Failed', errorMessage);
        return false;
      }
      
      if (data.is_new_user) {
        // New user - go to registration with Google data
        console.log('New user, redirecting to register');
        router.push({
          pathname: '/(auth)/register',
          params: {
            email: data.google_data?.email || '',
            name: data.google_data?.name || '',
            picture: data.google_data?.picture || '',
            google_id: data.google_data?.google_id || '',
            auth_type: 'google'
          }
        });
      } else {
        // Existing user - log them in
        console.log('Existing user, logging in');
        setUser(data.user);
        setIsAuthenticated(true);
        
        if (data.user.role === 'driver') {
          router.replace('/(driver-tabs)/driver-home');
        } else {
          router.replace('/(rider-tabs)/rider-home');
        }
      }
      
      return true;
    } catch (error: any) {
      console.error('Google auth error:', error);
      
      // Check for network errors
      if (error.message?.includes('Network request failed')) {
        Alert.alert('Network Error', 'Please check your internet connection and try again.');
      } else {
        Alert.alert('Error', 'Failed to complete sign in. Please try again.');
      }
      return false;
    } finally {
      isProcessingSession.current = false;
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading) return;
    
    setGoogleLoading(true);
    
    try {
      // Create redirect URL based on platform
      let redirectUrl: string;
      if (Platform.OS === 'web') {
        redirectUrl = `${window.location.origin}/`;
      } else {
        // Mobile: Use deep link scheme
        redirectUrl = Linking.createURL('/');
      }
      
      console.log('=== Google Sign-In Started ===');
      console.log('Platform:', Platform.OS);
      console.log('Redirect URL:', redirectUrl);
      
      const authUrl = `${EMERGENT_AUTH_BASE}/?redirect=${encodeURIComponent(redirectUrl)}`;
      console.log('Auth URL:', authUrl);
      
      if (Platform.OS === 'web') {
        // Web: Direct redirect
        window.location.href = authUrl;
        return; // Don't reset loading on web redirect
      }
      
      // Mobile: Use WebBrowser
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      
      console.log('WebBrowser result type:', result.type);
      
      if (result.type === 'success' && result.url) {
        console.log('Success! Callback URL:', result.url);
        
        const sessionId = extractSessionId(result.url);
        
        if (sessionId) {
          const success = await processGoogleAuth(sessionId);
          if (!success) {
            console.log('Session processing failed or was duplicate');
          }
        } else {
          console.error('No session_id found in callback URL');
          Alert.alert('Error', 'Could not get session from Google. Please try again.');
        }
      } else if (result.type === 'cancel') {
        console.log('User cancelled sign-in');
      } else if (result.type === 'dismiss') {
        console.log('Sign-in dismissed');
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      Alert.alert('Error', error.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  // Handle web platform only - check for session_id on page load
  useEffect(() => {
    if (Platform.OS === 'web') {
      const checkWebSession = async () => {
        const hash = window.location.hash;
        if (hash && hash.includes('session_id=')) {
          const sessionId = extractSessionId(window.location.href);
          if (sessionId) {
            // Clean URL immediately
            window.history.replaceState(null, '', window.location.pathname);
            setGoogleLoading(true);
            await processGoogleAuth(sessionId);
            setGoogleLoading(false);
          }
        }
      };
      checkWebSession();
    }
    // NOTE: We do NOT check Linking.getInitialURL() on mobile here
    // because WebBrowser.openAuthSessionAsync handles the callback directly
    // Adding that check would cause DOUBLE processing of the session_id!
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Decorative Glows */}
      <View style={[styles.glow, { top: 80, left: 30, backgroundColor: COLORS.green }]} />
      <View style={[styles.glow, { top: 200, right: 40, backgroundColor: COLORS.blue, width: 60, height: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header Section */}
            <View style={styles.header}>
              {/* Logo */}
              <View style={styles.logoContainer}>
                <LinearGradient
                  colors={[COLORS.greenLight, COLORS.green]}
                  style={styles.logoLeft}
                />
                <LinearGradient
                  colors={[COLORS.blue, COLORS.blueDark]}
                  style={styles.logoRight}
                />
                <View style={styles.roadLine}>
                  <View style={styles.roadDash} />
                  <View style={styles.roadDash} />
                </View>
              </View>
              
              <Text style={styles.welcomeText}>Welcome to</Text>
              <View style={styles.brandRow}>
                <Text style={styles.brandNex}>NEX</Text>
                <Text style={styles.brandRyde}>RYDE</Text>
              </View>
              <Text style={styles.subtitleText}>Nigeria's Premium Ride Experience</Text>
            </View>

            {/* Login Form */}
            <View style={styles.formSection}>
              <Text style={styles.formTitle}>Enter your phone number</Text>
              
              <View style={styles.inputContainer}>
                <View style={styles.prefixContainer}>
                  <Text style={styles.flag}>🇳🇬</Text>
                  <Text style={styles.prefixText}>+234</Text>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="801 234 5678"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                  maxLength={11}
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.continueButton,
                  phone.length >= 10 && styles.continueButtonActive
                ]}
                onPress={handleContinue}
                disabled={phone.length < 10 || loading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={phone.length >= 10 
                    ? [COLORS.greenLight, COLORS.green, COLORS.blue]
                    : [COLORS.gray700, COLORS.gray700]
                  }
                  style={styles.buttonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <>
                      <Ionicons name="chatbubble" size={20} color={phone.length >= 10 ? COLORS.primary : COLORS.textMuted} style={{ marginRight: 8 }} />
                      <Text style={[
                        styles.continueButtonText,
                        phone.length >= 10 && styles.continueButtonTextActive
                      ]}>
                        Continue with SMS
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* OR Divider */}
              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              {/* Google Sign-In Button */}
              <TouchableOpacity
                style={styles.googleButton}
                onPress={handleGoogleSignIn}
                disabled={googleLoading}
                activeOpacity={0.9}
              >
                <View style={styles.googleButtonContent}>
                  {googleLoading ? (
                    <ActivityIndicator color={COLORS.google} />
                  ) : (
                    <>
                      <View style={styles.googleIconContainer}>
                        <Ionicons name="logo-google" size={20} color={COLORS.google} />
                      </View>
                      <Text style={styles.googleButtonText}>Continue with Google</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>

              <Text style={styles.termsText}>
                By continuing, you agree to our{' '}
                <Text style={styles.linkText}>Terms of Service</Text> and{' '}
                <Text style={styles.linkText}>Privacy Policy</Text>
              </Text>
            </View>

            {/* Features */}
            <View style={styles.features}>
              <FeatureCard
                icon="shield-checkmark"
                title="Zero Commission"
                subtitle="Drivers keep 100% of earnings"
                color={COLORS.green}
                bgColor={COLORS.greenSoft}
              />
              <FeatureCard
                icon="location"
                title="Premium Safety"
                subtitle="Verified drivers & live tracking"
                color={COLORS.blue}
                bgColor={COLORS.blueSoft}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const FeatureCard = ({ 
  icon, 
  title, 
  subtitle, 
  color,
  bgColor,
}: { 
  icon: string; 
  title: string; 
  subtitle: string;
  color: string;
  bgColor: string;
}) => (
  <View style={styles.featureCard}>
    <View style={[styles.featureIconContainer, { backgroundColor: bgColor }]}>
      <Ionicons name={icon as any} size={24} color={color} />
    </View>
    <View style={styles.featureContent}>
      <Text style={styles.featureTitle}>{title}</Text>
      <Text style={styles.featureSubtitle}>{subtitle}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  glow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.15,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    paddingTop: 32,
    marginBottom: 24,
  },
  logoContainer: {
    width: 60,
    height: 60,
    position: 'relative',
    marginBottom: 16,
  },
  logoLeft: {
    position: 'absolute',
    left: 3,
    top: 0,
    width: 24,
    height: 60,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    transform: [{ skewX: '-8deg' }],
  },
  logoRight: {
    position: 'absolute',
    right: 3,
    top: 0,
    width: 24,
    height: 60,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    transform: [{ skewX: '8deg' }],
  },
  roadLine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -2,
    top: 10,
    bottom: 10,
    width: 3,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  roadDash: {
    width: 3,
    height: 8,
    backgroundColor: COLORS.white,
    borderRadius: 1,
  },
  welcomeText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNex: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 2,
  },
  brandRyde: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.green,
    letterSpacing: 2,
  },
  subtitleText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  formSection: {
    marginBottom: 24,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginBottom: 16,
    overflow: 'hidden',
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
    backgroundColor: COLORS.surfaceLight,
    borderRightWidth: 1,
    borderRightColor: COLORS.surface,
  },
  flag: {
    fontSize: 24,
    marginRight: 8,
  },
  prefixText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 17,
    color: COLORS.white,
    letterSpacing: 1,
  },
  continueButton: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  continueButtonActive: {
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  continueButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  continueButtonTextActive: {
    color: COLORS.primary,
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  orText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 16,
  },
  googleButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginBottom: 16,
  },
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
  },
  googleIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.googleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
  },
  termsText: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  linkText: {
    color: COLORS.green,
    fontWeight: '600',
  },
  features: {
    gap: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  featureSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
