import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated } from 'react-native';

export default function SplashOverlay() {
  const logoAnim  = useRef(new Animated.Value(0)).current;
  const ring1     = useRef(new Animated.Value(0)).current;
  const ring2     = useRef(new Animated.Value(0)).current;
  const ring3     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Logo springs in
    Animated.spring(logoAnim, {
      toValue: 1,
      tension: 45,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Each ring expands and fades — looped, staggered
    const makeRipple = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );

    makeRipple(ring1,    0).start();
    makeRipple(ring2,  600).start();
    makeRipple(ring3, 1200).start();
  }, []);

  return (
    <View style={s.container}>
      {[ring1, ring2, ring3].map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            s.ring,
            {
              opacity: anim.interpolate({
                inputRange:  [0, 0.2, 1],
                outputRange: [0, 0.18, 0],
              }),
              transform: [{
                scale: anim.interpolate({
                  inputRange:  [0, 1],
                  outputRange: [0.3, 2.8],
                }),
              }],
            },
          ]}
        />
      ))}

      <Animated.Image
        source={require('../../assets/splash-icon.png')}
        style={[
          s.logo,
          {
            opacity: logoAnim,
            transform: [{
              scale: logoAnim.interpolate({
                inputRange:  [0, 1],
                outputRange: [0.7, 1],
              }),
            }],
          },
        ]}
        resizeMode="contain"
      />
    </View>
  );
}

const RING_SIZE = 180;

const s = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fafaf9',
    justifyContent:  'center',
    alignItems:      'center',
    zIndex: 999,
  },
  ring: {
    position:     'absolute',
    width:        RING_SIZE,
    height:       RING_SIZE,
    borderRadius: RING_SIZE / 2,
    backgroundColor: '#2563eb',
  },
  logo: {
    width:  200,
    height: 154,
  },
});
