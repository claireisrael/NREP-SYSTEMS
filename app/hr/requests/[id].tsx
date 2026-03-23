import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import { HR_COLLECTIONS, HR_DB_ID, hrDatabases } from '@/lib/appwrite';

export default function HrRequestDetailScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setError(null);
      setLoading(true);
      const d = await hrDatabases.getDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, String(id));
      setDoc(d);
    } catch (e: any) {
      setError(e?.message || 'Failed to load request');
      setDoc(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!isLoading && user && id) load();
  }, [id, isLoading, user, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const summary = useMemo(() => {
    if (!doc) return null;
    const status = String(doc.status || '').toUpperCase();
    const stage = String(doc.approvalStage || '').toUpperCase();
    const title = doc.subject || doc.title || 'General request';
    const requestId = doc.requestId || doc.$id;
    const when = doc.submissionDate ? new Date(doc.submissionDate).toLocaleString() : '';
    const stageLabel =
      status === 'DRAFT' ? 'Draft'
      : status === 'REJECTED' ? 'Rejected'
      : stage === 'DEPARTMENT_REVIEW' ? 'Department Review'
      : stage === 'L1_APPROVAL' ? 'L1 Approval'
      : stage === 'L2_APPROVAL' ? 'L2 Approval'
      : stage === 'FINANCE_COMPLETION' ? 'Finance Completion'
      : status === 'APPROVED' ? 'Completed'
      : status || 'Status';
    return { status, stage, title, requestId, when, stageLabel };
  }, [doc]);

  if (isLoading || !user) return null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#054653" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.headerIconBtn}>
              <MaterialCommunityIcons name="chevron-left" size={22} color="#054653" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerKicker}>Request</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {summary?.requestId ? String(summary.requestId) : '—'}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {summary?.title || '—'}
              </Text>
            </View>
            <View style={{ width: 36 }} />
          </View>
          {summary && !loading && !error ? (
            <View style={styles.headerMetaRow}>
              <View style={[styles.stagePill, stagePillStyle(summary).pill]}>
                <Text style={[styles.stagePillText, stagePillStyle(summary).text]}>{summary.stageLabel}</Text>
              </View>
              <View style={styles.datePill}>
                <MaterialCommunityIcons name="calendar" size={14} color="#054653" />
                <Text style={styles.datePillText}>{summary.when || '—'}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#054653" />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : !doc ? null : (
          <View style={{ gap: 12 }}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Details</Text>
              <RowLine label="Request Type" value={doc.requestType || '—'} />
              <RowLine label="Category" value={doc.requestCategory || '—'} />
              <RowLine label="Priority" value={doc.requestPriority || doc.priority || '—'} />
              <RowLine label="Status" value={String(doc.status || '—')} />
              <RowLine label="Approval Stage" value={doc.approvalStage || '—'} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Description</Text>
              <Text style={styles.bodyText}>{doc.description || '—'}</Text>
            </View>

            {String(doc.status || '').toUpperCase() === 'REJECTED' ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Rejection</Text>
                <RowLine label="Reason" value={doc.rejectionReason || '—'} />
                <RowLine label="Stage" value={doc.rejectionStage || '—'} />
                <RowLine label="Rejected By" value={doc.rejectedByName || doc.rejectedBy || '—'} />
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
      <HrBottomNav />
    </ThemedView>
  );
}

function RowLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowLine}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function stagePillStyle(summary: { status: string; stage: string }) {
  if (summary.status === 'REJECTED') return { pill: { backgroundColor: '#fef2f2' }, text: { color: '#b91c1c' } };
  if (summary.status === 'DRAFT') return { pill: { backgroundColor: '#f3f4f6' }, text: { color: '#6b7280' } };
  if (summary.status === 'APPROVED' || summary.stage === 'COMPLETED')
    return { pill: { backgroundColor: '#ecfdf5' }, text: { color: '#047857' } };
  if (summary.stage === 'FINANCE_COMPLETION') return { pill: { backgroundColor: '#fff7ed' }, text: { color: '#92400e' } };
  return { pill: { backgroundColor: '#eff6ff' }, text: { color: '#1d4ed8' } };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 140 },
  headerCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 5,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerKicker: { color: '#6b7280', fontSize: 11, fontWeight: '800' },
  headerTitle: { color: '#054653', fontSize: 18, fontWeight: '900' },
  headerSub: { marginTop: 2, color: '#111827', fontSize: 12, fontWeight: '700' },
  headerMetaRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stagePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  stagePillText: { fontSize: 11, fontWeight: '900' },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  datePillText: { color: '#054653', fontSize: 11, fontWeight: '800' },
  loadingBox: { paddingVertical: 26, alignItems: 'center' },
  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 12,
  },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  retryBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 12,
    backgroundColor: '#054653',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  retryText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardTitle: { color: '#054653', fontSize: 13, fontWeight: '900', marginBottom: 6 },
  rowLine: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowLabel: { color: '#6b7280', fontSize: 11, fontWeight: '800' },
  rowValue: { marginTop: 2, color: '#111827', fontSize: 13, fontWeight: '700' },
  bodyText: { color: '#111827', fontSize: 13, fontWeight: '600', lineHeight: 18 },
});

