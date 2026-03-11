import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
  Easing,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';

export default function HomeScreen() {
  const router = useRouter();
  const logoScale = useRef(new Animated.Value(0.9)).current;
  const buttonsOpacity = useRef(new Animated.Value(0)).current;
  const buttonsTranslateY = useRef(new Animated.Value(24)).current;
  const rainDrift1 = useRef(new Animated.Value(0)).current;
  const rainDrift2 = useRef(new Animated.Value(0)).current;
  const rainDrift3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Gentle, continuous pulse on the logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoScale, {
          toValue: 1.03,
          duration: 1200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 0.97,
          duration: 1200,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // One-time fade/slide-in for buttons
    Animated.parallel([
      Animated.timing(buttonsOpacity, {
        toValue: 1,
        duration: 700,
        delay: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(buttonsTranslateY, {
        toValue: 0,
        duration: 700,
        delay: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle drifting motion for background "drops" on cards
    const startDrift = (anim: Animated.Value, delay: number, duration: number) => {
      anim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1,
            duration,
            delay,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    startDrift(rainDrift1, 0, 4500);
    startDrift(rainDrift2, 600, 5200);
    startDrift(rainDrift3, 1100, 5800);
  }, [logoScale, buttonsOpacity, buttonsTranslateY, rainDrift1, rainDrift2, rainDrift3]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.heroWrapper}>
          <Animated.View style={{ transform: [{ scale: logoScale }] }}>
        <Image
              source={require('@/assets/images/nrep-logo.png')}
              style={styles.heroImage}
              contentFit="contain"
            />
          </Animated.View>
        </View>

        <View style={styles.textBlock}>
          <View style={styles.titleWrapper}>
            <Text style={styles.titleLine}>
              <Text style={styles.titleText}>Welcome to </Text>
              <Text style={styles.titleHighlight}>NREP</Text>
            </Text>
            <Text style={styles.titleLine}>
              <Text style={styles.titleText}>Systems</Text>
            </Text>
          </View>

          <ThemedText type="default" style={styles.subtitle} lightColor="#4b5563">
            Manage your daily HR and project workflows in one place.
          </ThemedText>

          <Pressable style={styles.chooseModulePill}>
            <View style={styles.pillIcon} />
            <Text style={styles.chooseModuleText}>CHOOSE YOUR MODULE</Text>
            <View style={styles.pillIcon} />
          </Pressable>
        </View>

        <Animated.View
          style={[
            styles.systemsRow,
            {
              opacity: buttonsOpacity,
              transform: [{ translateY: buttonsTranslateY }],
            },
          ]}>
          <Pressable
            style={({ pressed }) => [
              styles.systemCard,
              styles.hrCard,
              pressed && styles.cardPressed,
            ]}
            onPress={() => router.push('/hr')}>
            <View style={styles.cardAccent} />
            <View pointerEvents="none" style={styles.cardRainLayer}>
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotSmall,
                  styles.rainDotTopLeft,
                  {
                    transform: [
                      {
                        translateY: rainDrift1.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 12],
                        }),
                      },
                    ],
                    opacity: rainDrift1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 0.8],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotMedium,
                  styles.rainDotCenter,
                  {
                    transform: [
                      {
                        translateY: rainDrift2.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -14],
                        }),
                      },
                    ],
                    opacity: rainDrift2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 0.9],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotTiny,
                  styles.rainDotBottomRight,
                  {
                    transform: [
                      {
                        translateY: rainDrift3.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 10],
                        }),
                      },
                    ],
                    opacity: rainDrift3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 0.85],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotTiny,
                  styles.rainDotUpperRight,
                  {
                    transform: [
                      {
                        translateY: rainDrift2.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -10],
                        }),
                      },
                    ],
                    opacity: rainDrift2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 0.75],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotSmall,
                  styles.rainDotMidLeft,
                  {
                    transform: [
                      {
                        translateY: rainDrift3.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 9],
                        }),
                      },
                    ],
                    opacity: rainDrift3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.35, 0.8],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotMedium,
                  styles.rainDotLowerCenter,
                  {
                    transform: [
                      {
                        translateY: rainDrift1.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -11],
                        }),
                      },
                    ],
                    opacity: rainDrift1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 0.85],
                    }),
                  },
                ]}
              />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardIconWrapper}>
                <View style={styles.cardIcon}>
                  <MaterialCommunityIcons
                    name="briefcase-outline"
                    size={28}
                    color="#ffffff"
                  />
                </View>
              </View>
              <ThemedText type="subtitle" style={styles.systemTitle}>
                HR System
              </ThemedText>
              <View style={styles.cardDivider} />
              <ThemedText type="default" style={styles.systemHint}>
                Tap to enter
              </ThemedText>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.systemCard,
              styles.projectsCard,
              pressed && styles.cardPressed,
            ]}
            onPress={() => router.push('/pms')}>
            <View style={styles.cardAccent} />
            <View pointerEvents="none" style={styles.cardRainLayer}>
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotSmall,
                  styles.rainDotTopLeft,
                  {
                    transform: [
                      {
                        translateY: rainDrift2.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 12],
                        }),
                      },
                    ],
                    opacity: rainDrift2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 0.8],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotMedium,
                  styles.rainDotCenter,
                  {
                    transform: [
                      {
                        translateY: rainDrift3.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -14],
                        }),
                      },
                    ],
                    opacity: rainDrift3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 0.9],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotTiny,
                  styles.rainDotBottomRight,
                  {
                    transform: [
                      {
                        translateY: rainDrift1.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 10],
                        }),
                      },
                    ],
                    opacity: rainDrift1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.5, 0.85],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotTiny,
                  styles.rainDotUpperRight,
                  {
                    transform: [
                      {
                        translateY: rainDrift1.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -10],
                        }),
                      },
                    ],
                    opacity: rainDrift1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.3, 0.75],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotSmall,
                  styles.rainDotMidLeft,
                  {
                    transform: [
                      {
                        translateY: rainDrift2.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, 9],
                        }),
                      },
                    ],
                    opacity: rainDrift2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.35, 0.8],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.rainDotBase,
                  styles.rainDotMedium,
                  styles.rainDotLowerCenter,
                  {
                    transform: [
                      {
                        translateY: rainDrift3.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, -11],
                        }),
                      },
                    ],
                    opacity: rainDrift3.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.4, 0.85],
                    }),
                  },
                ]}
              />
            </View>
            <View style={styles.cardContent}>
              <View style={styles.cardIconWrapper}>
                <View style={styles.cardIcon}>
                  <MaterialCommunityIcons
                    name="view-dashboard-outline"
                    size={28}
                    color="#ffffff"
                  />
                </View>
              </View>
              <ThemedText type="subtitle" style={styles.systemTitle}>
                Project MS
        </ThemedText>
              <View style={styles.cardDivider} />
              <ThemedText type="default" style={styles.systemHint}>
                Tap to enter
        </ThemedText>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingTop: 32,
  },
  heroWrapper: {
    alignItems: 'center',
  },
  heroImage: {
    width: 130,
    height: 130,
  },
  textBlock: {
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 10,
  },
  titleWrapper: {
    alignItems: 'center',
    marginBottom: 4,
  },
  titleLine: {
    textAlign: 'center',
  },
  titleText: {
    fontSize: 30,
    fontWeight: '700',
    color: '#054653',
  },
  titleHighlight: {
    fontSize: 30,
    fontWeight: '800',
    color: '#14B8A6',
  },
  subtitle: {
    textAlign: 'center',
    color: '#4b5563',
    marginTop: 4,
  },
  chooseModulePill: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  pillIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#14B8A6',
    marginHorizontal: 6,
  },
  chooseModuleText: {
    color: '#111827',
    fontWeight: '600',
    letterSpacing: 1,
  },
  systemsRow: {
    width: '100%',
    marginTop: 40,
    flexDirection: 'row',
    gap: 16,
  },
  systemCard: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 26,
    paddingHorizontal: 16,
    minHeight: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
    overflow: 'hidden',
  },
  hrCard: {
    backgroundColor: '#0b6073',
  },
  projectsCard: {
    backgroundColor: '#059488',
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  cardIconWrapper: {
    alignItems: 'center',
    marginBottom: 10,
  },
  cardContent: {
    flex: 1,
    paddingVertical: 6,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '55%',
    height: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
  },
  cardRainLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  cardIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  systemTitle: {
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 2,
    fontWeight: '700',
  },
  cardDivider: {
    width: 44,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },
  systemHint: {
    color: '#e0f2fe',
    textAlign: 'center',
    marginTop: 6,
    fontSize: 12,
  },
  rainDotBase: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  rainDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  rainDotMedium: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  rainDotTiny: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  rainDotTopLeft: {
    top: 18,
    left: 18,
  },
  rainDotCenter: {
    top: '45%',
    left: '55%',
  },
  rainDotBottomRight: {
    bottom: 18,
    right: 22,
  },
  rainDotUpperRight: {
    top: 26,
    right: 18,
  },
  rainDotMidLeft: {
    top: '52%',
    left: 20,
  },
  rainDotLowerCenter: {
    bottom: 22,
    left: '46%',
  },
});

