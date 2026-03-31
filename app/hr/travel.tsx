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

  const financeDeptId = ((process.env as any)?.EXPO_PUBLIC_FINANCE_DEPARTMENT_ID ||
    (process.env as any)?.NEXT_PUBLIC_FINANCE_DEPARTMENT_ID ||
    '') as string;
  const isFinanceUser =
    (!!financeDeptId && String((user as any)?.departmentId || '') === financeDeptId) ||
    String((user as any)?.departmentName || '').toLowerCase().includes('finance') ||
    String((user as any)?.systemRole || '').toLowerCase().includes('finance');
  const canApprove =
    user?.systemRole === 'Senior Manager' || user?.systemRole === 'Supervisor' || isFinanceUser;
  const hasAdminAccess = user?.systemRole === 'Senior Manager';
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
  const [pendingFinance, setPendingFinance] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [approveStage, setApproveStage] = useState<'l1' | 'l2' | 'finance' | null>(null);
  const [approveComments, setApproveComments] = useState('');
  const [approving, setApproving] = useState(false);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectStage, setRejectStage] = useState<'l1' | 'l2' | 'finance' | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  const loadData = useCallback(async () => {
    if (!user?.$id) return;
    try {
      setError(null);
      setLoading(true);

      const [mine, l1, l2, fin] = await Promise.all([
        withTimeout(
          hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
            Query.equal('userId', user.$id),
            Query.orderDesc('submissionDate'),
            Query.limit(50),
          ]),
          12000,
          'Loading your travel requests timed out.',
        ),
        canApprove
          ? withTimeout(
              hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
                Query.equal('l1ApproverId', user.$id),
                Query.equal('status', 'pending'),
                Query.orderDesc('submissionDate'),
                Query.limit(50),
              ]),
              12000,
              'Loading L1 approvals timed out.',
            )
          : Promise.resolve({ documents: [] } as any),
        canApprove
          ? withTimeout(
              hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
                Query.equal('l2ApproverId', user.$id),
                Query.equal('status', 'l1_approved'),
                Query.orderDesc('submissionDate'),
                Query.limit(50),
              ]),
              12000,
              'Loading L2 approvals timed out.',
            )
          : Promise.resolve({ documents: [] } as any),
        isFinanceUser
          ? withTimeout(
              hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
                // Web parity: finance queue items are those that finished SM/L2 and are awaiting finance completion.
                // Some environments use different status strings; include both to avoid missing items.
                Query.or([
                  Query.equal('status', 'pending_finance'),
                  Query.equal('status', 'PENDING_FINANCE'),
                  Query.equal('status', 'l2_approved'),
                  Query.equal('status', 'L2_APPROVED'),
                ]),
                Query.orderDesc('l2ApprovalDate'),
                Query.limit(100),
              ]),
              12000,
              'Loading Finance approvals timed out.',
            )
          : Promise.resolve({ documents: [] } as any),
      ]);

      setMyRequests((mine as any).documents ?? []);
      setPendingL1((l1 as any).documents ?? []);
      setPendingL2((l2 as any).documents ?? []);
      setPendingFinance((fin as any).documents ?? []);
    } catch (e: any) {
      console.error('Failed to load travel requests', e);
      setError(e?.message || 'Failed to load travel requests');
    } finally {
      setLoading(false);
    }
  }, [user?.$id, canApprove, isFinanceUser]);

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

  const approvalTotal = useMemo(
    () => pendingL1.length + pendingL2.length + pendingFinance.length,
    [pendingL1, pendingL2, pendingFinance],
  );
  const myStats = useMemo(() => {
    const total = myRequests.length;
      const pending = myRequests.filter((r) =>
        ['pending', 'l1_approved', 'pending_finance'].includes(String(r.status || '').toLowerCase()),
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

  const canActOnApproval = useCallback(
    (t: any, stage: 'l1' | 'l2' | 'finance') => {
      if (!t || !user?.$id) return false;
      const requesterId = String(t.userId || '');
      // Web parity: no self-approval.
      if (requesterId && requesterId === String(user.$id)) return false;
      const status = String(t.status || '').toLowerCase();
      if (stage === 'l1') return String(t.l1ApproverId || '') === String(user.$id) && status === 'pending';
      if (stage === 'l2') return String(t.l2ApproverId || '') === String(user.$id) && status === 'l1_approved';
      return isFinanceUser && ['pending_finance', 'l2_approved'].includes(status);
    },
    [user?.$id, isFinanceUser],
  );

  const resolveActiveL2ApproverId = useCallback(async () => {
    // Mirror common web config: route L1-approved items to an active L2 approver.
    const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUEST_APPROVERS, [
      Query.equal('level', 'L2'),
      Query.equal('isActive', true),
      Query.limit(1),
    ]);
    const d = (res as any)?.documents?.[0];
    const uid = String(d?.userId || '').trim();
    if (!uid) throw new Error('No active L2 approver is configured. Please set one in Travel Approvers (Admin).');
    return uid;
  }, []);

  const openApprove = (t: any, stage: 'l1' | 'l2' | 'finance') => {
    if (!canActOnApproval(t, stage)) {
      Alert.alert('Not allowed', 'You are not the designated approver for this request at this stage.');
      return;
    }
    setApproveTarget(t);
    setApproveStage(stage);
    setApproveComments('');
    setApproveModalOpen(true);
  };

  const closeApprove = () => {
    if (approving) return;
    setApproveModalOpen(false);
    setApproveTarget(null);
    setApproveStage(null);
    setApproveComments('');
  };

  const confirmApprove = async () => {
    if (!approveTarget?.$id || !approveStage || !user?.$id) return;
    if (!canActOnApproval(approveTarget, approveStage)) {
      Alert.alert('Not allowed', 'You are not the designated approver for this request at this stage.');
      return;
    }
    setApproving(true);
    try {
      const now = new Date().toISOString();
      const update: any = {};

      if (approveStage === 'l1') {
        const l2Id = await resolveActiveL2ApproverId();
        update.status = 'l1_approved';
        update.l1ApprovalDate = now;
        update.l1Comments = approveComments.trim() || null;
        update.l2ApproverId = l2Id;
      } else if (approveStage === 'l2') {
        // After SM/L2 approval, the request should wait for Finance completion.
        update.status = 'pending_finance';
        update.l2ApprovalDate = now;
        update.l2Comments = approveComments.trim() || null;
      } else {
        update.status = 'completed';
        update.completedDate = now;
        update.completionComments = approveComments.trim() || null;
      }

      await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, String(approveTarget.$id), update);
      closeApprove();
      await loadData();
    } catch (e: any) {
      Alert.alert('Approve failed', e?.message || 'Unable to approve this travel request.');
    } finally {
      setApproving(false);
    }
  };

  const openReject = (t: any, stage: 'l1' | 'l2' | 'finance') => {
    if (!canActOnApproval(t, stage)) {
      Alert.alert('Not allowed', 'You are not the designated approver for this request at this stage.');
      return;
    }
    setRejectTarget(t);
    setRejectStage(stage);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const closeReject = () => {
    if (rejecting) return;
    setRejectModalOpen(false);
    setRejectTarget(null);
    setRejectStage(null);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectTarget?.$id || !rejectStage || !user?.$id) return;
    if (!canActOnApproval(rejectTarget, rejectStage)) {
      Alert.alert('Not allowed', 'You are not the designated approver for this request at this stage.');
      return;
    }
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert('Validation', 'Please enter a rejection reason.');
      return;
    }
    setRejecting(true);
    try {
      const now = new Date().toISOString();
      const update: any = {
        status: 'rejected',
        rejectionReason: reason,
        rejectedBy: String(user.$id),
        rejectionDate: now,
      };
      await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, String(rejectTarget.$id), update);
      closeReject();
      await loadData();
    } catch (e: any) {
      Alert.alert('Reject failed', e?.message || 'Unable to reject this travel request.');
    } finally {
      setRejecting(false);
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
          <View style={styles.headerTopRow}>
            <View style={styles.headerInfoRow}>
              <View style={styles.headerIconCircle}>
                <MaterialCommunityIcons name="airplane" size={20} color="#054653" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Travel Requests</Text>
                <Text style={styles.subtitle}>
                  {activeTab === 'my' ? 'Your requests and advances' : 'Requests waiting for approval'}
                </Text>
              </View>
            </View>
            {activeTab !== 'my' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable
                  onPress={() => setActiveTab('my')}
                  style={styles.headerBackBtn}
                  hitSlop={8}
                >
                  <MaterialCommunityIcons name="chevron-left" size={20} color="#054653" />
                </Pressable>
                <View style={styles.headerCountPill}>
                  <Text style={styles.headerCountText}>{approvalTotal}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {activeTab === 'my' ? (
            <View style={styles.headerActionsRow}>
              <View style={styles.headerActions}>
                {hasAdminAccess ? (
                  <Pressable
                    style={styles.adminButton}
                    onPress={() => {
                      router.push('/hr/travel/admin' as any);
                    }}
                  >
                    <MaterialCommunityIcons name="cog-outline" size={16} color="#374151" />
                    <Text style={styles.adminButtonText}>Admin</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={styles.newButton}
                  onPress={() => {
                    router.push('/hr/travel/new');
                  }}
                >
                  <MaterialCommunityIcons name="plus" size={18} color="#ffffff" />
                  <Text style={styles.newButtonText}>New Request</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
        
        <View style={styles.quickBar}>
          <Text style={styles.quickBarText}>
            {activeTab === 'my'
              ? `My requests: ${filteredMyRequests.length} | Pending approvals: ${approvalTotal}`
              : `Approvals queue: ${approvalTotal}`}
          </Text>
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
            <Text style={styles.loadingText}>Loading travel requests...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={loadData} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
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
                  <View key={t.$id} style={styles.row}>
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
                    <View style={styles.rowRight}>
                      <View style={[styles.badge, badgeStyle(t.status).pill]}>
                        <Text style={[styles.badgeText, badgeStyle(t.status).text]}>{badgeLabel(t.status)}</Text>
                      </View>
                      <View style={styles.rowActions}>
                        <Pressable
                          style={styles.actionIcon}
                          onPress={() => router.push(`/hr/travel/${t.requestId || t.$id}`)}
                        >
                          <MaterialCommunityIcons name="eye-outline" size={16} color="#054653" />
                        </Pressable>
                        {canActOnApproval(t, 'l1') ? (
                          <>
                            <Pressable style={styles.actionIcon} onPress={() => openApprove(t, 'l1')}>
                              <MaterialCommunityIcons name="check" size={18} color="#047857" />
                            </Pressable>
                            <Pressable style={styles.actionIcon} onPress={() => openReject(t, 'l1')}>
                              <MaterialCommunityIcons name="close" size={18} color="#b91c1c" />
                            </Pressable>
                          </>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            <View style={styles.listCard}>
              <Text style={styles.sectionLabel}>Pending L2</Text>
              {pendingL2.length === 0 ? (
                <Text style={styles.emptyText}>No L2 approvals.</Text>
              ) : (
                pendingL2.map((t) => (
                  <View key={t.$id} style={styles.row}>
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
                    <View style={styles.rowRight}>
                      <View style={[styles.badge, badgeStyle(t.status).pill]}>
                        <Text style={[styles.badgeText, badgeStyle(t.status).text]}>{badgeLabel(t.status)}</Text>
                      </View>
                      <View style={styles.rowActions}>
                        <Pressable
                          style={styles.actionIcon}
                          onPress={() => router.push(`/hr/travel/${t.requestId || t.$id}`)}
                        >
                          <MaterialCommunityIcons name="eye-outline" size={16} color="#054653" />
                        </Pressable>
                        {canActOnApproval(t, 'l2') ? (
                          <>
                            <Pressable style={styles.actionIcon} onPress={() => openApprove(t, 'l2')}>
                              <MaterialCommunityIcons name="check" size={18} color="#047857" />
                            </Pressable>
                            <Pressable style={styles.actionIcon} onPress={() => openReject(t, 'l2')}>
                              <MaterialCommunityIcons name="close" size={18} color="#b91c1c" />
                            </Pressable>
                          </>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            {isFinanceUser ? (
              <View style={styles.listCard}>
                <Text style={styles.sectionLabel}>Pending Finance</Text>
                {pendingFinance.length === 0 ? (
                  <Text style={styles.emptyText}>No finance items.</Text>
                ) : (
                  pendingFinance.map((t) => (
                    <View key={t.$id} style={styles.row}>
                      <View style={styles.rowLeft}>
                        <MaterialCommunityIcons name="cash-check" size={18} color="#054653" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {t.userName ? `${t.userName} • ` : ''}
                            {t.destination || t.activityName || 'Travel request'}
                          </Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {t.requestId ? `${t.requestId} • ` : ''}
                            {t.l2ApprovalDate ? new Date(t.l2ApprovalDate).toLocaleDateString() : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.rowRight}>
                        <View style={[styles.badge, badgeStyle(t.status).pill]}>
                          <Text style={[styles.badgeText, badgeStyle(t.status).text]}>{badgeLabel(t.status)}</Text>
                        </View>
                        <View style={styles.rowActions}>
                          <Pressable
                            style={styles.actionIcon}
                            onPress={() => router.push(`/hr/travel/${t.requestId || t.$id}`)}
                          >
                            <MaterialCommunityIcons name="eye-outline" size={16} color="#054653" />
                          </Pressable>
                          {canActOnApproval(t, 'finance') ? (
                            <>
                              <Pressable style={styles.actionIcon} onPress={() => openApprove(t, 'finance')}>
                                <MaterialCommunityIcons name="check-all" size={18} color="#047857" />
                              </Pressable>
                              <Pressable style={styles.actionIcon} onPress={() => openReject(t, 'finance')}>
                                <MaterialCommunityIcons name="close" size={18} color="#b91c1c" />
                              </Pressable>
                            </>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            ) : null}
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

      <Modal visible={approveModalOpen} transparent animationType="fade" onRequestClose={closeApprove}>
        <View style={styles.confirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeApprove} />
          <View style={styles.confirmCard}>
            <View style={[styles.confirmIcon, { backgroundColor: '#ecfdf5', borderColor: '#bbf7d0' }]}>
              <MaterialCommunityIcons name="check-decagram" size={22} color="#047857" />
            </View>
            <Text style={styles.confirmTitle}>Approve request?</Text>
            <Text style={styles.confirmText}>
              {approveStage === 'l1'
                ? 'This approves Level 1 and forwards to Level 2.'
                : approveStage === 'l2'
                  ? 'This completes Level 2 approval and sends it to Finance.'
                  : 'This completes Finance processing.'}
            </Text>
            <TextInput
              value={approveComments}
              onChangeText={setApproveComments}
              placeholder="Comments (optional)"
              placeholderTextColor="#9ca3af"
              style={styles.modalInput}
              multiline
            />
            <View style={styles.confirmActions}>
              <Pressable onPress={closeApprove} style={[styles.confirmBtn, styles.confirmBtnOutline]} disabled={approving}>
                <Text style={styles.confirmBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmApprove}
                style={[styles.confirmBtn, styles.confirmBtnApprove, approving && { opacity: 0.7 }]}
                disabled={approving}
              >
                <View style={styles.confirmBtnRow}>
                  {approving ? <ActivityIndicator color="#ffffff" /> : null}
                  <Text style={styles.confirmBtnTextApprove}>
                    {approving ? 'Working…' : approveStage === 'finance' ? 'Complete' : 'Approve'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={rejectModalOpen} transparent animationType="fade" onRequestClose={closeReject}>
        <View style={styles.confirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeReject} />
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <MaterialCommunityIcons name="close-circle-outline" size={22} color="#b91c1c" />
            </View>
            <Text style={styles.confirmTitle}>Reject request?</Text>
            <Text style={styles.confirmText}>This will mark the request as rejected and return it to the requester.</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Rejection reason *"
              placeholderTextColor="#9ca3af"
              style={styles.modalInput}
              multiline
            />
            <View style={styles.confirmActions}>
              <Pressable onPress={closeReject} style={[styles.confirmBtn, styles.confirmBtnOutline]} disabled={rejecting}>
                <Text style={styles.confirmBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={confirmReject}
                style={[styles.confirmBtn, styles.confirmBtnDanger, rejecting && { opacity: 0.7 }]}
                disabled={rejecting}
              >
                <View style={styles.confirmBtnRow}>
                  {rejecting ? <ActivityIndicator color="#ffffff" /> : null}
                  <Text style={styles.confirmBtnTextDanger}>{rejecting ? 'Rejecting…' : 'Reject'}</Text>
                </View>
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
  if (s === 'pending_finance' || s === 'l2_approved') return 'PENDING FINANCE';
  if (s === 'rejected') return 'REJECTED';
  if (s === 'completed') return 'COMPLETED';
  return (status || 'STATUS').toUpperCase();
}

function badgeStyle(status?: string) {
  const s = (status || '').toLowerCase();
  if (s === 'rejected') {
    return { pill: { backgroundColor: '#fef2f2' }, text: { color: '#b91c1c' } };
  }
  if (s === 'pending_finance' || s === 'l2_approved') {
    return { pill: { backgroundColor: '#fff7ed' }, text: { color: '#92400e' } };
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
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  headerActionsRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
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
  headerBackBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
  },
  adminButtonText: {
    color: '#374151',
    fontWeight: '800',
    fontSize: 11,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#054653',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
  },
  newButtonText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 11,
  },
  quickBar: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  quickBarText: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '700',
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
    gap: 8,
  },
  loadingText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
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
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#054653',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
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
  approveBtn: {
    borderRadius: 999,
    backgroundColor: '#054653',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  approveBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  rejectBtn: {
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rejectBtnText: { color: '#b91c1c', fontSize: 11, fontWeight: '900' },

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
  confirmBtnApprove: {
    backgroundColor: '#047857',
  },
  confirmBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmBtnTextOutline: { color: '#054653', fontSize: 12, fontWeight: '900' },
  confirmBtnTextDanger: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  confirmBtnTextApprove: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  modalInput: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 72,
    color: '#0f172a',
    textAlignVertical: 'top' as any,
  },
  approvalModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  approvalInput: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
    textAlignVertical: 'top',
  },
});

function withTimeout<T>(p: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

