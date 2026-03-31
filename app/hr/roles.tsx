import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import { HR_COLLECTIONS, HR_DB_ID, ID, hrDatabases, Query } from '@/lib/appwrite';

export default function HrRolesScreen() {
  const router = useRouter();
  // Web parity: Roles/Positions live under Departments module tabs on mobile.
  useEffect(() => {
    router.replace('/hr/departments?tab=roles' as any);
  }, [router]);
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { paddingHorizontal: 16, paddingBottom: 120 },
  headerCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#e6f4f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#054653', fontSize: 20, fontWeight: '900' },
  subtitle: { marginTop: 2, color: '#6b7280', fontSize: 13, fontWeight: '600' },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#054653',
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
  },
  newButtonText: { color: '#ffffff', fontWeight: '900', fontSize: 12 },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  segment: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  segmentActive: { borderColor: '#054653', backgroundColor: '#eef2f2' },
  segmentText: { fontSize: 11, color: '#6b7280', fontWeight: '800' },
  segmentTextActive: { color: '#054653' },
  searchCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: '#111827', fontSize: 13, fontWeight: '600' },
  listCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  rowTitle: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  loadingBox: {
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  errorBox: {
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  errorText: { color: '#991b1b', textAlign: 'center', fontWeight: '700' },
  retryBtn: { borderRadius: 12, backgroundColor: '#054653', paddingHorizontal: 12, paddingVertical: 10 },
  retryText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  emptyCard: {
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  emptyText: { fontSize: 13, color: '#6b7280', textAlign: 'center', fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a' },
  modalLabel: { marginTop: 12, color: '#111827', fontSize: 12, fontWeight: '900' },
  modalInput: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
    minHeight: 44,
  },
  modalActions: { marginTop: 14, flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalBtn: { flex: 1, borderRadius: 12, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalBtnOutline: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  modalBtnPrimary: { backgroundColor: '#054653' },
  modalBtnTextOutline: { color: '#334155', fontWeight: '900', fontSize: 12 },
  modalBtnTextPrimary: { color: '#ffffff', fontWeight: '900', fontSize: 12 },
});

