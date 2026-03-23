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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import { HR_COLLECTIONS, HR_DB_ID, hrDatabases, Query } from '@/lib/appwrite';

export default function HrRequestsScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const PAGE_SIZE = 10;
  const [items, setItems] = useState<any[]>([]);
  const [approvalItems, setApprovalItems] = useState<any[]>([]);
  const [completedItems, setCompletedItems] = useState<any[]>([]);
  const [approvers, setApprovers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'my' | 'approvals' | 'completed'>('my');
  const [page, setPage] = useState(0); // 0-based (client-side paging)
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'pending' | 'approved' | 'rejected'>('all');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [approveStage, setApproveStage] = useState<'department' | 'l1' | 'l2' | 'finance' | null>(null);
  const [approveSelectedUserId, setApproveSelectedUserId] = useState<string>('');
  const [approveRequiresFinance, setApproveRequiresFinance] = useState(false);
  const [approveComments, setApproveComments] = useState('');
  const [approving, setApproving] = useState(false);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  const hasMore = useMemo(() => {
    if (total === null) return false;
    return items.length < total;
  }, [items.length, total]);

  const loadAll = useCallback(async () => {
    if (!user?.$id) return;
    try {
      setLoading(true);
      setError(null);
      const isFinanceUser =
        String(user.departmentName || '').toLowerCase().includes('finance') ||
        String(user.systemRole || '').toLowerCase().includes('finance');
      const isSeniorManager = String(user.systemRole || '').toLowerCase() === 'senior manager';
      const canSeeCompleted = isFinanceUser || isSeniorManager;

      const baseUserId = user.$id;

      const [mine, dept, l1, l2, finance, approverDocs, completed] = await Promise.all([
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('userId', baseUserId),
          Query.orderDesc('submissionDate'),
          Query.limit(100),
        ]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('departmentReviewerId', baseUserId),
          Query.equal('approvalStage', 'DEPARTMENT_REVIEW'),
          Query.orderDesc('submissionDate'),
          Query.limit(50),
        ]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('l1ApproverId', baseUserId),
          Query.equal('approvalStage', 'L1_APPROVAL'),
          Query.orderDesc('submissionDate'),
          Query.limit(50),
        ]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('l2ApproverId', baseUserId),
          Query.equal('approvalStage', 'L2_APPROVAL'),
          Query.orderDesc('submissionDate'),
          Query.limit(50),
        ]),
        canSeeCompleted
          ? hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
              Query.equal('approvalStage', 'FINANCE_COMPLETION'),
              Query.orderDesc('submissionDate'),
              Query.limit(50),
            ])
          : Promise.resolve({ documents: [] } as any),
        HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS
          ? hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS as any, [
              Query.equal('isActive', true),
              Query.orderAsc('approverName'),
              Query.limit(200),
            ])
          : Promise.resolve({ documents: [] } as any),
        canSeeCompleted
          ? hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
              Query.equal('status', 'APPROVED'),
              Query.equal('approvalStage', 'COMPLETED'),
              Query.orderDesc('completionDate'),
              Query.limit(100),
            ])
          : Promise.resolve({ documents: [] } as any),
      ]);

      setItems((mine as any)?.documents ?? []);
      setTotal((mine as any)?.total ?? (mine as any)?.documents?.length ?? 0);

      const approvals = [
        ...(((dept as any)?.documents ?? []) as any[]).map((d) => ({ ...d, __queue: 'department' })),
        ...(((l1 as any)?.documents ?? []) as any[]).map((d) => ({ ...d, __queue: 'l1' })),
        ...(((l2 as any)?.documents ?? []) as any[]).map((d) => ({ ...d, __queue: 'l2' })),
        ...(((finance as any)?.documents ?? []) as any[]).map((d) => ({ ...d, __queue: 'finance' })),
      ].sort((a: any, b: any) => {
        const ad = new Date(a.submissionDate || a.$createdAt || 0).getTime();
        const bd = new Date(b.submissionDate || b.$createdAt || 0).getTime();
        return bd - ad;
      });
      setApprovalItems(approvals);
      setApprovers(((approverDocs as any)?.documents ?? []) as any[]);
      setCompletedItems(((completed as any)?.documents ?? []) as any[]);

      setPage(0);
    } catch (e: any) {
      setError(e?.message || 'Failed to load requests');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user?.$id, user?.departmentName, user?.systemRole]);

  const loadPage = useCallback(
    async (nextPage: number, mode: 'replace' | 'append') => {
      if (!user?.$id) return;
      try {
        mode === 'append' ? setLoadingMore(true) : setLoading(true);
        setError(null);

        const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('userId', user.$id),
          Query.orderDesc('submissionDate'),
          Query.limit(PAGE_SIZE),
          Query.offset(nextPage * PAGE_SIZE),
        ]);

        const docs = (res as any)?.documents ?? [];
        const totalCount = (res as any)?.total ?? docs.length;
        setTotal(totalCount);
        setPage(nextPage);
        setItems((prev) => (mode === 'append' ? [...prev, ...docs] : docs));
      } catch (e: any) {
        setError(e?.message || 'Failed to load requests');
      } finally {
        mode === 'append' ? setLoadingMore(false) : setLoading(false);
      }
    },
    [user?.$id],
  );

  useEffect(() => {
    if (!isLoading && user?.$id) {
      loadAll();
    }
  }, [isLoading, user?.$id, loadAll]);

  // NOTE: These useMemo hooks must NOT be placed after an early return,
  // otherwise eslint will flag "React Hook is called conditionally".
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      const status = String(r.status || '').toUpperCase();
      const stage = String(r.approvalStage || '').toUpperCase();

      const matchesStatus =
        statusFilter === 'all' ? true
        : statusFilter === 'draft' ? status === 'DRAFT'
        : statusFilter === 'rejected' ? status === 'REJECTED'
        : statusFilter === 'approved' ? status === 'APPROVED'
        : statusFilter === 'pending'
          ? ['PENDING', 'DEPT_APPROVED', 'L1_APPROVED', 'L2_APPROVED'].includes(status) ||
            ['DEPARTMENT_REVIEW', 'L1_APPROVAL', 'L2_APPROVAL', 'FINANCE_COMPLETION'].includes(stage)
          : true;

      if (!matchesStatus) return false;
      if (!q) return true;

      const hay = [r.requestId, r.subject, r.requestType, r.requestCategory, r.status, r.approvalStage]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, statusFilter]);

  const metrics = useMemo(() => {
    const upper = (v: any) => String(v || '').toUpperCase();
    return {
      total: items.length,
      draft: items.filter((r) => upper(r.status) === 'DRAFT').length,
      pending: items.filter((r) => ['PENDING', 'DEPT_APPROVED', 'L1_APPROVED', 'L2_APPROVED'].includes(upper(r.status))).length,
      completed: items.filter((r) => upper(r.status) === 'APPROVED').length,
      rejected: items.filter((r) => upper(r.status) === 'REJECTED').length,
    };
  }, [items]);

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
      await hrDatabases.deleteDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, deleteTarget.$id);
      closeDeleteModal();
      await loadAll();
    } catch (e: any) {
      Alert.alert('Delete failed', e?.message || 'Unable to delete this request.');
    } finally {
      setDeleting(false);
    }
  };

  const canApprove = approvalItems.length > 0;
  const financeDeptId = ((process.env as any)?.EXPO_PUBLIC_FINANCE_DEPARTMENT_ID ||
    (process.env as any)?.NEXT_PUBLIC_FINANCE_DEPARTMENT_ID ||
    '') as string;
  const isFinanceUser = !!financeDeptId && String((user as any).departmentId || '') === financeDeptId;
  const isSeniorManager = String(user.systemRole || '').toLowerCase() === 'senior manager';
  const canSeeCompleted = isFinanceUser || isSeniorManager;

  const openApprove = (doc: any) => {
    const queue = (doc?.__queue || '') as any;
    setApproveTarget(doc);
    setApproveStage(queue === 'department' ? 'department' : queue === 'l1' ? 'l1' : queue === 'l2' ? 'l2' : 'finance');
    setApproveSelectedUserId('');
    setApproveRequiresFinance(false);
    setApproveComments('');
    setApproveModalOpen(true);
  };

  const closeApprove = () => {
    if (approving) return;
    setApproveModalOpen(false);
    setApproveTarget(null);
    setApproveStage(null);
    setApproveSelectedUserId('');
    setApproveRequiresFinance(false);
    setApproveComments('');
  };

  const openReject = (doc: any) => {
    setRejectTarget(doc);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const closeReject = () => {
    if (rejecting) return;
    setRejectModalOpen(false);
    setRejectTarget(null);
    setRejectReason('');
  };

  const performApprove = async () => {
    if (!approveTarget?.$id || !approveStage) return;
    try {
      setApproving(true);
      const now = new Date().toISOString();
      const meId = user.$id;
      const meName = user.name || user.email || 'Approver';

      if (approveStage === 'department') {
        if (!approveSelectedUserId) throw new Error('Select an L1 approver to continue.');
        const l1 = approvers.find((a) => String(a.userId) === String(approveSelectedUserId));
        await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, approveTarget.$id, {
          status: 'DEPT_APPROVED',
          approvalStage: 'L1_APPROVAL',
          departmentReviewDate: now,
          departmentReviewComments: approveComments || '',
          l1ApproverId: approveSelectedUserId,
          l1ApproverName: l1?.approverName || l1?.name || null,
        });
        // Best-effort emails (approver + requester)
        await notifyStageChangeBestEffort({
          request: approveTarget,
          nextStageLabel: 'Department Approved → L1 Approval',
          nextApproverUserId: approveSelectedUserId,
          requesterUserId: approveTarget.userId,
        });
      } else if (approveStage === 'l1') {
        if (!approveSelectedUserId) throw new Error('Select an L2 approver to continue.');
        const l2 = approvers.find((a) => String(a.userId) === String(approveSelectedUserId));
        await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, approveTarget.$id, {
          status: 'L1_APPROVED',
          approvalStage: 'L2_APPROVAL',
          l1ApprovalDate: now,
          l1Comments: approveComments || '',
          l2ApproverId: approveSelectedUserId,
          l2ApproverName: l2?.approverName || l2?.name || null,
        });
        await notifyStageChangeBestEffort({
          request: approveTarget,
          nextStageLabel: 'L1 Approved → L2 Approval',
          nextApproverUserId: approveSelectedUserId,
          requesterUserId: approveTarget.userId,
        });
      } else if (approveStage === 'l2') {
        if (approveRequiresFinance) {
          await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, approveTarget.$id, {
            status: 'PENDING',
            approvalStage: 'FINANCE_COMPLETION',
            financeRequired: true,
            l2ApprovalDate: now,
            l2Comments: approveComments || '',
          });
          await notifyStageChangeBestEffort({
            request: approveTarget,
            nextStageLabel: 'L2 Approved → Finance Review',
            nextApproverUserId: null,
            requesterUserId: approveTarget.userId,
          });
        } else {
          await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, approveTarget.$id, {
            status: 'APPROVED',
            approvalStage: 'COMPLETED',
            financeRequired: false,
            l2ApprovalDate: now,
            l2Comments: approveComments || '',
            completedBy: meId,
            completedByName: meName,
            completionDate: now,
            actualCompletionDate: now,
          });
          await notifyCompletionBestEffort({ request: approveTarget, requesterUserId: approveTarget.userId });
        }
      } else if (approveStage === 'finance') {
        await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, approveTarget.$id, {
          status: 'APPROVED',
          approvalStage: 'COMPLETED',
          financeRequired: false,
          financeCompletionNotes: approveComments || '',
          completedBy: meId,
          completedByName: meName,
          completionDate: now,
          actualCompletionDate: now,
        });
        await notifyCompletionBestEffort({ request: approveTarget, requesterUserId: approveTarget.userId });
      }

      closeApprove();
      await loadAll();
    } catch (e: any) {
      Alert.alert('Approval failed', e?.message || 'Unable to approve this request.');
    } finally {
      setApproving(false);
    }
  };

  const performReject = async () => {
    if (!rejectTarget?.$id) return;
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert('Rejection reason required', 'Please provide a reason before rejecting.');
      return;
    }
    try {
      setRejecting(true);
      const now = new Date().toISOString();
      const stage = String(rejectTarget.approvalStage || '').toUpperCase();

      const updateData: any = {
        status: 'REJECTED',
        rejectedBy: user.$id,
        rejectedByName: user.name || user.email || 'Approver',
        rejectionReason: reason,
        rejectionDate: now,
        rejectionStage: stage || null,
        lastRejectedAt: now,
      };

      // Stage reversion logic (mirrors web simplified workflow)
      if (stage === 'FINANCE_COMPLETION') {
        updateData.approvalStage = 'L2_APPROVAL';
      } else if (stage === 'L2_APPROVAL') {
        updateData.approvalStage = 'L1_APPROVAL';
        updateData.l2ApproverId = null;
        updateData.l2ApproverName = null;
        updateData.l2ApprovalDate = null;
        updateData.l2Comments = null;
      } else if (stage === 'L1_APPROVAL') {
        if (rejectTarget.departmentReviewerId && rejectTarget.departmentReviewDate) {
          updateData.approvalStage = 'DEPARTMENT_REVIEW';
        } else {
          updateData.approvalStage = null;
        }
        updateData.l1ApproverId = null;
        updateData.l1ApproverName = null;
        updateData.l1ApprovalDate = null;
        updateData.l1Comments = null;
      } else if (stage === 'DEPARTMENT_REVIEW') {
        updateData.approvalStage = null;
        updateData.departmentReviewerId = null;
        updateData.departmentReviewerName = null;
        updateData.departmentReviewDate = null;
        updateData.departmentReviewComments = null;
      } else {
        updateData.approvalStage = null;
      }

      await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, rejectTarget.$id, updateData);
      await notifyRejectionBestEffort({ request: rejectTarget, requesterUserId: rejectTarget.userId, reason });
      closeReject();
      await loadAll();
    } catch (e: any) {
      Alert.alert('Rejection failed', e?.message || 'Unable to reject this request.');
    } finally {
      setRejecting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconCircle}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={20} color="#054653" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Requests</Text>
              <Text style={styles.subtitle}>Your general requests</Text>
            </View>
            <Pressable style={styles.newButton} onPress={() => router.push('/hr/requests/new' as any)}>
              <MaterialCommunityIcons name="plus" size={18} color="#ffffff" />
              <Text style={styles.newButtonText}>New</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.segmentRow}>
          <Pressable
            onPress={() => setActiveTab('my')}
            style={[styles.segment, activeTab === 'my' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, activeTab === 'my' && styles.segmentTextActive]}>My Requests</Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('approvals')}
            style={[styles.segment, activeTab === 'approvals' && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, activeTab === 'approvals' && styles.segmentTextActive]}>
              Approvals ({approvalItems.length})
            </Text>
          </Pressable>
          {canSeeCompleted ? (
            <Pressable
              onPress={() => setActiveTab('completed')}
              style={[styles.segment, activeTab === 'completed' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, activeTab === 'completed' && styles.segmentTextActive]}>
                Completed ({completedItems.length})
              </Text>
            </Pressable>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#054653" />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={loadAll} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : items.length === 0 && activeTab === 'my' ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No requests yet.</Text>
          </View>
        ) : (
          <>
            {activeTab === 'my' ? (
              <>
                <View style={styles.metricsRow}>
                  <View style={styles.metricChip}>
                    <Text style={styles.metricLabel}>Total</Text>
                    <Text style={styles.metricValue}>{metrics.total}</Text>
                  </View>
                  <View style={styles.metricChip}>
                    <Text style={styles.metricLabel}>Pending</Text>
                    <Text style={styles.metricValue}>{metrics.pending}</Text>
                  </View>
                  <View style={styles.metricChip}>
                    <Text style={styles.metricLabel}>Completed</Text>
                    <Text style={styles.metricValue}>{metrics.completed}</Text>
                  </View>
                </View>

                <View style={styles.filterCard}>
                  <View style={styles.searchRow}>
                    <MaterialCommunityIcons name="magnify" size={18} color="#6b7280" />
                    <TextInput
                      value={search}
                      onChangeText={(v) => {
                        setSearch(v);
                        setPage(0);
                      }}
                      placeholder="Search request ID, subject..."
                      placeholderTextColor="#9ca3af"
                      style={styles.searchInput}
                    />
                    {search ? (
                      <Pressable
                        onPress={() => {
                          setSearch('');
                          setPage(0);
                        }}
                      >
                        <MaterialCommunityIcons name="close-circle" size={18} color="#9ca3af" />
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.chipsRow}>
                    <FilterChip label="All" active={statusFilter === 'all'} onPress={() => { setStatusFilter('all'); setPage(0); }} />
                    <FilterChip label="Draft" active={statusFilter === 'draft'} onPress={() => { setStatusFilter('draft'); setPage(0); }} />
                    <FilterChip label="Pending" active={statusFilter === 'pending'} onPress={() => { setStatusFilter('pending'); setPage(0); }} />
                    <FilterChip label="Approved" active={statusFilter === 'approved'} onPress={() => { setStatusFilter('approved'); setPage(0); }} />
                    <FilterChip label="Rejected" active={statusFilter === 'rejected'} onPress={() => { setStatusFilter('rejected'); setPage(0); }} />
                  </View>
                </View>

                <View style={styles.listCard}>
                  {pageItems.map((r) => {
                    const canEdit = canEditRequest(r, user);
                    const canDelete = String(r.status || '').toUpperCase() === 'DRAFT';
                    const t = typeColor(r.requestType);
                    return (
                      <Pressable key={r.$id} style={styles.row} onPress={() => router.push(`/hr/requests/${r.$id}` as any)}>
                        <View style={styles.rowLeft}>
                          <View style={[styles.typeIconWrap, { backgroundColor: t.bg }]}>
                            <MaterialCommunityIcons name={t.icon as any} size={18} color={t.fg} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle} numberOfLines={1}>
                              {r.subject || r.title || r.requestId || 'General request'}
                            </Text>
                            <Text style={styles.rowMeta} numberOfLines={1}>
                              {r.requestId ? `${r.requestId} • ` : ''}
                              {r.submissionDate ? new Date(r.submissionDate).toLocaleDateString() : ''}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.rowRight}>
                          <View style={[styles.badge, stageBadgeStyle(r).pill]}>
                            <Text style={[styles.badgeText, stageBadgeStyle(r).text]}>{stageLabel(r)}</Text>
                          </View>
                          <View style={styles.rowActions}>
                            <Pressable style={styles.actionIcon} onPress={() => router.push(`/hr/requests/${r.$id}` as any)}>
                              <MaterialCommunityIcons name="eye-outline" size={16} color="#054653" />
                            </Pressable>
                            {canEdit ? (
                              <Pressable style={styles.actionIcon} onPress={() => router.push(`/hr/requests/${r.$id}/edit` as any)}>
                                <MaterialCommunityIcons name="pencil-outline" size={16} color="#054653" />
                              </Pressable>
                            ) : null}
                            {canDelete ? (
                              <Pressable style={styles.actionIcon} onPress={() => openDeleteModal(r)}>
                                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#b91c1c" />
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : activeTab === 'approvals' ? (
              <View style={styles.listCard}>
                {approvalItems.length === 0 ? (
                  <Text style={styles.emptyText}>No pending approvals.</Text>
                ) : (
                  groupApprovalItems(approvalItems).map((g) => (
                    <View key={g.key}>
                      <Text style={styles.sectionLabel}>
                        {g.label} ({g.items.length})
                      </Text>
                      {g.items.map((r) => (
                        <View key={r.$id} style={styles.approvalRow}>
                      <View style={styles.rowLeft}>
                        <View style={styles.approvalIconCircle}>
                          <MaterialCommunityIcons name="clipboard-check-outline" size={18} color="#054653" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {r.userName ? `${r.userName} • ` : ''}
                            {r.subject || r.requestId || 'Request'}
                          </Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {r.requestId ? `${r.requestId} • ` : ''}
                            {stageLabel(r)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.approvalActions}>
                        <Pressable style={styles.actionIcon} onPress={() => router.push(`/hr/requests/${r.$id}` as any)}>
                          <MaterialCommunityIcons name="eye-outline" size={16} color="#054653" />
                        </Pressable>
                        {canEditRequest(r, user) ? (
                          <Pressable
                            style={styles.actionIcon}
                            onPress={() => router.push(`/hr/requests/${r.$id}/edit` as any)}
                          >
                            <MaterialCommunityIcons name="pencil-outline" size={16} color="#054653" />
                          </Pressable>
                        ) : null}
                        <Pressable style={styles.approveBtn} onPress={() => openApprove(r)}>
                          <Text style={styles.approveBtnText}>Approve</Text>
                        </Pressable>
                        <Pressable style={styles.rejectBtn} onPress={() => openReject(r)}>
                          <Text style={styles.rejectBtnText}>Reject</Text>
                        </Pressable>
                      </View>
                    </View>
                      ))}
                    </View>
                  ))
                )}
              </View>
            ) : (
              <View style={styles.listCard}>
                {completedItems.length === 0 ? (
                  <Text style={styles.emptyText}>No completed requests yet.</Text>
                ) : (
                  completedItems.map((r) => (
                    <Pressable key={r.$id} style={styles.row} onPress={() => router.push(`/hr/requests/${r.$id}` as any)}>
                      <View style={styles.rowLeft}>
                        <View style={[styles.typeIconWrap, { backgroundColor: '#ecfdf5' }]}>
                          <MaterialCommunityIcons name="check-decagram" size={18} color="#047857" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {r.subject || r.requestId || 'Request'}
                          </Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {r.requestId ? `${r.requestId} • ` : ''}
                            {r.completionDate ? new Date(r.completionDate).toLocaleDateString() : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.badge, { backgroundColor: '#ecfdf5' }]}>
                        <Text style={[styles.badgeText, { color: '#047857' }]}>Completed</Text>
                      </View>
                    </Pressable>
                  ))
                )}
              </View>
            )}

            <View style={styles.paginationRow}>
              <Pressable
                onPress={() => setPage((p) => Math.max(0, p - 1))}
                style={[styles.pageBtn, page === 0 && styles.pageBtnDisabled]}
                disabled={page === 0 || loadingMore}
              >
                <Text style={[styles.pageBtnText, page === 0 && styles.pageBtnTextDisabled]}>
                  Previous
                </Text>
              </Pressable>

              <Text style={styles.pageText}>
                Page {page + 1}
                {filtered.length ? ` • ${Math.min((page + 1) * PAGE_SIZE, filtered.length)}/${filtered.length}` : ''}
              </Text>

              {page + 1 < totalPages ? (
                <Pressable
                  onPress={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  style={[styles.pageBtn, styles.pageBtnPrimary, loadingMore && styles.pageBtnDisabled]}
                  disabled={loadingMore}
                >
                  <Text
                    style={[
                      styles.pageBtnText,
                      styles.pageBtnTextPrimary,
                      loadingMore && styles.pageBtnTextDisabled,
                    ]}
                  >
                    Next
                  </Text>
                </Pressable>
              ) : (
                <View style={{ width: 92 }} />
              )}
            </View>
          </>
        )}
      </ScrollView>
      <HrBottomNav />

      <Modal visible={deleteModalOpen} transparent animationType="fade" onRequestClose={closeDeleteModal}>
        <View style={styles.confirmBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeDeleteModal} />
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#b91c1c" />
            </View>
            <Text style={styles.confirmTitle}>Delete request?</Text>
            <Text style={styles.confirmText}>Only draft requests can be deleted. This action cannot be undone.</Text>

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
              <MaterialCommunityIcons name="check-circle-outline" size={22} color="#047857" />
            </View>
            <Text style={styles.confirmTitle}>Approve request</Text>
            <Text style={styles.confirmText}>
              {approveStage === 'department'
                ? 'Select an L1 approver and optionally add comments.'
                : approveStage === 'l1'
                  ? 'Select an L2 approver and optionally add comments.'
                  : approveStage === 'l2'
                    ? 'Finalize approval or send to Finance.'
                    : 'Complete this request as Finance.'}
            </Text>

            {(approveStage === 'department' || approveStage === 'l1') ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.modalLabel}>
                  {approveStage === 'department' ? 'Select L1 Approver' : 'Select L2 Approver'}
                </Text>
                <View style={styles.selectList}>
                  {(approveStage === 'department'
                    ? approvers.filter((a) => String(a.level || '').toUpperCase() === 'L1')
                    : approvers.filter((a) => String(a.level || '').toUpperCase() === 'L2')
                  )
                    .filter((a) => String(a.userId) !== String(approveTarget?.userId))
                    .slice(0, 30)
                    .map((a) => (
                      <Pressable
                        key={String(a.$id || a.userId)}
                        onPress={() => setApproveSelectedUserId(String(a.userId))}
                        style={[
                          styles.selectItem,
                          approveSelectedUserId === String(a.userId) && styles.selectItemActive,
                        ]}
                      >
                        <Text style={[styles.selectItemText, approveSelectedUserId === String(a.userId) && styles.selectItemTextActive]}>
                          {a.approverName || a.name || a.userId}
                        </Text>
                      </Pressable>
                    ))}
                </View>
              </View>
            ) : null}

            {approveStage === 'l2' ? (
              <View style={{ marginTop: 12 }}>
                <Pressable
                  onPress={() => setApproveRequiresFinance((v) => !v)}
                  style={[styles.toggleRow, approveRequiresFinance && { borderColor: '#FFB803' }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleTitle}>Requires Finance processing</Text>
                    <Text style={styles.toggleSub}>If enabled, it moves to Finance Completion stage.</Text>
                  </View>
                  <View style={[styles.togglePill, approveRequiresFinance && { backgroundColor: '#FFB803' }]}>
                    <Text style={[styles.togglePillText, approveRequiresFinance && { color: '#054653' }]}>
                      {approveRequiresFinance ? 'Yes' : 'No'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            ) : null}

            <View style={{ marginTop: 12 }}>
              <Text style={styles.modalLabel}>Comments (optional)</Text>
              <TextInput
                value={approveComments}
                onChangeText={setApproveComments}
                placeholder="Add comments..."
                placeholderTextColor="#9ca3af"
                style={styles.modalInput}
                multiline
              />
            </View>

            <View style={styles.confirmActions}>
              <Pressable
                onPress={closeApprove}
                disabled={approving}
                style={[styles.confirmBtn, styles.confirmBtnOutline, approving && { opacity: 0.6 }]}
              >
                <Text style={styles.confirmBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={performApprove}
                disabled={approving}
                style={[styles.confirmBtn, { backgroundColor: '#047857' }, approving && { opacity: 0.7 }]}
              >
                {approving ? (
                  <View style={styles.confirmBtnRow}>
                    <ActivityIndicator color="#ffffff" />
                    <Text style={styles.confirmBtnTextDanger}>Approving…</Text>
                  </View>
                ) : (
                  <Text style={styles.confirmBtnTextDanger}>Approve</Text>
                )}
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
            <Text style={styles.confirmTitle}>Reject request</Text>
            <Text style={styles.confirmText}>Provide a reason. The request will revert to the correct previous stage like the web workflow.</Text>

            <View style={{ marginTop: 12 }}>
              <Text style={styles.modalLabel}>Rejection reason *</Text>
              <TextInput
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Type the reason..."
                placeholderTextColor="#9ca3af"
                style={styles.modalInput}
                multiline
              />
            </View>

            <View style={styles.confirmActions}>
              <Pressable
                onPress={closeReject}
                disabled={rejecting}
                style={[styles.confirmBtn, styles.confirmBtnOutline, rejecting && { opacity: 0.6 }]}
              >
                <Text style={styles.confirmBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={performReject}
                disabled={rejecting}
                style={[styles.confirmBtn, styles.confirmBtnDanger, rejecting && { opacity: 0.7 }]}
              >
                {rejecting ? (
                  <View style={styles.confirmBtnRow}>
                    <ActivityIndicator color="#ffffff" />
                    <Text style={styles.confirmBtnTextDanger}>Rejecting…</Text>
                  </View>
                ) : (
                  <Text style={styles.confirmBtnTextDanger}>Reject</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

function canEditRequest(r: any, user: any) {
  try {
    const ownerId = r?.userId;
    const me = user?.$id || user?.userId;
    if (!ownerId || !me || ownerId !== me) return false;
    const status = String(r?.status || 'DRAFT').toUpperCase();
    // Mirror web behavior: edit is available only for DRAFT or REJECTED.
    // Pending requests show "View" only on the My Requests list.
    return status === 'DRAFT' || status === 'REJECTED';
  } catch {
    return false;
  }
}

function stageLabel(r: any) {
  const status = String(r?.status || '').toUpperCase();
  const stage = String(r?.approvalStage || '').toUpperCase();
  if (status === 'DRAFT') return 'Draft';
  if (status === 'REJECTED') {
    const rejStage = String(r?.rejectionStage || '').toUpperCase();
    if (rejStage === 'DEPARTMENT_REVIEW') return 'Rejected (Dept)';
    if (rejStage === 'L1_APPROVAL') return 'Rejected (L1)';
    if (rejStage === 'L2_APPROVAL') return 'Rejected (L2)';
    if (rejStage === 'FINANCE_COMPLETION') return 'Rejected (Fin)';
    return 'Rejected';
  }
  if (status === 'APPROVED' || stage === 'COMPLETED') return 'Completed';
  if (stage === 'DEPARTMENT_REVIEW') return 'Dept Review';
  if (stage === 'L1_APPROVAL') return 'L1 Approval';
  if (stage === 'L2_APPROVAL') return 'L2 Approval';
  if (stage === 'FINANCE_COMPLETION') return 'Finance';
  if (status === 'PENDING') return 'Pending';
  if (status === 'DEPT_APPROVED') return 'Dept Approved';
  if (status === 'L1_APPROVED') return 'L1 Approved';
  if (status === 'L2_APPROVED') return 'L2 Approved';
  return status || 'Status';
}

function stageBadgeStyle(r: any) {
  const status = String(r?.status || '').toUpperCase();
  const stage = String(r?.approvalStage || '').toUpperCase();
  if (status === 'REJECTED') return { pill: { backgroundColor: '#fef2f2' }, text: { color: '#b91c1c' } };
  if (status === 'DRAFT') return { pill: { backgroundColor: '#f3f4f6' }, text: { color: '#6b7280' } };
  if (status === 'APPROVED' || stage === 'COMPLETED') return { pill: { backgroundColor: '#ecfdf5' }, text: { color: '#047857' } };
  if (stage === 'DEPARTMENT_REVIEW') return { pill: { backgroundColor: '#eef2ff' }, text: { color: '#3730a3' } };
  if (stage === 'L1_APPROVAL' || stage === 'L2_APPROVAL') return { pill: { backgroundColor: '#eff6ff' }, text: { color: '#1d4ed8' } };
  if (stage === 'FINANCE_COMPLETION') return { pill: { backgroundColor: '#fff7ed' }, text: { color: '#92400e' } };
  return { pill: { backgroundColor: '#fff7ed' }, text: { color: '#92400e' } };
}

function typeColor(requestType?: string) {
  const t = String(requestType || '').toUpperCase();
  if (t === 'IT_SUPPORT') return { bg: '#fff7ed', fg: '#92400e', icon: 'tools' };
  if (t === 'EQUIPMENT') return { bg: '#e6f4f2', fg: '#054653', icon: 'laptop' };
  if (t === 'FACILITY') return { bg: '#ecfdf5', fg: '#047857', icon: 'office-building' };
  if (t === 'HR_SERVICES') return { bg: '#f5f3ff', fg: '#6d28d9', icon: 'account-group-outline' };
  return { bg: '#f3f4f6', fg: '#374151', icon: 'file-document-outline' };
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function groupApprovalItems(items: any[]) {
  const order = ['department', 'l1', 'l2', 'finance'] as const;
  const labels: Record<string, string> = {
    department: 'Department Reviews',
    l1: 'L1 Approvals',
    l2: 'L2 Final Approvals',
    finance: 'Finance Completion',
  };
  const grouped: { key: string; label: string; items: any[] }[] = [];
  for (const k of order) {
    const subset = items.filter((x) => String(x.__queue || '') === k);
    if (subset.length) grouped.push({ key: k, label: labels[k], items: subset });
  }
  return grouped;
}

async function getUserEmailsByUserId(userId: string) {
  if (!userId) return null;
  try {
    const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.USERS, [
      Query.equal('userId', userId),
      Query.limit(1),
    ]);
    const doc = (res as any)?.documents?.[0];
    if (!doc?.email) return null;
    return { name: doc?.name || 'User', email: doc.email as string, otherEmail: (doc.otherEmail as string) || null };
  } catch {
    return null;
  }
}

async function sendEmailBestEffort(payload: { subject: string; text: string; email: string; cc?: string | null }) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://alx.derrickml.com/api/general/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      // @ts-ignore
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      console.warn('Email API failed', res.status);
    }
  } catch (e) {
    console.warn('Email send failed', e);
  }
}

async function notifyStageChangeBestEffort(params: {
  request: any;
  nextStageLabel: string;
  nextApproverUserId: string | null;
  requesterUserId: string;
}) {
  const [requester, nextApprover] = await Promise.all([
    getUserEmailsByUserId(params.requesterUserId),
    params.nextApproverUserId ? getUserEmailsByUserId(params.nextApproverUserId) : Promise.resolve(null),
  ]);

  const requestId = params.request?.requestId || params.request?.$id || '—';
  const subject = params.request?.subject || 'General request';
  const reqType = params.request?.requestType || '—';

  if (nextApprover?.email) {
    await sendEmailBestEffort({
      subject: `New Request Pending Your Approval - ${requestId}`,
      text:
        `Dear ${nextApprover.name},\n\n` +
        `A request requires your approval.\n\n` +
        `Request ID: ${requestId}\n` +
        `Type: ${reqType}\n` +
        `Subject: ${subject}\n\n` +
        `Best regards,\nNREP HR System`,
      email: nextApprover.email,
      cc: nextApprover.otherEmail,
    });
  }

  if (requester?.email) {
    await sendEmailBestEffort({
      subject: `Request Status Update - ${requestId}`,
      text:
        `Dear ${requester.name},\n\n` +
        `Your request has progressed to the next stage: ${params.nextStageLabel}.\n\n` +
        `Request ID: ${requestId}\n` +
        `Type: ${reqType}\n` +
        `Subject: ${subject}\n\n` +
        `Best regards,\nNREP HR System`,
      email: requester.email,
      cc: requester.otherEmail,
    });
  }
}

async function notifyCompletionBestEffort(params: { request: any; requesterUserId: string }) {
  const requester = await getUserEmailsByUserId(params.requesterUserId);
  if (!requester?.email) return;
  const requestId = params.request?.requestId || params.request?.$id || '—';
  const subject = params.request?.subject || 'General request';
  await sendEmailBestEffort({
    subject: `Request Completed - ${requestId}`,
    text:
      `Dear ${requester.name},\n\n` +
      `Your request has been completed.\n\n` +
      `Request ID: ${requestId}\n` +
      `Subject: ${subject}\n\n` +
      `Best regards,\nNREP HR System`,
    email: requester.email,
    cc: requester.otherEmail,
  });
}

async function notifyRejectionBestEffort(params: { request: any; requesterUserId: string; reason: string }) {
  const requester = await getUserEmailsByUserId(params.requesterUserId);
  if (!requester?.email) return;
  const requestId = params.request?.requestId || params.request?.$id || '—';
  const subject = params.request?.subject || 'General request';
  await sendEmailBestEffort({
    subject: `Request Rejected - ${requestId}`,
    text:
      `Dear ${requester.name},\n\n` +
      `Your request has been rejected.\n\n` +
      `Request ID: ${requestId}\n` +
      `Subject: ${subject}\n\n` +
      `Reason: ${params.reason}\n\n` +
      `Best regards,\nNREP HR System`,
    email: requester.email,
    cc: requester.otherEmail,
  });
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
  title: { color: '#054653', fontSize: 20, fontWeight: '900' },
  subtitle: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '600' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e6f4f2',
    alignItems: 'center',
    justifyContent: 'center',
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
  newButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
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
  emptyBox: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
  },
  emptyText: { color: '#6b7280', fontSize: 12, fontWeight: '600' },
  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  metricChip: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  metricLabel: { fontSize: 11, color: '#6b7280', fontWeight: '700' },
  metricValue: { marginTop: 4, fontSize: 18, color: '#054653', fontWeight: '900' },
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
  searchInput: { flex: 1, fontSize: 13, color: '#111827', paddingVertical: 0 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  filterChipActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  filterChipText: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  filterChipTextActive: { color: '#054653' },
  listCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  rowRight: { alignItems: 'flex-end', gap: 8 },
  typeIconWrap: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: '#111827', fontSize: 13, fontWeight: '800' },
  rowMeta: { marginTop: 2, color: '#6b7280', fontSize: 11, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  rowActions: { flexDirection: 'row', gap: 8 },
  actionIcon: { padding: 6 },
  approvalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  approvalIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#e6f4f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  approveBtn: {
    borderRadius: 12,
    backgroundColor: '#047857',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  approveBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '900' },
  rejectBtn: {
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rejectBtnText: { color: '#b91c1c', fontSize: 11, fontWeight: '900' },
  paginationRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  pageBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 92,
    alignItems: 'center',
  },
  pageBtnPrimary: {
    backgroundColor: '#FFB803', // NREP gold/orange accent
    borderColor: '#FFB803',
  },
  pageBtnDisabled: { opacity: 0.6 },
  pageBtnText: { color: '#054653', fontSize: 12, fontWeight: '900' },
  pageBtnTextPrimary: { color: '#054653' },
  pageBtnTextDisabled: { color: '#6b7280' },
  pageText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },

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
  confirmTitle: { marginTop: 10, color: '#111827', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  confirmText: { marginTop: 6, color: '#6b7280', fontSize: 12, fontWeight: '600', textAlign: 'center' },
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
  confirmBtnOutline: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  confirmBtnDanger: { backgroundColor: '#b91c1c' },
  confirmBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confirmBtnTextOutline: { color: '#054653', fontSize: 12, fontWeight: '900' },
  confirmBtnTextDanger: { color: '#ffffff', fontSize: 12, fontWeight: '900' },

  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
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

  modalLabel: { color: '#111827', fontSize: 12, fontWeight: '800', marginTop: 0 },
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
    textAlignVertical: 'top' as any,
  },
  selectList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    maxHeight: 220,
    overflow: 'hidden',
  },
  selectItem: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  selectItemActive: { backgroundColor: '#e6f4f2' },
  selectItemText: { color: '#111827', fontSize: 12, fontWeight: '700' },
  selectItemTextActive: { color: '#054653' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleTitle: { color: '#111827', fontSize: 12, fontWeight: '900' },
  toggleSub: { marginTop: 2, color: '#6b7280', fontSize: 11, fontWeight: '600' },
  togglePill: {
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  togglePillText: { color: '#6b7280', fontSize: 11, fontWeight: '900' },
});

