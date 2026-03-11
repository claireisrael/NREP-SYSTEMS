import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function HrHomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">HR Mobile – Home</ThemedText>
      <ThemedText type="default" style={styles.paragraph}>
        You are now signed in to the HR system. In the next steps we will add travel requests,
        general requests, approvals, profile, and staff directory here.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 12,
  },
  paragraph: {
    maxWidth: 520,
  },
});

