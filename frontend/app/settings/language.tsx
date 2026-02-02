import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useLanguage } from '@/src/i18n/LanguageContext';
import { SupportedLanguage } from '@/src/i18n/translations';

export default function LanguageSettingsScreen() {
  const router = useRouter();
  const { language, setLanguage, availableLanguages, t } = useLanguage();
  const [saving, setSaving] = useState(false);

  const handleLanguageChange = async (newLang: SupportedLanguage) => {
    if (newLang === language) return;

    try {
      setSaving(true);
      await setLanguage(newLang);
      
      Alert.alert(
        t.common.success,
        `${t.profile.language} ${t.common.done}`,
        [{ text: t.common.ok }]
      );
    } catch (error) {
      Alert.alert(
        t.common.error,
        'Failed to change language. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t.profile.language}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={24} color={COLORS.accentBlue} />
          <Text style={styles.infoText}>
            {language === 'en' && 'Select your preferred language. The app will restart to apply changes.'}
            {language === 'yo' && 'Yan èdè tó wu ọ. Àpùlíkéṣọ́n yóò tún bẹ̀rẹ̀ láti ṣe àyípadà.'}
            {language === 'ig' && 'Họrọ asụsụ ị chọrọ. Ngwa ahụ ga-amalite ọzọ iji tinye mgbanwe.'}
            {language === 'ha' && 'Zaɓi harshen da kake so. Za a sake kunna app don aiwatar da canje-canje.'}
          </Text>
        </View>

        {/* Language Options */}
        <View style={styles.languagesSection}>
          <Text style={styles.sectionTitle}>
            {language === 'en' && '🌍 Available Languages'}
            {language === 'yo' && '🌍 Àwọn èdè tó wà'}
            {language === 'ig' && '🌍 Asụsụ dị'}
            {language === 'ha' && '🌍 Harsuna da ake da su'}
          </Text>

          {availableLanguages.map((lang) => (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.languageCard,
                language === lang.code && styles.languageCardActive,
              ]}
              onPress={() => handleLanguageChange(lang.code)}
              disabled={saving}
            >
              <View style={styles.languageLeft}>
                <Text style={styles.languageFlag}>{lang.flag}</Text>
                <View style={styles.languageInfo}>
                  <Text style={styles.languageName}>{lang.nativeName}</Text>
                  <Text style={styles.languageEnglishName}>{lang.name}</Text>
                </View>
              </View>

              {language === lang.code && (
                <View style={styles.selectedBadge}>
                  <Ionicons name="checkmark-circle" size={28} color={COLORS.accentGreen} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Language Features */}
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>
            {language === 'en' && '✨ Multi-Language Features'}
            {language === 'yo' && '✨ Àwọn ẹ̀yà èdè púpọ̀'}
            {language === 'ig' && '✨ Njirimara asụsụ dị iche iche'}
            {language === 'ha' && '✨ Abubuwan harsuna da yawa'}
          </Text>
          
          <View style={styles.featuresList}>
            <FeatureItem 
              icon="checkmark-circle"
              text={
                language === 'en' ? 'All screens translated' :
                language === 'yo' ? 'Gbogbo ibojú ti túmò' :
                language === 'ig' ? 'A tụgharịrị ihu niile' :
                'An fassara duk fuska'
              }
            />
            <FeatureItem 
              icon="checkmark-circle"
              text={
                language === 'en' ? 'Nigerian languages supported' :
                language === 'yo' ? 'Àwọn èdè Nàìjíríà' :
                language === 'ig' ? 'Asụsụ Naịjirịa' :
                'Harsunan Najeriya'
              }
            />
            <FeatureItem 
              icon="checkmark-circle"
              text={
                language === 'en' ? 'Easy language switching' :
                language === 'yo' ? 'Ìyípadà èdè tí ó rọrùn' :
                language === 'ig' ? 'Ngbanwe asụsụ dị mfe' :
                'Sauƙin canza harshe'
              }
            />
            <FeatureItem 
              icon="checkmark-circle"
              text={
                language === 'en' ? 'Saves your preference' :
                language === 'yo' ? 'Ó fi ìfẹ́ rẹ pamọ́' :
                language === 'ig' ? 'Na-echekwa nhọrọ gị' :
                'Yana ajiye zaɓin ku'
              }
            />
          </View>
        </View>

        {/* Cultural Note */}
        <View style={styles.noteCard}>
          <Text style={styles.noteIcon}>🇳🇬</Text>
          <Text style={styles.noteText}>
            {language === 'en' && 'NEXRYDE proudly supports Nigerian languages to serve our diverse community better.'}
            {language === 'yo' && 'NEXRYDE ń ṣe àtìlẹ́yìn àwọn èdè Nàìjíríà pẹ̀lú ìgbéraga láti ṣe ìrànlọ́wọ́ fún àwọn ará wa.'}
            {language === 'ig' && 'NEXRYDE ji ọṅụ na-akwado asụsụ Naịjirịa iji jee ozi obodo anyị nke ọma.'}
            {language === 'ha' && 'NEXRYDE yana goyon bayan harsunan Najeriya don samar da mafi kyawun hidima ga al\'ummarmu.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const FeatureItem = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.featureItem}>
    <Ionicons name={icon as any} size={20} color={COLORS.accentGreen} />
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  placeholder: {
    width: 44,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
  },
  
  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.accentBlueSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accentBlue + '30',
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentBlue,
    lineHeight: 20,
  },
  
  // Languages Section
  languagesSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
  },
  languageCardActive: {
    borderColor: COLORS.accentGreen,
    backgroundColor: COLORS.accentGreenSoft,
  },
  languageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  languageFlag: {
    fontSize: 40,
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs / 2,
  },
  languageEnglishName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  selectedBadge: {
    marginLeft: SPACING.md,
  },
  
  // Features Card
  featuresCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  featuresTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  featuresList: {
    gap: SPACING.sm,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  featureText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    lineHeight: 20,
  },
  
  // Note Card
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.accent + '15',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
  },
  noteIcon: {
    fontSize: 32,
  },
  noteText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accent,
    lineHeight: 20,
  },
});
