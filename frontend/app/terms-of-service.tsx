import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

const TERMS_HTML = `
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
</style>
</head>
<body>
<h1>NEXRYDE Terms of Service</h1>
<p class="updated">Last updated: March 15, 2026</p>
<p>By using NEXRYDE, you agree to these Terms of Service and our Privacy Policy.</p>
<h2>1. Riders</h2>
<p>Riders must provide accurate trip details, behave respectfully, and avoid repeated cancellations, fraud, or misuse of safety features.</p>
<h2>2. Drivers</h2>
<p>Drivers must complete onboarding, upload valid documents, maintain a roadworthy vehicle with working AC, and follow safety rules at all times.</p>
<h2>3. Safety</h2>
<p>NEXRYDE may require identity checks, live face verification, document renewals, and monthly compliance uploads to keep drivers active.</p>
<h2>4. Payments</h2>
<p>Riders may pay by supported methods. Drivers must not pressure riders into unsafe or fraudulent arrangements.</p>
<h2>5. Violations</h2>
<p>NEXRYDE may warn, suspend, or deactivate accounts for repeated cancellations, fraud, unsafe conduct, or refusal to return lost items.</p>
<h2>6. Account Deletion</h2>
<p>Users may request account deletion from within the app. Some records may be retained temporarily for compliance, safety, and dispute resolution.</p>
<h2>7. Contact</h2>
<p>Support: support@nexryde.com<br>Privacy: privacy@nexryde.com</p>
</body>
</html>
`;

export default function TermsOfServiceScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <WebView originWhitelist={['*']} source={{ html: TERMS_HTML }} style={styles.webview} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 },
});
