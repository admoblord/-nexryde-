import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';

const PRIVACY_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 16px; color: #1a1a2e; line-height: 1.7; font-size: 15px; }
  h1 { color: #0D1420; border-bottom: 3px solid #22E180; padding-bottom: 12px; font-size: 22px; }
  h2 { color: #0D1420; margin-top: 28px; font-size: 17px; }
  .updated { color: #64748b; font-size: 13px; }
  ul { padding-left: 18px; }
</style>
</head>
<body>
<h1>NEXRYDE Privacy Policy</h1>
<p class="updated">Last updated: March 14, 2026</p>
<p>NEXRYDE ("we", "us", or "our") operates the NEXRYDE mobile application. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our ride-sharing platform.</p>
<h2>1. Information We Collect</h2>
<ul>
  <li><strong>Personal Information:</strong> Name, phone number, email, NIN, profile photo.</li>
  <li><strong>Location Data:</strong> Real-time GPS during booking, rides, and when drivers are online.</li>
  <li><strong>Trip Data:</strong> Pickup/dropoff, route, fare, distance, duration, ratings.</li>
  <li><strong>Payment Information:</strong> Payment method preferences and transaction records.</li>
  <li><strong>Device Information:</strong> Device type, OS, and app version.</li>
  <li><strong>Camera &amp; Microphone:</strong> For document/face verification and voice booking only.</li>
</ul>
<h2>2. How We Use Your Information</h2>
<ul>
  <li>Match riders with drivers and calculate fares.</li>
  <li>Process payments and provide receipts.</li>
  <li>Verify driver identity and documents.</li>
  <li>Enable safety features: SOS, trip sharing, security codes.</li>
  <li>Improve services through anonymized analytics.</li>
</ul>
<h2>3. Information Sharing</h2>
<p>We do not sell your data. We share only:</p>
<ul>
  <li>Between riders and drivers during a trip (name, rating, vehicle, location).</li>
  <li>With emergency contacts when you use SOS or trip sharing.</li>
  <li>When required by Nigerian law.</li>
  <li>With service providers (Google Maps, SMS) bound by their own policies.</li>
</ul>
<h2>4. Data Security</h2>
<p>HTTPS/TLS encryption, JWT authentication, and restricted access to user data.</p>
<h2>5. Your Rights (NDPR)</h2>
<ul>
  <li>Access and download your data.</li>
  <li>Correct inaccurate information.</li>
  <li>Request account and data deletion.</li>
  <li>Withdraw consent for optional processing.</li>
</ul>
<h2>6. Contact</h2>
<p>Email: privacy@nexryde.com<br>Support: support@nexryde.com</p>
</body>
</html>
`;

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html: PRIVACY_HTML }}
        style={styles.webview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 },
});
