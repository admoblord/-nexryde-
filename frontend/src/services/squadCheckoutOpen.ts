import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Open Squad checkout in an in-app browser (Custom Tabs / SFSafariViewController), then fall back to the system browser.
 * Keeps the user in-app when possible; bank apps / 3DS may still hand off to external apps.
 */
export async function openSquadCheckoutUrl(url: string): Promise<boolean> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle:
        Platform.OS === 'ios' ? WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET : undefined,
      enableBarCollapsing: true,
    });
    return true;
  } catch {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }
}
