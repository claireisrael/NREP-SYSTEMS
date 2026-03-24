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
import { HR_COLLECTIONS, HR_DB_ID, hrDatabases, Query } from '@/lib/appwrite';

export default function HrApprovalsScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [approvalItems, setApprovalItems] = useState<any[]>([]);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [completedItems, setCompletedItems] = useState<any[]>([]);
  const [approvers, setApprovers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'completed'>('pending');

  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [approveStage, setApproveStage] = useState<'department' | 'l1' | 'l2' | 'finance' | null>(null);
  const [approveSelectedUserId, setApproveSelectedUserId] = useState('');
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

  const financeDeptId = ((process.env as any)?.EXPO_PUBLIC_FINANCE_DEPARTMENT_ID ||
    (process.env as any)?.NEXT_PUBLIC_FINANCE_DEPARTMENT_ID ||
    '') as string;
  const isFinanceUser = !!financeDeptId && String((user as any)?.departmentId || '') === financeDeptId;
  const isSeniorManager = String(user?.systemRole || '').toLowerCase() === 'senior manager';
  const isSupervisor = String(user?.systemRole || '').toLowerCase() === 'supervisor';
  const canApprove = isSeniorManager || isSupervisor || isFinanceUser;
  const canViewCompleted = isSeniorManager || isFinanceUser;

  const loadApprovals = useCallback(async () => {
    if (!user?.$id) return;
    try {
      setLoading(true);
      setError(null);

      const [dept, l1, l2, finance, approverDocs, deptHistory, l1History, l2History, completed] = await Promise.all([
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('departmentReviewerId', user.$id),
          Query.equal('approvalStage', 'DEPARTMENT_REVIEW'),
          Query.orderDesc('submissionDate'),
          Query.limit(100),
        ]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('l1ApproverId', user.$id),
          Query.equal('approvalStage', 'L1_APPROVAL'),
          Query.orderDesc('submissionDate'),
          Query.limit(100),
        ]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('l2ApproverId', user.$id),
          Query.equal('approvalStage', 'L2_APPROVAL'),
          Query.orderDesc('submissionDate'),
          Query.limit(100),
        ]),
        isFinanceUser || isSeniorManager
          ? hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
              Query.equal('approvalStage', 'FINANCE_COMPLETION'),
              Query.orderDesc('submissionDate'),
              Query.limit(100),
            ])
          : Promise.resolve({ documents: [] } as any),
        HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS
          ? hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS as any, [
              Query.equal('isActive', true),
              Query.orderAsc('approverName'),
              Query.limit(200),
            ])
          : Promise.resolve({ documents: [] } as any),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('departmentReviewerId', user.$id),
          Query.orderDesc('$updatedAt'),
          Query.limit(100),
        ]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('l1ApproverId', user.$id),
          Query.orderDesc('$updatedAt'),
          Query.limit(100),
        ]),
        hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
          Query.equal('l2ApproverId', user.$id),
          Query.orderDesc('$updatedAt'),
          Query.limit(100),
        ]),
        canViewCompleted
          ? hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
              Query.equal('status', 'APPROVED'),
              Query.equal('approvalStage', 'COMPLETED'),
              Query.orderDesc('completionDate'),
              Query.limit(100),
            ])
          : Promise.resolve({ documents: [] } as any),
      ]);

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

      const historyMap = new Map<string, any>();
      [...((deptHistory as any)?.documents ?? []), ...((l1History as any)?.documents ?? []), ...((l2History as any)?.documents ?? [])]
        .forEach((d: any) => historyMap.set(String(d.$id), d));
      const history = Array.from(historyMap.values()).sort((a: any, b: any) => {
        const ad = new Date(a.$updatedAt || a.$createdAt || 0).getTime();
        const bd = new Date(b.$updatedAt || b.$createdAt || 0).getTime();
        return bd - ad;
      });
      setHistoryItems(history);
      setCompletedItems((((completed as any)?.documents ?? []) as any[]).sort((a: any, b: any) => {
        const ad = new Date(a.completionDate || a.$updatedAt || 0).getTime();
        const bd = new Date(b.completionDate || b.$updatedAt || 0).getTime();
        return bd - ad;
      }));
    } catch (e: any) {
      setError(e?.message || 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }, [user?.$id, isFinanceUser, isSeniorManager]);

  useEffect(() => {
    if (!isLoading && user?.$id && canApprove) {
      loadApprovals();
    }
  }, [isLoading, user?.$id, canApprove, loadApprovals]);

  const grouped = useMemo(() => groupApprovalItems(approvalItems), [approvalItems]);
  const approvedItems = useMemo(
    () =>
      historyItems.filter((r) =>
        ['DEPT_APPROVED', 'L1_APPROVED', 'L2_APPROVED', 'APPROVED', 'COMPLETED'].includes(
          String(r?.status || '').toUpperCase()
        )
      ),
    [historyItems]
  );
  const rejectedItems = useMemo(
    () => historyItems.filter((r) => String(r?.status || '').toUpperCase() === 'REJECTED'),
    [historyItems]
  );

  const openApprove = (doc: any) => {
    if (!canApproveRequest(doc, user, financeDeptId)) {
      Alert.alert('Not allowed', 'You are not the designated approver for this request at the current stage.');
      return;
    }
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
    if (!canApproveRequest(doc, user, financeDeptId)) {
      Alert.alert('Not allowed', 'You are not the designated approver for this request at the current stage.');
      return;
    }
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
    if (!approveTarget?.$id || !approveStage || !user?.$id) return;
    if (!canApproveRequest(approveTarget, user, financeDeptId)) {
      Alert.alert('Not allowed', 'You are not the designated approver for this request at the current stage.');
      return;
    }
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
      } else if (approveStage === 'l2') {
        if (approveRequiresFinance) {
          await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, approveTarget.$id, {
            status: 'PENDING',
            approvalStage: 'FINANCE_COMPLETION',
            financeRequired: true,
            l2ApprovalDate: now,
            l2Comments: approveComments || '',
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
        }
      } else {
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
      }

      closeApprove();
      await loadApprovals();
    } catch (e: any) {
      Alert.alert('Approval failed', e?.message || 'Unable to approve this request.');
    } finally {
      setApproving(false);
    }
  };

  const performReject = async () => {
    if (!rejectTarget?.$id || !user?.$id) return;
    if (!canApproveRequest(rejectTarget, user, financeDeptId)) {
      Alert.alert('Not allowed', 'You are not the designated approver for this request at the current stage.');
      return;
    }
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
      closeReject();
      await loadApprovals();
    } catch (e: any) {
      Alert.alert('Rejection failed', e?.message || 'Unable to reject this request.');
    } finally {
      setRejecting(false);
    }
  };

  if (isLoading || !user) return null;

  if (!canApprove) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View style={styles.headerIconCircle}>
                <MaterialCommunityIcons name="check-decagram-outline" size={20} color="#054653" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Approvals</Text>
                <Text style={styles.subtitle}>Senior manager approvals</Text>
              </View>
            </View>
          </View>

          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Access required</Text>
            <Text style={styles.emptyText}>
              This tab is available to Senior Managers, Supervisors, and Finance users.
            </Text>
          </View>
        </ScrollView>
        <HrBottomNav />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.headerIconCircle}>
              <MaterialCommunityIcons name="check-decagram-outline" size={20} color="#054653" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Approvals</Text>
              <Text style={styles.subtitle}>Review and action pending requests</Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{approvalItems.length}</Text>
            </View>
          </View>
        </View>

        <View style={styles.authorityCard}>
          <View style={styles.authorityLeft}>
            <View style={styles.authorityIcon}>
              <MaterialCommunityIcons name="shield-account-outline" size={18} color="#0891b2" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.authorityTitle}>Approval Authority</Text>
              <Text style={styles.authorityText}>
                Role: <Text style={styles.authorityTextStrong}>{String(user?.systemRole || 'N/A')}</Text> | Department:{' '}
                <Text style={styles.authorityTextStrong}>{String((user as any)?.departmentName || (user as any)?.departmentId || 'N/A')}</Text>
              </Text>
            </View>
          </View>
          <View style={styles.pendingBadge}>
            <MaterialCommunityIcons name="clock-outline" size={13} color="#0f172a" />
            <Text style={styles.pendingBadgeText}>{approvalItems.length} Pending</Text>
          </View>
        </View>

        <View style={styles.tabsRow}>
          <Pressable
            onPress={() => setActiveTab('pending')}
            style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, activeTab === 'pending' && styles.tabBtnTextActive]}>
              Pending ({approvalItems.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('approved')}
            style={[styles.tabBtn, activeTab === 'approved' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, activeTab === 'approved' && styles.tabBtnTextActive]}>
              Approved ({approvedItems.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveTab('rejected')}
            style={[styles.tabBtn, activeTab === 'rejected' && styles.tabBtnActive]}
          >
            <Text style={[styles.tabBtnText, activeTab === 'rejected' && styles.tabBtnTextActive]}>
              Rejected ({rejectedItems.length})
            </Text>
          </Pressable>
          {canViewCompleted ? (
            <Pressable
              onPress={() => setActiveTab('completed')}
              style={[styles.tabBtn, activeTab === 'completed' && styles.tabBtnActive]}
            >
              <Text style={[styles.tabBtnText, activeTab === 'completed' && styles.tabBtnTextActive]}>
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
            <Pressable onPress={loadApprovals} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : activeTab === 'pending' ? (
          <View style={styles.listCard}>
            {grouped.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>All caught up</Text>
                <Text style={styles.emptyText}>No pending approvals right now.</Text>
              </View>
            ) : (
              grouped.map((g) => (
                <View key={g.key}>
                  <Text style={styles.sectionLabel}>
                    {g.label} ({g.items.length})
                  </Text>
                  <Text style={styles.sectionHint}>{SECTION_HINT[g.key] || ''}</Text>
                  {g.items.map((r) => (
                    <View key={r.$id} style={styles.approvalRow}>
                      <View style={styles.edgeAccentLeft} />
                      <View style={styles.edgeAccentRight} />
                      <View style={styles.rowLeft}>
                        <View style={styles.approvalIconCircle}>
                          <MaterialCommunityIcons name={SECTION_ICON[g.key] || 'clipboard-check-outline'} size={18} color="#054653" />
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
                        {canApproveRequest(r, user, financeDeptId) ? (
                          <>
                            <Pressable style={styles.approveBtn} onPress={() => openApprove(r)}>
                              <Text style={styles.approveBtnText}>
                                {String(r?.approvalStage || '').toUpperCase() === 'FINANCE_COMPLETION' ? 'Complete' : 'Approve'}
                              </Text>
                            </Pressable>
                            <Pressable style={styles.rejectBtn} onPress={() => openReject(r)}>
                              <Text style={styles.rejectBtnText}>Reject</Text>
                            </Pressable>
                          </>
                        ) : (
                          <View style={styles.readOnlyPill}>
                            <Text style={styles.readOnlyPillText}>View only</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        ) : activeTab === 'approved' ? (
          <View style={styles.listCard}>
            {approvedItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No approved items</Text>
                <Text style={styles.emptyText}>Approved requests you handled will appear here.</Text>
              </View>
            ) : (
              approvedItems.map((r) => (
                <View key={r.$id} style={styles.approvalRow}>
                  <View style={styles.edgeAccentLeft} />
                  <View style={styles.edgeAccentRight} />
                  <View style={styles.rowLeft}>
                    <View style={[styles.approvalIconCircle, { backgroundColor: '#ecfdf5' }]}>
                      <MaterialCommunityIcons name="check-decagram" size={18} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.userName ? `${r.userName} • ` : ''}
                        {r.subject || r.requestId || 'Request'}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {r.requestId ? `${r.requestId} • ` : ''}
                        {String(r.status || 'APPROVED')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.approvalActions}>
                    <Pressable style={styles.actionIcon} onPress={() => router.push(`/hr/requests/${r.$id}` as any)}>
                      <MaterialCommunityIcons name="eye-outline" size={16} color="#054653" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : activeTab === 'rejected' ? (
          <View style={styles.listCard}>
            {rejectedItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No rejected items</Text>
                <Text style={styles.emptyText}>Rejected requests you handled will appear here.</Text>
              </View>
            ) : (
              rejectedItems.map((r) => (
                <View key={r.$id} style={styles.approvalRow}>
                  <View style={styles.edgeAccentLeft} />
                  <View style={styles.edgeAccentRight} />
                  <View style={styles.rowLeft}>
                    <View style={[styles.approvalIconCircle, { backgroundColor: '#fef2f2' }]}>
                      <MaterialCommunityIcons name="close-circle" size={18} color="#b91c1c" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.userName ? `${r.userName} • ` : ''}
                        {r.subject || r.requestId || 'Request'}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {r.requestId ? `${r.requestId} • ` : ''}
                        {String(r.rejectionReason || 'Rejected')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.approvalActions}>
                    <Pressable style={styles.actionIcon} onPress={() => router.push(`/hr/requests/${r.$id}` as any)}>
                      <MaterialCommunityIcons name="eye-outline" size={16} color="#054653" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.listCard}>
            {completedItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No completed requests</Text>
                <Text style={styles.emptyText}>Finance and senior manager completed requests appear here.</Text>
              </View>
            ) : (
              completedItems.map((r) => (
                <View key={r.$id} style={styles.approvalRow}>
                  <View style={styles.edgeAccentLeft} />
                  <View style={styles.edgeAccentRight} />
                  <View style={styles.rowLeft}>
                    <View style={[styles.approvalIconCircle, { backgroundColor: '#ecfdf5' }]}>
                      <MaterialCommunityIcons name="check-all" size={18} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {r.userName ? `${r.userName} • ` : ''}
                        {r.subject || r.requestId || 'Request'}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {r.requestId ? `${r.requestId} • ` : ''}
                        {r.completionDate ? new Date(r.completionDate).toLocaleDateString() : 'Completed'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.approvalActions}>
                    <Pressable style={styles.actionIcon} onPress={() => router.push(`/hr/requests/${r.$id}` as any)}>
                      <MaterialCommunityIcons name="eye-outline" size={16} color="#054653" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
      <HrBottomNav />

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
                  <Text style={styles.confirmBtnTextDanger}>
                    {String(approveTarget?.approvalStage || '').toUpperCase() === 'FINANCE_COMPLETION' ? 'Complete' : 'Approve'}
                  </Text>
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
            <Text style={styles.confirmText}>
              Provide a reason. The request will revert to the correct previous stage like the web workflow.
            </Text>

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

const SECTION_HINT: Record<string, string> = {
  department: 'As department head, review these requests and select L1 approvers.',
  l1: 'Review these requests and select L2 approvers for final approval.',
  l2: 'Final approval stage: complete the request or send to Finance.',
  finance: 'Finance team completes requests requiring financial processing.',
};

const SECTION_ICON: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  department: 'domain',
  l1: 'account-check-outline',
  l2: 'account-tie',
  finance: 'cash-check',
};

function stageLabel(r: any) {
  const stage = String(r?.approvalStage || '').toUpperCase();
  if (stage === 'DEPARTMENT_REVIEW') return 'Department Review';
  if (stage === 'L1_APPROVAL') return 'L1 Approval';
  if (stage === 'L2_APPROVAL') return 'L2 Final Approval';
  if (stage === 'FINANCE_COMPLETION') return 'Finance Completion';
  if (stage === 'COMPLETED') return 'Completed';
  const status = String(r?.status || '').toUpperCase();
  return status || 'Pending';
}

function groupApprovalItems(items: any[]) {
  const by: Record<string, any[]> = {
    department: [],
    l1: [],
    l2: [],
    finance: [],
  };
  items.forEach((r) => {
    const k = String(r?.__queue || '').toLowerCase();
    if (k in by) by[k].push(r);
  });
  const order: Array<keyof typeof by> = ['department', 'l1', 'l2', 'finance'];
  const labels: Record<string, string> = {
    department: 'Department Reviews',
    l1: 'L1 Approvals',
    l2: 'L2 Final Approvals',
    finance: 'Finance Completion',
  };
  return order.filter((k) => by[k].length > 0).map((k) => ({ key: k, label: labels[k], items: by[k] }));
}

function canApproveRequest(request: any, user: any, financeDepartmentId: string) {
  if (!request || !user) return false;
  const myId = String(user?.$id || user?.userId || '');
  const requesterId = String(request?.userId || '');
  if (!myId) return false;
  // Web parity: no self-approval at any stage.
  if (requesterId && requesterId === myId) return false;

  const stage = String(request?.approvalStage || '').toUpperCase();
  if (stage === 'DEPARTMENT_REVIEW') return String(request?.departmentReviewerId || '') === myId;
  if (stage === 'L1_APPROVAL') return String(request?.l1ApproverId || '') === myId;
  if (stage === 'L2_APPROVAL') return String(request?.l2ApproverId || '') === myId;
  if (stage === 'FINANCE_COMPLETION') {
    if (!financeDepartmentId) return false;
    return String(user?.departmentId || '') === String(financeDepartmentId);
  }
  return false;
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
  countPill: {
    minWidth: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: '#054653',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  countText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  title: { color: '#054653', fontSize: 20, fontWeight: '800' },
  subtitle: { marginTop: 2, color: '#6b7280', fontSize: 13 },
  listCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tabsRow: {
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  authorityCard: {
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#22d3ee',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  authorityLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  authorityIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorityTitle: { color: '#0f172a', fontWeight: '800', fontSize: 13, marginBottom: 2 },
  authorityText: { color: '#475569', fontSize: 12 },
  authorityTextStrong: { color: '#0f172a', fontWeight: '700' },
  pendingBadge: {
    borderRadius: 999,
    backgroundColor: '#cffafe',
    borderWidth: 1,
    borderColor: '#67e8f9',
    paddingHorizontal: 10,
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pendingBadgeText: { color: '#0f172a', fontSize: 11, fontWeight: '800' },
  tabBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    borderColor: '#054653',
    backgroundColor: '#e6f4f2',
  },
  tabBtnText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  tabBtnTextActive: { color: '#054653' },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionHint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  approvalRow: {
    position: 'relative',
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    gap: 8,
  },
  edgeAccentLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#054653',
  },
  edgeAccentRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#FFB803',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  approvalIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  rowMeta: { marginTop: 2, color: '#6b7280', fontSize: 12 },
  approvalActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 42 },
  actionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  approveBtn: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  rejectBtn: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#b91c1c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  readOnlyPill: {
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readOnlyPillText: { color: '#64748b', fontSize: 12, fontWeight: '700' },
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
  errorText: { color: '#991b1b', textAlign: 'center' },
  retryBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#054653',
  },
  retryText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  emptyCard: {
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  emptyText: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  confirmIcon: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  confirmTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  confirmText: { color: '#475569', fontSize: 13, lineHeight: 18 },
  modalLabel: { color: '#334155', fontWeight: '700', fontSize: 12, marginBottom: 6 },
  modalInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 72,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  selectList: {
    maxHeight: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 6,
    gap: 6,
  },
  selectItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  selectItemActive: {
    borderColor: '#054653',
    backgroundColor: '#e6f4f2',
  },
  selectItemText: { color: '#334155', fontSize: 13 },
  selectItemTextActive: { color: '#054653', fontWeight: '700' },
  toggleRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleTitle: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  toggleSub: { marginTop: 2, color: '#64748b', fontSize: 12 },
  togglePill: {
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  togglePillText: { color: '#334155', fontWeight: '700', fontSize: 11 },
  confirmActions: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  confirmBtn: {
    minWidth: 96,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  confirmBtnOutline: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  confirmBtnDanger: { backgroundColor: '#b91c1c' },
  confirmBtnTextOutline: { color: '#334155', fontWeight: '700', fontSize: 13 },
  confirmBtnTextDanger: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  confirmBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

