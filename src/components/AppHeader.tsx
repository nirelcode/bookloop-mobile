import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function AppHeader() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingTop: insets.top + 10 }]}>
      <Image
        source={require('../../assets/logo.png')}
        style={s.logo}
        contentFit="contain"
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e7e5e4',
  },
  logo: { width: 155, height: 36 },
});
