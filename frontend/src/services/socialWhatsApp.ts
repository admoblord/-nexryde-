import { Alert, Linking } from 'react-native';

/** Opens WhatsApp with prefilled text (system picker / chat on mobile). */
export async function shareTextViaWhatsApp(text: string): Promise<void> {
  const encoded = encodeURIComponent(text);
  const waMe = `https://wa.me/?text=${encoded}`;
  try {
    await Linking.openURL(waMe);
    return;
  } catch {
    /* fall through */
  }
  const scheme = `whatsapp://send?text=${encoded}`;
  try {
    const ok = await Linking.canOpenURL(scheme);
    if (ok) {
      await Linking.openURL(scheme);
      return;
    }
  } catch {
    /* ignore */
  }
  Alert.alert(
    'WhatsApp unavailable',
    'Install WhatsApp or open Wallet → Invite friends to copy your link.',
  );
}
