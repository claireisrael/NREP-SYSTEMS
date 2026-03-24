import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

type Props = {
  size?: number;
};

export function HrLogoSpinner({ size = 64 }: Props) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const bubbleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    spinLoop.start();
    bubbleLoop.start();
    return () => {
      spinLoop.stop();
      bubbleLoop.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const bubbleScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1.12],
  });

  const bubbleOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.5],
  });

  return (
    <View style={[styles.wrap, { width: size + 36, height: size + 36 }]}>
      <Animated.View
        style={[
          styles.bubble,
          {
            width: size + 22,
            height: size + 22,
            borderRadius: (size + 22) / 2,
            opacity: bubbleOpacity,
            transform: [{ scale: bubbleScale }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Image source={require('@/assets/images/nrep-logo.png')} style={{ width: size, height: size }} contentFit="contain" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    position: 'absolute',
    backgroundColor: '#FFB803',
  },
});

