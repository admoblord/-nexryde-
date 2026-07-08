import React from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const PRIVACY_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 16px 18px 48px;
    color: #0f172a;
    line-height: 1.75;
    font-size: 15px;
    background: #fff;
  }
  .badge {
    display: inline-block;
    background: linear-gradient(135deg, #22e180, #3b82f6);
    color: #fff;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1.5px;
    padding: 3px 10px;
    border-radius: 999px;
    margin-bottom: 16px;
  }
  h1 { font-size: 22px; font-weight: 900; color: #0f172a; border-bottom: 3px solid #22e180; padding-bottom: 10px; margin-bottom: 4px; }
  h2 { font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 28px; margin-bottom: 6px; }
  p, li { color: #334155; font-size: 14px; }
  ul { padding-left: 20px; margin: 6px 0; }
  li { margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 20px; }
  a { color: #16a34a; }
  .highlight-box {
    background: #f0fdf4;
    border: 1.5px solid #86efac;
    border-left: 4px solid #22e180;
    border-radius: 10px;
    padding: 14px 16px;
    margin: 16px 0;
  }
  .highlight-box p { margin: 0; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  th { background: #f1f5f9; text-align: left; padding: 8px 12px; font-weight: 700; color: #0f172a; border: 1px solid #e2e8f0; }
  td { padding: 7px 12px; border: 1px solid #e2e8f0; color: #334155; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .rights-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
  .rights-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .rights-item strong { display: block; font-size: 13px; color: #0f172a; margin-bottom: 3px; }
  .rights-item span { font-size: 12px; color: #64748b; }
  .contact-box {
    background: #f0fdf4;
    border: 1.5px solid #86efac;
    border-radius: 10px;
    padding: 14px 16px;
    margin-top: 32px;
  }
  .contact-box p { margin: 2px 0; font-size: 14px; }
  footer { margin-top: 40px; color: #94a3b8; font-size: 11px; text-align: center; }
</style>
</head>
<body>

<div class="badge">NEXRYDE</div>
<h1>Privacy Policy</h1>
<p class="meta">Effective: May 3, 2026 &nbsp;|&nbsp; v2.0 &nbsp;|&nbsp; Complies with Nigeria Data Protection Act 2023 (NDPA)</p>

<p>NEXRYDE (a product of <strong>AdmoblordGroup</strong>) is committed to protecting your personal data. This policy explains what we collect, why, how it is shared, and your rights under Nigerian law.</p>

<div class="highlight-box">
  <p><strong>In short:</strong> We collect only what is necessary to run a safe ride-sharing service. We do not sell your data. We never share it with advertisers. You can delete your account at any time from within the app.</p>
</div>

<h2>1. What We Collect and Why</h2>
<table>
  <thead><tr><th>Category</th><th>What we collect</th><th>Why</th></tr></thead>
  <tbody>
    <tr><td><strong>Identity</strong></td><td>Name, phone, email, NIN, profile photo, face image</td><td>Account creation, verification, fraud prevention</td></tr>
    <tr><td><strong>Location</strong></td><td>GPS (foreground during booking; background when driver is online)</td><td>Matching, routing, live tracking</td></tr>
    <tr><td><strong>Trip Records</strong></td><td>Pickup/dropoff, route, fare, distance, duration, ratings</td><td>Trip completion, receipts, disputes</td></tr>
    <tr><td><strong>Payment</strong></td><td>Payment method, transaction reference, top-up history. No card numbers stored.</td><td>Payment processing and receipts</td></tr>
    <tr><td><strong>Driver Documents</strong></td><td>Licence, vehicle registration, insurance, vehicle licence</td><td>Regulatory compliance and verification</td></tr>
    <tr><td><strong>Device</strong></td><td>Device model, OS version, app version, push token</td><td>Compatibility, support, security</td></tr>
    <tr><td><strong>Camera / Mic</strong></td><td>Photos (document/face check), audio (safety recording when you activate it)</td><td>Identity checks and safety — only when you explicitly enable</td></tr>
  </tbody>
</table>

<h2>2. Legal Basis for Processing</h2>
<ul>
  <li><strong>Contract:</strong> To provide the ride-sharing service you requested.</li>
  <li><strong>Legal obligation:</strong> Nigerian tax, anti-fraud, and safety regulations.</li>
  <li><strong>Legitimate interests:</strong> Fraud prevention, platform security, and service improvement.</li>
  <li><strong>Consent:</strong> For optional features (safety recordings, face unlock). Withdraw any time from Settings.</li>
</ul>

<h2>3. How We Share Your Data</h2>
<p>We do not sell, rent, or trade your personal data. We share it only:</p>
<ul>
  <li><strong>Rider ↔ Driver during a trip:</strong> First name, rating, vehicle details, real-time GPS. Sharing ends when the trip completes.</li>
  <li><strong>Emergency contacts:</strong> Only when you activate SOS or Trip Sharing.</li>
  <li><strong>Service providers:</strong> Google Maps (routing), payment processors (e.g. Squad), cloud hosting, and push notification services. All bound by data protection contracts.</li>
  <li><strong>Legal requirements:</strong> Valid Nigerian court orders, law enforcement, or regulatory obligations.</li>
  <li><strong>Business transfer:</strong> In a merger or acquisition, data transfers to the successor under the same protections.</li>
</ul>

<h2>4. Security</h2>
<ul>
  <li>All data in transit: HTTPS/TLS 1.2+ encryption.</li>
  <li>API access: JWT authentication with short-lived tokens.</li>
  <li>Sensitive local data: iOS Keychain / Android Keystore.</li>
  <li>Face images: processed server-side; stored only as a hash fingerprint, not as a photo.</li>
  <li>Production database access: restricted to authorised personnel with full audit logging.</li>
</ul>
<p>In the event of a data breach likely to cause significant harm, we will notify you and the Nigeria Data Protection Commission (NDPC) within 72 hours as required by the NDPA 2023.</p>

<h2>5. Retention</h2>
<table>
  <thead><tr><th>Data Type</th><th>Kept For</th></tr></thead>
  <tbody>
    <tr><td>Trip records</td><td>5 years (dispute resolution, tax)</td></tr>
    <tr><td>Driver identity documents</td><td>3 years after account closure</td></tr>
    <tr><td>Transaction records</td><td>7 years (FIRS financial regulations)</td></tr>
    <tr><td>Active account data</td><td>While account is active</td></tr>
    <tr><td>Deleted account data</td><td>90 days post-deletion request</td></tr>
    <tr><td>Safety recordings (audio)</td><td>30 days unless flagged for investigation</td></tr>
  </tbody>
</table>

<h2>6. Your Rights (NDPA 2023)</h2>
<div class="rights-grid">
  <div class="rights-item"><strong>Access</strong><span>Request a copy of all data we hold about you.</span></div>
  <div class="rights-item"><strong>Correction</strong><span>Ask us to correct inaccurate data.</span></div>
  <div class="rights-item"><strong>Deletion</strong><span>Request account and data deletion (subject to legal retention).</span></div>
  <div class="rights-item"><strong>Portability</strong><span>Receive your data in a machine-readable format.</span></div>
  <div class="rights-item"><strong>Objection</strong><span>Object to processing based on legitimate interests.</span></div>
  <div class="rights-item"><strong>Withdraw Consent</strong><span>Turn off face unlock or safety recording from in-app Settings.</span></div>
</div>
<p>Email <a href="mailto:admin@admoblordgroup.com">admin@admoblordgroup.com</a> to exercise any right. Response within 30 days.</p>
<p>You may also lodge a complaint with the <strong>Nigeria Data Protection Commission (NDPC)</strong> at <a href="https://ndpc.gov.ng">ndpc.gov.ng</a>.</p>

<h2>7. Location</h2>
<p>Foreground location is required to book and track rides. Background location is required only when a driver is online. You can adjust permissions in device Settings, but disabling location will prevent booking or receiving rides.</p>

<h2>8. Children</h2>
<p>NEXRYDE is not for persons under 18. If we discover a minor has created an account, we will delete it immediately. Contact admin@admoblordgroup.com if you believe a minor is using NEXRYDE.</p>

<h2>9. International Transfers</h2>
<p>Data may be processed on Google Cloud (us-central1) and MongoDB Atlas servers. Both providers are bound by data protection contracts meeting international standards.</p>

<h2>10. Changes</h2>
<p>Material changes will be notified in-app and by email at least 14 days before the new policy takes effect. Continued use constitutes acceptance.</p>

<div class="contact-box">
  <p><strong>Privacy / Data Requests:</strong> <a href="mailto:admin@admoblordgroup.com">admin@admoblordgroup.com</a></p>
  <p><strong>Customer Support:</strong> <a href="mailto:admin@admoblordgroup.com">admin@admoblordgroup.com</a></p>
  <p><strong>Legal:</strong> <a href="mailto:admin@admoblordgroup.com">admin@admoblordgroup.com</a></p>
</div>

<footer>© 2026 NEXRYDE — AdmoblordGroup. Registered Data Controller under the Nigeria Data Protection Act 2023.</footer>

</body>
</html>
`;

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 36 }} />
      </View>
      <WebView originWhitelist={['*']} source={{ html: PRIVACY_HTML }} style={styles.webview} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  webview: { flex: 1 },
});
