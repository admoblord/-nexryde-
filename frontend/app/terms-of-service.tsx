import React from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const TERMS_HTML = `
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
  .liability-box {
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-left: 4px solid #0f172a;
    border-radius: 10px;
    padding: 14px 16px;
    margin: 16px 0;
  }
  .liability-box .label {
    font-size: 12px;
    font-weight: 900;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .liability-box p { margin: 0 0 6px 0; font-size: 13px; color: #1e293b; }
  .liability-box p:last-child { margin-bottom: 0; }
  .warning-box {
    background: #fffbeb;
    border: 1.5px solid #fcd34d;
    border-left: 4px solid #f59e0b;
    border-radius: 10px;
    padding: 14px 16px;
    margin: 16px 0;
  }
  .warning-box .label { font-size: 12px; font-weight: 900; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .warning-box p { margin: 0; font-size: 13px; color: #78350f; }
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
<h1>Terms of Service</h1>
<p class="meta">Effective: May 3, 2026 &nbsp;|&nbsp; v2.0 &nbsp;|&nbsp; Governed by Nigerian law</p>

<p>By using NEXRYDE, you confirm you are at least 18 years old and agree to these Terms. <strong>If you disagree, stop using the app immediately.</strong></p>

<h2>1. What NEXRYDE Is</h2>
<p>NEXRYDE is a <strong>technology platform</strong> that connects independent riders with independent drivers. NEXRYDE is <strong>not a transportation company</strong>. Drivers are independent third parties — not employees, agents, or contractors of NEXRYDE. Any ride is a direct arrangement between rider and driver.</p>

<h2>2. User Accounts</h2>
<ul>
  <li>Provide accurate information during registration.</li>
  <li>Keep your account credentials confidential.</li>
  <li>Notify us immediately of unauthorised access at admin@admoblordgroup.com.</li>
  <li>One person, one account per role. Duplicate accounts may all be deactivated.</li>
</ul>

<h2>3. Rider Rules</h2>
<ul>
  <li>Provide accurate pickup and dropoff locations.</li>
  <li>Be ready at pickup when your driver arrives.</li>
  <li>Treat drivers and their vehicles with respect. Verbal abuse or physical harm leads to immediate permanent deactivation.</li>
  <li>Pay the agreed fare in full, including any surge pricing.</li>
  <li>Do not misuse SOS or safety features — false reports may result in legal action.</li>
</ul>

<h2>4. Driver Rules</h2>
<ul>
  <li>Complete all onboarding steps: NIN, driver's licence, vehicle registration, insurance, and face verification.</li>
  <li>Maintain a roadworthy, registered vehicle with a working air conditioner.</li>
  <li>Renew all documents before expiry and upload updated versions promptly.</li>
  <li>Never drive while impaired by alcohol, drugs, or any substance.</li>
  <li>You are solely responsible for all taxes, levies, and insurance applicable to your income.</li>
</ul>

<h2>5. Payments</h2>
<ul>
  <li>Fares are based on distance, time, vehicle category, and live demand (surge).</li>
  <li>Wallet top-ups are processed via Squad. NEXRYDE is not responsible for third-party payment delays or errors.</li>
  <li>Fare disputes must be raised within 48 hours via the in-app dispute feature.</li>
</ul>

<h2>6. Suspensions and Deactivation</h2>
<p>NEXRYDE may warn, suspend, or permanently deactivate any account for fraud, document falsification, abuse, repeated cancellations, or any breach of these Terms or Nigerian law.</p>

<h2>7. Lost Items</h2>
<p>Check vehicles immediately after every trip. NEXRYDE may assist communication about lost items but accepts <strong>no liability</strong> for lost, stolen, or damaged property left in a vehicle.</p>

<h2>8. Limitation of Liability</h2>

<div class="liability-box">
  <div class="label">8.1 — Platform as Intermediary Only</div>
  <p>NEXRYDE does not own, operate, or control any vehicle. All transportation is performed by independent drivers.</p>
</div>

<div class="liability-box">
  <div class="label">8.2 — No Liability for Third-Party Acts</div>
  <p>To the maximum extent permitted by applicable law, NEXRYDE, its directors, officers, employees, affiliates, and service providers shall have <strong>no liability whatsoever</strong> for any loss, injury, death, theft, accident, delay, or any harm arising from:</p>
  <p>(a) the acts or omissions of any driver or rider; (b) the condition of any vehicle; (c) road, weather, or traffic conditions; (d) third-party payment failures; (e) force majeure events; (f) your failure to comply with these Terms.</p>
</div>

<div class="liability-box">
  <div class="label">8.3 — No Consequential Damages</div>
  <p>NEXRYDE shall not be liable for any indirect, incidental, special, punitive, or consequential damages — including loss of profits, property damage, personal injury, or data loss — even if NEXRYDE has been advised of the possibility of such damages.</p>
</div>

<div class="liability-box">
  <div class="label">8.4 — Liability Cap</div>
  <p>Where NEXRYDE is found liable, total aggregate liability shall not exceed the <strong>greater of ₦5,000</strong> or the total fees you paid NEXRYDE in the preceding <strong>12 months</strong>.</p>
</div>

<div class="warning-box">
  <div class="label">Your Acknowledgement</div>
  <p>By using NEXRYDE, you accept that rides are provided by independent drivers and that you assume all risks associated with using a ride-sharing service. Your sole remedy if dissatisfied is to stop using the Platform.</p>
</div>

<h2>9. Indemnification</h2>
<p>You agree to indemnify and hold harmless NEXRYDE and its affiliates from any claims, damages, losses, or costs (including legal fees) arising from your use of the Platform, your breach of these Terms, or your violation of Nigerian law.</p>

<h2>10. Governing Law</h2>
<p>These Terms are governed by Nigerian law. Disputes shall first be resolved by negotiation (30 days), then by binding arbitration under the Arbitration and Mediation Act 2023 in Lagos, Nigeria. Class actions are waived.</p>

<h2>11. Amendments</h2>
<p>We may update these Terms at any time, with 14 days' notice for material changes. Continued use constitutes acceptance.</p>

<h2>12. Account Deletion</h2>
<p>Request account deletion from within the app. Some records may be retained for up to 5 years for legal and compliance purposes.</p>

<div class="contact-box">
  <p><strong>Support:</strong> admin@admoblordgroup.com</p>
  <p><strong>Legal:</strong> admin@admoblordgroup.com</p>
  <p><strong>Privacy:</strong> admin@admoblordgroup.com</p>
</div>

<footer>© 2026 NEXRYDE — AdmoblordGroup. All rights reserved.</footer>

</body>
</html>
`;

export default function TermsOfServiceScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 36 }} />
      </View>
      <WebView originWhitelist={['*']} source={{ html: TERMS_HTML }} style={styles.webview} />
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
