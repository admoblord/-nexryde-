/**
 * Stylized sedan / taxi illustration for onboarding — layered “real cab” look (no flat glyph).
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = {
  /** Outer hero diameter in px */
  size?: number;
};

export function OnboardingCabHero({ size = 200 }: Props) {
  const s = size / 200;

  return (
    <View style={[styles.stage, { width: size, height: size }]}>
      <LinearGradient
        colors={['rgba(52,245,184,0.22)', 'rgba(15,118,110,0.08)', 'rgba(2,6,23,0)']}
        style={[styles.glowRing, { borderRadius: size / 2 }]}
      />
      <View style={[styles.innerDisc, { borderRadius: size * 0.44 }]}>
        <LinearGradient
          colors={['rgba(6,78,59,0.5)', 'rgba(2,6,23,0.92)']}
          style={[StyleSheet.absoluteFillObject, { borderRadius: size * 0.44 }]}
        />
        {/* Ground line */}
        <View style={[styles.ground, { bottom: 22 * s }]} />
        {/* Cab silhouette — 3/4 front-ish sedan */}
        <View style={[styles.cabWrap, { transform: [{ scale: s }] }]}>
          {/* Taxi roof sign */}
          <LinearGradient
            colors={['#FDE047', '#FACC15', '#EAB308']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.roofSign}
          >
            <View style={styles.roofSignStripe} />
          </LinearGradient>
          {/* Roof & upper cabin */}
          <LinearGradient
            colors={['#FDE68A', '#EAB308', '#CA8A04']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.roof}
          >
            <LinearGradient
              colors={['rgba(30,58,138,0.85)', 'rgba(15,23,42,0.95)']}
              style={styles.windshield}
            />
          </LinearGradient>
          {/* Hood + grille band */}
          <LinearGradient
            colors={['#FACC15', '#EAB308', '#A16207']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.hood}
          >
            <View style={styles.grille}>
              <View style={styles.grilleBar} />
              <View style={styles.grilleBar} />
              <View style={styles.grilleBar} />
            </View>
            <View style={styles.headlightL} />
            <View style={styles.headlightR} />
          </LinearGradient>
          {/* Bumper */}
          <LinearGradient
            colors={['#1E293B', '#0F172A']}
            style={styles.bumper}
          />
          {/* Body side mass */}
          <LinearGradient
            colors={['rgba(234,179,8,0.95)', 'rgba(161,98,7,0.98)', '#713F12']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.lowerBody}
          />
          {/* Wheels */}
          <View style={styles.wheelL}>
            <View style={styles.rim} />
          </View>
          <View style={styles.wheelR}>
            <View style={styles.rim} />
          </View>
          {/* Side window */}
          <LinearGradient
            colors={['rgba(56,189,248,0.35)', 'rgba(15,23,42,0.9)']}
            style={styles.sideGlass}
          />
        </View>
      </View>
    </View>
  );
}

const CAB = 130;

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.25)',
  },
  innerDisc: {
    width: '88%',
    height: '88%',
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.12)',
  },
  ground: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(52,245,184,0.35)',
  },
  cabWrap: {
    width: CAB,
    height: CAB * 0.85,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 6,
  },
  roofSign: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: 44,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.8)',
    shadowColor: '#FDE047',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: Platform.OS === 'ios' ? 0.55 : 0.4,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  roofSignStripe: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 5,
    height: 3,
    borderRadius: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
  },
  roof: {
    position: 'absolute',
    top: 14,
    width: 102,
    height: 38,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingTop: 6,
    alignItems: 'center',
    overflow: 'hidden',
  },
  windshield: {
    width: 78,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
  },
  hood: {
    position: 'absolute',
    top: 46,
    width: 112,
    height: 36,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  grille: {
    position: 'absolute',
    bottom: 6,
    flexDirection: 'row',
    gap: 3,
    opacity: 0.85,
  },
  grilleBar: {
    width: 5,
    height: 12,
    borderRadius: 1,
    backgroundColor: 'rgba(15,23,42,0.65)',
  },
  headlightL: {
    position: 'absolute',
    left: 6,
    bottom: 10,
    width: 14,
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(254,252,232,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.5)',
  },
  headlightR: {
    position: 'absolute',
    right: 6,
    bottom: 10,
    width: 14,
    height: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(254,252,232,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(253,224,71,0.5)',
  },
  bumper: {
    position: 'absolute',
    top: 78,
    width: 118,
    height: 14,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  lowerBody: {
    position: 'absolute',
    top: 56,
    width: 120,
    height: 44,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    zIndex: -1,
  },
  sideGlass: {
    position: 'absolute',
    top: 30,
    left: 8,
    width: 28,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.25)',
  },
  wheelL: {
    position: 'absolute',
    bottom: 4,
    left: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    borderWidth: 3,
    borderColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelR: {
    position: 'absolute',
    bottom: 4,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0F172A',
    borderWidth: 3,
    borderColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rim: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(148,163,184,0.45)',
  },
});
