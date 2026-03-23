import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
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
import { HR_COLLECTIONS, HR_DB_ID, hrDatabases, Query } from '@/lib/appwrite';

export default function HrTravelScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const canApprove = user?.systemRole === 'Senior Manager' || user?.systemRole === 'Supervisor';
  const [activeTab, setActiveTab] = useState<'my' | 'approvals'>('my');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>(
    'all',
  );
  const [search, setSearch] = useState('');

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [pendingL1, setPendingL1] = useState<any[]>([]);
  const [pendingL2, setPendingL2] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  const loadData = useCallback(async () => {
    if (!user?.$id) return;
    try {
      setError(null);
      setLoading(true);

      const [mine, l1, l2] = await Promise.all([
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
          Query.equal('userId', user.$id),
          Query.orderDesc('submissionDate'),
          Query.limit(50),
        ]),
        canApprove
          ? hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
              Query.equal('l1ApproverId', user.$id),
              Query.equal('status', 'pending'),
              Query.orderDesc('submissionDate'),
              Query.limit(50),
            ])
          : Promise.resolve({ documents: [] } as any),
        canApprove
          ? hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
              Query.equal('l2ApproverId', user.$id),
              Query.equal('status', 'l1_approved'),
              Query.orderDesc('submissionDate'),
              Query.limit(50),
            ])
          : Promise.resolve({ documents: [] } as any),
      ]);

      setMyRequests((mine as any).documents ?? []);
      setPendingL1((l1 as any).documents ?? []);
      setPendingL2((l2 as any).documents ?? []);
    } catch (e: any) {
      console.error('Failed to load travel requests', e);
      setError(e?.message || 'Failed to load travel requests');
    } finally {
      setLoading(false);
    }
  }, [user?.$id, canApprove]);

  useEffect(() => {
    if (!isLoading && user?.$id) {
      loadData();
    }
  }, [isLoading, user?.$id, loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const approvalTotal = useMemo(() => pendingL1.length + pendingL2.length, [pendingL1, pendingL2]);
  const myStats = useMemo(() => {
    const total = myRequests.length;
    const pending = myRequests.filter((r) =>
      ['pending', 'l1_approved'].includes(String(r.status || '').toLowerCase()),
    ).length;
    const approved = myRequests.filter((r) =>
      ['l2_approved', 'completed'].includes(String(r.status || '').toLowerCase()),
    ).length;
    return { total, pending, approved };
  }, [myRequests]);

  const filteredMyRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return myRequests.filter((r) => {
      const status = String(r.status || '').toLowerCase();
      const matchesStatus =
        statusFilter === 'all' ? true
        : statusFilter === 'pending' ? ['pending', 'l1_approved'].includes(status)
        : statusFilter === 'approved' ? ['l2_approved', 'completed'].includes(status)
        : statusFilter === 'rejected' ? status === 'rejected'
        : true;

      if (!matchesStatus) return false;
      if (!q) return true;

      const haystack = [
        r.requestId,
        r.destination,
        r.origin,
        r.activityName,
        r.projectName,
        r.userName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [myRequests, search, statusFilter]);

  if (isLoading || !user) return null;

  const openDeleteModal = (doc: any) => {
    setDeleteTarget(doc);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.$id) return;
    setDeleting(true);
    try {
      await hrDatabases.deleteDocument(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, deleteTarget.$id);
      closeDeleteModal();
      await loadData();
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Unable to delete this request.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#054653" />
        }
      >
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconCircle}>
              <MaterialCommunityIcons name="airplane" size={20} color="#054653" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Travel Requests</Text>
              <Text style={styles.subtitle}>
                {activeTab === 'my' ? 'Your requests and advances' : 'Requests waiting for approval'}
              </Text>
            </View>
            {activeTab === 'my' ? (
              <Pressable
                style={styles.newButton}
                onPress={() => {
                  router.push('/hr/travel/new');
                }}
              >
                <MaterialCommunityIcons name="plus" size={18} color="#ffffff" />
                <Text style={styles.newButtonText}>New</Text>
              </Pressable>
            ) : (
              <View style={styles.headerCountPill}>
                <Text style={styles.headerCountText}>{approvalTotal}</Text>
              </View>
            )}
          </View>
        </View>

        {activeTab === 'my' && (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statChip}>
                <Text style={styles.statChipLabel}>Total</Text>
                <Text style={styles.statChipValue}>{myStats.total}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipLabel}>Pending</Text>
                <Text style={styles.statChipValue}>{myStats.pending}</Text>
              </View>
              <View style={styles.statChip}>
                <Text style={styles.statChipLabel}>Approved</Text>
                <Text style={styles.statChipValue}>{myStats.approved}</Text>
              </View>
            </View>

            <View style={styles.filterCard}>
              <View style={styles.searchRow}>
                <MaterialCommunityIcons name="magnify" size={18} color="#6b7280" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search destination, request ID..."
                  placeholderTextColor="#9ca3af"
                  style={styles.searchInput}
                />
                {search ? (
                  <Pressable onPress={() => setSearch('')}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#9ca3af" />
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.chipsRow}>
                <FilterChip label="All" active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} />
                <FilterChip
                  label="Pending"
                  active={statusFilter === 'pending'}
                  onPress={() => setStatusFilter('pending')}
                />
                <FilterChip
                  label="Approved"
                  active={statusFilter === 'approved'}
                  onPress={() => setStatusFilter('approved')}
                />
                <FilterChip
                  label="Rejected"
                  active={statusFilter === 'rejected'}
                  onPress={() => setStatusFilter('rejected')}
                />
              </View>
            </View>
          </>
        )}

        {canApprove && (
          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => setActiveTab('my')}
              style={[styles.segment, activeTab === 'my' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, activeTab === 'my' && styles.segmentTextActive]}>
                My Requests
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('approvals')}
              style={[styles.segment, activeTab === 'approvals' && styles.segmentActive]}
            >
              <Text
                style={[
                  styles.segmentText,
                  activeTab === 'approvals' && styles.segmentTextActive,
                ]}
              >
                Approvals ({approvalTotal})
              </Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#054653" />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : activeTab === 'my' ? (
          <View style={styles.listCard}>
            {filteredMyRequests.length === 0 ? (
              <Text style={styles.emptyText}>No travel requests yet.</Text>
            ) : (
              filteredMyRequests.map((t) => (
                <Pressable
                  key={t.$id}
                  style={styles.row}
                  onPress={() => {
                    router.push(`/hr/travel/${t.requestId || t.$id}`);
                  }}
                >
                  <View style={styles.rowLeft}>
                    <MaterialCommunityIcons name="airplane" size={18} color="#054653" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {t.destination || t.activityName || 'Travel request'}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {t.requestId ? `${t.requestId} • ` : ''}
                        {t.submissionDate ? new Date(t.submissionDate).toLocaleDateString() : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.rowRight}>
                    <View style={[styles.badge, badgeStyle(t.status).pill]}>
                      <Text style={[styles.badgeText, badgeStyle(t.status).text]}>
                        {badgeLabel(t.status)}
                      </Text>
                    </View>

                    <View style={styles.rowActions}>
                      <Pressable
                        style={styles.actionIcon}
                        onPress={() => {
                          router.push(`/hr/travel/${t.requestId || t.$id}`);
                        }}
                      >
                        <MaterialCommunityIcons name="eye-outline" size={16} color="#054653" />
                      </Pressable>

                      {['pending', 'rejected'].includes(String(t.status || '').toLowerCase()) ? (
                        <>
                          <Pressable
                            style={styles.actionIcon}
                            onPress={() => {
                              router.push(`/hr/travel/${t.requestId || t.$id}/edit`);
                            }}
                          >
                            <MaterialCommunityIcons name="pencil-outline" size={16} color="#054653" />
                          </Pressable>

                          <Pressable
                            style={styles.actionIcon}
                            onPress={() => {
                              openDeleteModal(t);
                            }}
                          >
                            <MaterialCommunityIcons name="trash-can-outline" size={16} color="#b91c1c" />
                          </Pressable>
                        </>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={styles.listCard}>
              <Text style={styles.sectionLabel}>Pending L1</Text>
              {pendingL1.length === 0 ? (
                <Text style={styles.emptyText}>No L1 approvals.</Text>
              ) : (
                pendingL1.map((t) => (
                  <Pressable key={t.$id} style={styles.row} onPress={() => {}}>
                    <View style={styles.rowLeft}>
                      <MaterialCommunityIcons name="clipboard-check-outline" size={18} color="#054653" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {t.userName ? `${t.userName} • ` : ''}
                          {t.destination || t.activityName || 'Travel request'}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {t.requestId ? `${t.requestId} • ` : ''}
                          {t.submissionDate ? new Date(t.submissionDate).toLocaleDateString() : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.badge, badgeStyle(t.status).pill]}>
                      <Text style={[styles.badgeText, badgeStyle(t.status).text]}>
                        {badgeLabel(t.status)}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>

            <View style={styles.listCard}>
              <Text style={styles.sectionLabel}>Pending L2</Text>
              {pendingL2.length === 0 ? (
                <Text style={styles.emptyText}>No L2 approvals.</Text>
              ) : (
                pendingL2.map((t) => (
                  <Pressable key={t.$id} style={styles.row} onPress={() => {}}>
                    <View style={styles.rowLeft}>
                      <MaterialCommunityIcons name="clipboard-check-outline" size={18} color="#054653" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>
                          {t.userName ? `${t.userName} • ` : ''}
                          {t.destination || t.activityName || 'Travel request'}
                        </Text>
                        <Text style={styles.rowMeta} numberOfLines={1}>
                          {t.requestId ? `${t.requestId} • ` : ''}
                          {t.submissionDate ? new Date(t.submissionDate).toLocaleDateString() : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.badge, badgeStyle(t.status).pill]}>
                      <Text style={[styles.badgeText, badgeStyle(t.status).text]}>
                        {badgeLabel(t.status)}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
      <HrBottomNav />

      <Modal
        visible={deleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <View style={styles.confirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDeleteModal} />
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#b91c1c" />
            </View>
            <Text style={styles.confirmTitle}>Delete travel request?</Text>
            <Text style={styles.confirmText}>
              This will permanently delete this travel request. This action cannot be undone.
            </Text>

            {deleteTarget?.requestId ? (
              <View style={styles.confirmPill}>
                <Text style={styles.confirmPillLabel}>Request ID</Text>
                <Text style={styles.confirmPillValue}>{String(deleteTarget.requestId)}</Text>
              </View>
            ) : null}

            <View style={styles.confirmActions}>
              <Pressable
                onPress={closeDeleteModal}
                disabled={deleting}
                style={[styles.confirmBtn, styles.confirmBtnOutline, deleting && { opacity: 0.6 }]}
              >
                <Text style={styles.confirmBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                disabled={deleting}
                style={[styles.confirmBtn, styles.confirmBtnDanger, deleting && { opacity: 0.7 }]}
              >
                {deleting ? (
                  <View style={styles.confirmBtnRow}>
                    <ActivityIndicator color="#ffffff" />
                    <Text style={styles.confirmBtnTextDanger}>Deleting…</Text>
                  </View>
                ) : (
                  <Text style={styles.confirmBtnTextDanger}>Delete</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function badgeLabel(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return 'PENDING L1';
  if (s === 'l1_approved') return 'PENDING L2';
  if (s === 'l2_approved') return 'APPROVED';
  if (s === 'rejected') return 'REJECTED';
  if (s === 'completed') return 'COMPLETED';
  return (status || 'STATUS').toUpperCase();
}

function badgeStyle(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'rejected') {
    return { pill: { backgroundColor: '#fef2f2' }, text: { color: '#b91c1c' } };
  }
  if (s === 'l2_approved') {
    return { pill: { backgroundColor: '#ecfdf5' }, text: { color: '#047857' } };
  }
  if (s === 'l1_approved') {
    return { pill: { backgroundColor: '#eff6ff' }, text: { color: '#1d4ed8' } };
  }
  return { pill: { backgroundColor: '#fff7ed' }, text: { color: '#92400e' } };
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e6f4f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#054653', fontSize: 20, fontWeight: '900' },
  subtitle: { marginTop: 4, color: '#6b7280', fontSize: 12 },
  headerCountPill: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#054653',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  headerCountText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#054653',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  newButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  statChip: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  statChipLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '700',
  },
  statChipValue: {
    marginTop: 4,
    fontSize: 18,
    color: '#054653',
    fontWeight: '900',
  },
  filterCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
    paddingVertical: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  filterChipActive: {
    borderColor: '#054653',
    backgroundColor: '#e6f4f2',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
  },
  filterChipTextActive: {
    color: '#054653',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  segmentActive: {
    borderColor: '#054653',
    backgroundColor: '#eef2f2',
  },
  segmentText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
  },
  segmentTextActive: {
    color: '#054653',
  },
  loadingBox: {
    paddingVertical: 26,
    alignItems: 'center',
  },
  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 12,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
  },
  listCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sectionLabel: {
    color: '#054653',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 6,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#6b7280',
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIcon: {
    padding: 6,
  },

  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  confirmIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  confirmTitle: {
    marginTop: 10,
    color: '#111827',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  confirmText: {
    marginTop: 6,
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmPill: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  confirmPillLabel: { color: '#6b7280', fontSize: 11, fontWeight: '800' },
  confirmPillValue: { marginTop: 4, color: '#b91c1c', fontSize: 16, fontWeight: '900' },
  confirmActions: { marginTop: 14, flexDirection: 'row', gap: 10 },
  confirmBtn: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnOutline: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  confirmBtnDanger: {
    backgroundColor: '#b91c1c',
  },
  confirmBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmBtnTextOutline: { color: '#054653', fontSize: 12, fontWeight: '900' },
  confirmBtnTextDanger: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
});

