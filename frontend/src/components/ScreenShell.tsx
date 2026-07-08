import React, { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BRAND } from '@/src/constants/designSystem';

type ScreenShellProps = {
  title: string;
  children: ReactNode;
  onBack?: () => void;
  headerRight?: ReactNode;
  scroll?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

/** Header + layout chrome that renders immediately — content area is children. */
export function ScreenShell({
  title,
  children,
  onBack,
  headerRight,
  scroll = true,
  contentContainerStyle,
}: ScreenShellProps) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());

  const body = scroll ? (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={contentContainerStyle}>
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentContainerStyle]}>{children}</View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={[BRAND.bgDeep, BRAND.bgCard, BRAND.bgDeep]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={22} color={BRAND.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerRight}>{headerRight ?? <View style={styles.headerSpacer} />}</View>
        </View>
        {body}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bgDeep },
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: -0.5,
  },
  headerRight: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerSpacer: { width: 40, height: 40 },
});
