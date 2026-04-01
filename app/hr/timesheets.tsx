import React, { useEffect } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';

export default function HrTimesheetsScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText type="title" style={styles.title}>
          Timesheets
        </ThemedText>
        <ThemedText type="default" style={styles.subtitle}>
          Your timesheets will appear here.
        </ThemedText>
      </ScrollView>
      <HrBottomNav />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 120 },
  title: { color: '#054653' },
  subtitle: { marginTop: 6, color: '#6b7280' },
});

