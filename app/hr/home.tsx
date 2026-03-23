import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useHrAuth } from '@/context/HrAuthContext';
import { HrBottomNav } from '@/components/HrBottomNav';
import { HR_COLLECTIONS, HR_DB_ID, hrDatabases, Query } from '@/lib/appwrite';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatShortDate(iso?: string | null) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function HrHomeScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const greeting = getGreeting();

  const [counts, setCounts] = useState({ travel: 0, requests: 0, timesheets: 0 });
  const [countsLoading, setCountsLoading] = useState(false);
  const [countsError, setCountsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [recent, setRecent] = useState({
    travel: [] as any[],
    requests: [] as any[],
    timesheets: [] as any[],
  });

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/hr');
    }
  }, [isLoading, user, router]);

  const loadDashboardBits = useCallback(async () => {
      if (!user?.$id) return;
      try {
        setCountsLoading(true);
        setCountsError(null);
        const [travelRes, reqRes, tsRes] = await Promise.all([
          hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
            Query.equal('userId', user.$id),
            Query.limit(1),
          ]),
          hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
            Query.equal('userId', user.$id),
            Query.limit(1),
          ]),
          hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TIMESHEETS, [
            Query.equal('employeeId', user.$id),
            Query.limit(1),
          ]),
        ]);

        setCounts({
          travel: (travelRes as any).total ?? (travelRes as any).documents?.length ?? 0,
          requests: (reqRes as any).total ?? (reqRes as any).documents?.length ?? 0,
          timesheets: (tsRes as any).total ?? (tsRes as any).documents?.length ?? 0,
        });

        const [travelRecent, requestsRecent, timesheetsRecent] = await Promise.all([
          hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
            Query.equal('userId', user.$id),
            Query.orderDesc('submissionDate'),
            Query.limit(3),
          ]),
          hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
            Query.equal('userId', user.$id),
            Query.orderDesc('submissionDate'),
            Query.limit(3),
          ]),
          hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TIMESHEETS, [
            Query.equal('employeeId', user.$id),
            Query.orderDesc('$createdAt'),
            Query.limit(3),
          ]),
        ]);

        setRecent({
          travel: (travelRecent as any).documents ?? [],
          requests: (requestsRecent as any).documents ?? [],
          timesheets: (timesheetsRecent as any).documents ?? [],
        });
      } catch (e) {
        console.error('Failed to load HR dashboard counts', e);
        setCountsError((e as any)?.message || 'Failed to load counts');
      } finally {
        setCountsLoading(false);
      }
  }, [user?.$id]);

  useEffect(() => {
    loadDashboardBits();
  }, [loadDashboardBits]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDashboardBits();
    setRefreshing(false);
  }, [loadDashboardBits]);

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator color="#0f766e" />
      </ThemedView>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(16, insets.top + 12) },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#054653" />
        }
      >
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeTopRow}>
            <View style={styles.avatarCol}>
              <View style={styles.avatarCircle}>
                {user.profilePicture ? (
                  <Image
                    source={{ uri: user.profilePicture }}
                    style={styles.avatarImage}
                    contentFit="contain"
                  />
                ) : (
                  <ThemedText type="default" style={styles.avatarInitials}>
                    {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                  </ThemedText>
                )}
              </View>

              <View style={styles.roleChip}>
                <ThemedText type="default" style={styles.roleChipText}>
                  {(user.staffCategory || 'Associate').toUpperCase()}
                </ThemedText>
              </View>
            </View>

            <View style={styles.welcomeTextBlock}>
              <ThemedText type="subtitle" style={styles.welcomeGreeting}>
                {greeting}, {user.name || (user.email || '').split('@')[0]}!
              </ThemedText>
              <ThemedText type="default" style={styles.welcomeMeta}>
                {formatToday()} • {user.systemRole || 'Staff'} • {user.departmentName || 'Department'}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Overview
          </ThemedText>
        </View>

        <View style={styles.statsGrid}>
          <Pressable
            style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/hr/travel')}
          >
            <View style={styles.statTopRow}>
              <View style={[styles.statIconWrap, { backgroundColor: '#e6f4f2' }]}>
                <MaterialCommunityIcons name="airplane" size={18} color="#054653" />
              </View>
              <View style={[styles.statAccent, { backgroundColor: '#054653' }]} />
            </View>
            <ThemedText type="title" style={styles.statValue}>
              {countsLoading ? '…' : counts.travel}
            </ThemedText>
            <ThemedText type="default" style={styles.statLabel}>
              Travel
            </ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/hr/requests')}
          >
            <View style={styles.statTopRow}>
              <View style={[styles.statIconWrap, { backgroundColor: '#fff7ed' }]}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#92400e" />
              </View>
              <View style={[styles.statAccent, { backgroundColor: '#FFB803' }]} />
            </View>
            <ThemedText type="title" style={styles.statValue}>
              {countsLoading ? '…' : counts.requests}
            </ThemedText>
            <ThemedText type="default" style={styles.statLabel}>
              Requests
            </ThemedText>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.statCard, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/hr/timesheets')}
          >
            <View style={styles.statTopRow}>
              <View style={[styles.statIconWrap, { backgroundColor: '#eff6ff' }]}>
                <MaterialCommunityIcons name="calendar-clock-outline" size={18} color="#1d4ed8" />
              </View>
              <View style={[styles.statAccent, { backgroundColor: '#1d4ed8' }]} />
            </View>
            <ThemedText type="title" style={styles.statValue}>
              {countsLoading ? '…' : counts.timesheets}
            </ThemedText>
            <ThemedText type="default" style={styles.statLabel}>
              Timesheets
            </ThemedText>
          </Pressable>
        </View>

        {countsError ? (
          <ThemedText type="default" style={styles.countsErrorText}>
            {countsError}
          </ThemedText>
        ) : null}

        <View style={styles.sectionHeaderRow}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Recent activity
          </ThemedText>
        </View>

        <View style={styles.recentCard}>
          <ThemedText type="default" style={styles.recentTitle}>
            Travel Requests
          </ThemedText>
          {recent.travel.length === 0 ? (
            <ThemedText type="default" style={styles.recentEmpty}>
              No recent travel requests.
            </ThemedText>
          ) : (
            recent.travel.map((t) => (
              <View key={t.$id} style={styles.recentRow}>
                <View style={styles.recentDot} />
                <View style={{ flex: 1 }}>
                  <ThemedText type="default" style={styles.recentRowTitle} numberOfLines={1}>
                    {t.destination || t.activityName || 'Travel request'}
                  </ThemedText>
                  <ThemedText type="default" style={styles.recentRowMeta} numberOfLines={1}>
                    {formatShortDate(t.submissionDate)} • {t.status || 'pending'}
                  </ThemedText>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.recentCard}>
          <ThemedText type="default" style={styles.recentTitle}>
            Requests
          </ThemedText>
          {recent.requests.length === 0 ? (
            <ThemedText type="default" style={styles.recentEmpty}>
              No recent requests.
            </ThemedText>
          ) : (
            recent.requests.map((r) => (
              <View key={r.$id} style={styles.recentRow}>
                <View style={styles.recentDot} />
                <View style={{ flex: 1 }}>
                  <ThemedText type="default" style={styles.recentRowTitle} numberOfLines={1}>
                    {r.subject || r.title || 'General request'}
                  </ThemedText>
                  <ThemedText type="default" style={styles.recentRowMeta} numberOfLines={1}>
                    {formatShortDate(r.submissionDate)} • {r.status || r.approvalStage || 'pending'}
                  </ThemedText>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.recentCard}>
          <ThemedText type="default" style={styles.recentTitle}>
            Timesheets
          </ThemedText>
          {recent.timesheets.length === 0 ? (
            <ThemedText type="default" style={styles.recentEmpty}>
              No recent timesheets.
            </ThemedText>
          ) : (
            recent.timesheets.map((ts) => (
              <View key={ts.$id} style={styles.recentRow}>
                <View style={styles.recentDot} />
                <View style={{ flex: 1 }}>
                  <ThemedText type="default" style={styles.recentRowTitle} numberOfLines={1}>
                    {ts.reportingPeriodLabel || ts.reportingPeriodId || 'Timesheet'}
                  </ThemedText>
                  <ThemedText type="default" style={styles.recentRowMeta} numberOfLines={1}>
                    {formatShortDate(ts.$createdAt)} • {ts.status || 'draft'}
                  </ThemedText>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
      <HrBottomNav />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 120,
  },
  welcomeCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: 20,
  },
  welcomeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  avatarCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: 72,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarInitials: {
    color: '#054653',
    fontWeight: '700',
    fontSize: 18,
  },
  welcomeTextBlock: {
    flex: 1,
  },
  welcomeGreeting: {
    color: '#054653',
    fontSize: 16,
    fontWeight: '800',
  },
  welcomeMeta: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 3,
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#FFB803',
  },
  roleChipText: {
    fontSize: 10,
    color: '#054653',
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
    overflow: 'hidden',
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statAccent: {
    width: 22,
    height: 6,
    borderRadius: 999,
    opacity: 0.95,
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '700',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#054653',
    lineHeight: 24,
  },
  countsErrorText: {
    marginTop: 8,
    fontSize: 12,
    color: '#b91c1c',
  },
  recentCard: {
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  recentTitle: {
    color: '#054653',
    fontWeight: '700',
    marginBottom: 6,
  },
  recentEmpty: {
    color: '#6b7280',
    fontSize: 12,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  recentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: '#054653',
  },
  recentRowTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  recentRowMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#6b7280',
  },
});

