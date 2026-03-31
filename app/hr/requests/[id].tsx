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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import { HR_BUCKETS, HR_COLLECTIONS, HR_DB_ID, hrDatabases, hrStorage, Query } from '@/lib/appwrite';

export default function HrRequestDetailScreen() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'attachments' | 'history'>('details');

  const [attachmentItems, setAttachmentItems] = useState<
    { id: string; name: string; size: number; mimeType: string; downloadUrl?: string; error?: string }[]
  >([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);

  const [auditItems, setAuditItems] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const [approvers, setApprovers] = useState<any[]>([]);

  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveSelectedUserId, setApproveSelectedUserId] = useState<string>('');
  const [approveRequiresFinance, setApproveRequiresFinance] = useState(false);
  const [approveComments, setApproveComments] = useState('');
  const [approving, setApproving] = useState(false);

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

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

  const loadApprovers = useCallback(async () => {
    try {
      if (!HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS) return;
      const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS as any, [
        Query.equal('isActive', true),
        Query.orderAsc('approverName'),
        Query.limit(200),
      ]);
      setApprovers(((res as any)?.documents ?? []) as any[]);
    } catch {
      setApprovers([]);
    }
  }, []);

  const loadAttachments = useCallback(
    async (requestDoc: any) => {
      const ids: string[] = Array.isArray(requestDoc?.attachmentIds) ? requestDoc.attachmentIds : [];
      if (!ids.length) {
        setAttachmentItems([]);
        setAttachmentsError(null);
        return;
      }
      if (!HR_BUCKETS.GENERAL_REQUEST_ATTACHMENTS) {
        setAttachmentItems(ids.map((x) => ({ id: String(x), name: String(x), size: 0, mimeType: 'application/octet-stream', error: 'Bucket not configured' })));
        setAttachmentsError('Attachments bucket not configured.');
        return;
      }
      try {
        setAttachmentsLoading(true);
        setAttachmentsError(null);
        const items = await Promise.all(
          ids.map(async (fileId) => {
            try {
              const f = await hrStorage.getFile(HR_BUCKETS.GENERAL_REQUEST_ATTACHMENTS, String(fileId));
              // getFileDownload returns a URL object/string depending on SDK
              const dl: any = hrStorage.getFileDownload(HR_BUCKETS.GENERAL_REQUEST_ATTACHMENTS, String(fileId));
              return {
                id: String(fileId),
                name: String((f as any)?.name || 'Attachment'),
                size: Number((f as any)?.sizeOriginal || 0),
                mimeType: String((f as any)?.mimeType || 'application/octet-stream'),
                downloadUrl: typeof dl === 'string' ? dl : (dl?.href as string) || String(dl || ''),
              };
            } catch (e: any) {
              return {
                id: String(fileId),
                name: 'Unknown file',
                size: 0,
                mimeType: 'application/octet-stream',
                error: e?.message || 'Failed to load',
              };
            }
          }),
        );
        setAttachmentItems(items);
      } catch (e: any) {
        setAttachmentsError(e?.message || 'Failed to load attachments');
      } finally {
        setAttachmentsLoading(false);
      }
    },
    [setAttachmentItems],
  );

  const loadAudit = useCallback(async (requestDoc: any) => {
    try {
      const requestCode = String(requestDoc?.requestId || '').trim();
      if (!requestCode) {
        setAuditItems([]);
        setAuditError(null);
        return;
      }
      if (!HR_COLLECTIONS.GENERAL_REQUEST_AUDIT_LOGS) {
        setAuditItems([]);
        setAuditError('Audit logs collection not configured.');
        return;
      }
      setAuditLoading(true);
      setAuditError(null);
      const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUEST_AUDIT_LOGS as any, [
        Query.equal('requestCode', requestCode),
        Query.orderDesc('timestamp'),
        Query.limit(100),
      ]);
      setAuditItems(((res as any)?.documents ?? []) as any[]);
    } catch (e: any) {
      setAuditItems([]);
      setAuditError(e?.message || 'Failed to load activity history');
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user && id) load();
  }, [id, isLoading, user, load]);

  useEffect(() => {
    if (!isLoading && user) loadApprovers();
  }, [isLoading, user, loadApprovers]);

  useEffect(() => {
    if (!doc) return;
    // Load supporting data opportunistically; do not block main view.
    loadAttachments(doc);
    loadAudit(doc);
  }, [doc, loadAttachments, loadAudit]);

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

  const canApprove = useMemo(() => {
    if (!doc || !user) return false;
    const stage = String(doc.approvalStage || '').toUpperCase();
    const me = user.$id || (user as any).userId;
    if (!me) return false;
    // No self-approval.
    if (String(doc.userId || '') === String(me)) return false;
    if (stage === 'DEPARTMENT_REVIEW') return String(doc.departmentReviewerId || '') === String(me);
    if (stage === 'L1_APPROVAL') return String(doc.l1ApproverId || '') === String(me);
    if (stage === 'L2_APPROVAL') return String(doc.l2ApproverId || '') === String(me);
    if (stage === 'FINANCE_COMPLETION') {
      const financeDeptId = ((process.env as any)?.EXPO_PUBLIC_FINANCE_DEPARTMENT_ID ||
        (process.env as any)?.NEXT_PUBLIC_FINANCE_DEPARTMENT_ID ||
        '') as string;
      return !!financeDeptId && String((user as any).departmentId || '') === financeDeptId;
    }
    return false;
  }, [doc, user]);

  const approvalStage = useMemo<'department' | 'l1' | 'l2' | 'finance' | null>(() => {
    const stage = String(doc?.approvalStage || '').toUpperCase();
    if (stage === 'DEPARTMENT_REVIEW') return 'department';
    if (stage === 'L1_APPROVAL') return 'l1';
    if (stage === 'L2_APPROVAL') return 'l2';
    if (stage === 'FINANCE_COMPLETION') return 'finance';
    return null;
  }, [doc?.approvalStage]);

  const filteredApprovers = useMemo(() => {
    const stage = approvalStage;
    const me = String(user?.$id || (user as any)?.userId || '');
    const owner = String(doc?.userId || '');
    if (!stage) return [];
    if (stage !== 'department' && stage !== 'l1') return [];
    const level = stage === 'department' ? 'L1' : 'L2';
    return approvers
      .filter((a) => String(a.level || '').toUpperCase() === level)
      .filter((a) => String(a.userId || '') !== owner)
      .filter((a) => String(a.userId || '') !== me);
  }, [approvalStage, approvers, doc?.userId, user]);

  const openApprove = () => {
    setApproveSelectedUserId('');
    setApproveRequiresFinance(false);
    setApproveComments('');
    setApproveModalOpen(true);
  };
  const closeApprove = () => {
    if (approving) return;
    setApproveModalOpen(false);
  };
  const openReject = () => {
    setRejectReason('');
    setRejectModalOpen(true);
  };
  const closeReject = () => {
    if (rejecting) return;
    setRejectModalOpen(false);
  };

  const performApprove = async () => {
    if (!doc?.$id || !approvalStage || !user) return;
    try {
      setApproving(true);
      const now = new Date().toISOString();
      const meId = user.$id;
      const meName = user.name || user.email || 'Approver';

      if (approvalStage === 'department') {
        if (!approveSelectedUserId) throw new Error('Select an L1 approver to continue.');
        const l1 = approvers.find((a) => String(a.userId) === String(approveSelectedUserId));
        await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, doc.$id, {
          status: 'DEPT_APPROVED',
          approvalStage: 'L1_APPROVAL',
          departmentReviewDate: now,
          departmentReviewComments: approveComments || '',
          l1ApproverId: approveSelectedUserId,
          l1ApproverName: l1?.approverName || l1?.name || null,
        });
      } else if (approvalStage === 'l1') {
        if (!approveSelectedUserId) throw new Error('Select an L2 approver to continue.');
        const l2 = approvers.find((a) => String(a.userId) === String(approveSelectedUserId));
        await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, doc.$id, {
          status: 'L1_APPROVED',
          approvalStage: 'L2_APPROVAL',
          l1ApprovalDate: now,
          l1Comments: approveComments || '',
          l2ApproverId: approveSelectedUserId,
          l2ApproverName: l2?.approverName || l2?.name || null,
        });
      } else if (approvalStage === 'l2') {
        if (approveRequiresFinance) {
          await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, doc.$id, {
            status: 'PENDING',
            approvalStage: 'FINANCE_COMPLETION',
            financeRequired: true,
            l2ApprovalDate: now,
            l2Comments: approveComments || '',
          });
        } else {
          await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, doc.$id, {
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
      } else if (approvalStage === 'finance') {
        await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, doc.$id, {
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
      await load();
    } catch (e: any) {
      Alert.alert('Approval failed', e?.message || 'Unable to approve this request.');
    } finally {
      setApproving(false);
    }
  };

  const performReject = async () => {
    if (!doc?.$id || !user) return;
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert('Rejection reason required', 'Please provide a reason before rejecting.');
      return;
    }
    try {
      setRejecting(true);
      const now = new Date().toISOString();
      const stage = String(doc.approvalStage || '').toUpperCase();

      const updateData: any = {
        status: 'REJECTED',
        rejectedBy: user.$id,
        rejectedByName: user.name || user.email || 'Approver',
        rejectionReason: reason,
        rejectionDate: now,
        rejectionStage: stage || null,
        lastRejectedAt: now,
      };

      // Web-matching stage reversion
      if (stage === 'FINANCE_COMPLETION') {
        updateData.approvalStage = 'L2_APPROVAL';
      } else if (stage === 'L2_APPROVAL') {
        updateData.approvalStage = 'L1_APPROVAL';
        updateData.l2ApproverId = null;
        updateData.l2ApproverName = null;
        updateData.l2ApprovalDate = null;
        updateData.l2Comments = null;
      } else if (stage === 'L1_APPROVAL') {
        if (doc.departmentReviewerId && doc.departmentReviewDate) {
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

      await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, doc.$id, updateData);
      closeReject();
      await load();
    } catch (e: any) {
      Alert.alert('Rejection failed', e?.message || 'Unable to reject this request.');
    } finally {
      setRejecting(false);
    }
  };

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

        {doc && !loading && !error ? (
          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => setActiveTab('details')}
              style={[styles.segment, activeTab === 'details' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, activeTab === 'details' && styles.segmentTextActive]}>Details</Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('attachments')}
              style={[styles.segment, activeTab === 'attachments' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, activeTab === 'attachments' && styles.segmentTextActive]}>
                Attachments
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('history')}
              style={[styles.segment, activeTab === 'history' && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, activeTab === 'history' && styles.segmentTextActive]}>History</Text>
            </Pressable>
          </View>
        ) : null}

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
        ) : !doc ? null : activeTab === 'details' ? (
          <View style={{ gap: 12 }}>
            {canApprove ? (
              <View style={styles.actionCard}>
                <Text style={styles.cardTitle}>Approval Actions</Text>
                <Text style={styles.helperText}>
                  You can approve or reject this request at the current stage.
                </Text>
                <View style={styles.actionRow}>
                  <Pressable style={styles.approveBtn} onPress={openApprove}>
                    <MaterialCommunityIcons name="check" size={16} color="#ffffff" />
                    <Text style={styles.approveBtnText}>{approvalStage === 'finance' ? 'Complete' : 'Approve'}</Text>
                  </Pressable>
                  <Pressable style={styles.rejectBtn} onPress={openReject}>
                    <MaterialCommunityIcons name="close" size={16} color="#b91c1c" />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Request Details</Text>
              <RowLine label="Request Type" value={doc.requestType || '—'} />
              <RowLine label="Category" value={doc.requestCategory || '—'} />
              <RowLine label="Priority" value={doc.requestPriority || doc.priority || '—'} />
              <RowLine label="Status" value={String(doc.status || '—')} />
              <RowLine label="Approval Stage" value={doc.approvalStage || '—'} />
              <RowLine label="Requester" value={doc.userName || doc.userId || '—'} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Description</Text>
              <Text style={styles.bodyText}>{doc.description || '—'}</Text>
            </View>

            {doc.businessJustification ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Business Justification</Text>
                <Text style={styles.bodyText}>{doc.businessJustification}</Text>
              </View>
            ) : null}

            {String(doc.status || '').toUpperCase() === 'REJECTED' ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Rejection</Text>
                <RowLine label="Reason" value={doc.rejectionReason || '—'} />
                <RowLine label="Stage" value={doc.rejectionStage || '—'} />
                <RowLine label="Rejected By" value={doc.rejectedByName || doc.rejectedBy || '—'} />
              </View>
            ) : null}
          </View>
        ) : activeTab === 'attachments' ? (
          <View style={{ gap: 12 }}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Attachments</Text>
              {attachmentsLoading ? (
                <View style={styles.loadingInline}>
                  <ActivityIndicator color="#054653" />
                  <Text style={styles.loadingText}>Loading attachments…</Text>
                </View>
              ) : attachmentsError ? (
                <Text style={styles.mutedText}>{attachmentsError}</Text>
              ) : attachmentItems.length === 0 ? (
                <Text style={styles.mutedText}>No attachments uploaded for this request.</Text>
              ) : (
                attachmentItems.map((a) => (
                  <View key={a.id} style={styles.attachmentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.attachmentName} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text style={styles.attachmentMeta} numberOfLines={1}>
                        {a.mimeType}
                        {a.size ? ` • ${Math.round(a.size / 1024)} KB` : ''}
                        {a.error ? ` • ${a.error}` : ''}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        if (!a.downloadUrl) {
                          Alert.alert('Download unavailable', 'Unable to generate download link for this attachment.');
                          return;
                        }
                        Alert.alert('Download link', a.downloadUrl);
                      }}
                      style={styles.attachmentBtn}
                    >
                      <MaterialCommunityIcons name="download" size={18} color="#054653" />
                    </Pressable>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Activity History</Text>
              {auditLoading ? (
                <View style={styles.loadingInline}>
                  <ActivityIndicator color="#054653" />
                  <Text style={styles.loadingText}>Loading history…</Text>
                </View>
              ) : auditError ? (
                <Text style={styles.mutedText}>{auditError}</Text>
              ) : auditItems.length === 0 ? (
                <Text style={styles.mutedText}>No activity history available.</Text>
              ) : (
                auditItems.map((e, idx) => (
                  <View key={String(e.$id || e.logId || idx)} style={styles.auditRow}>
                    <View style={styles.auditDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.auditTitle} numberOfLines={2}>
                        {String(e.eventType || 'EVENT').replace(/_/g, ' ')}
                      </Text>
                      <Text style={styles.auditDesc} numberOfLines={3}>
                        {e.eventDescription || e.description || '—'}
                      </Text>
                      <Text style={styles.auditMeta} numberOfLines={1}>
                        {(e.userName || '—') as string} •{' '}
                        {e.timestamp ? new Date(String(e.timestamp)).toLocaleString() : '—'}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
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
            <Text style={styles.confirmTitle}>{approvalStage === 'finance' ? 'Complete request' : 'Approve request'}</Text>
            <Text style={styles.confirmText}>
              {approvalStage === 'department'
                ? 'Select an L1 approver and optionally add comments.'
                : approvalStage === 'l1'
                  ? 'Select an L2 approver and optionally add comments.'
                  : approvalStage === 'l2'
                    ? 'Finalize approval or send to Finance.'
                    : 'Complete this request as Finance.'}
            </Text>

            {(approvalStage === 'department' || approvalStage === 'l1') ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.modalLabel}>
                  {approvalStage === 'department' ? 'Select L1 Approver' : 'Select L2 Approver'} *
                </Text>
                <View style={styles.selectList}>
                  {filteredApprovers.slice(0, 40).map((a) => (
                    <Pressable
                      key={String(a.$id || a.userId)}
                      onPress={() => setApproveSelectedUserId(String(a.userId))}
                      style={[styles.selectItem, approveSelectedUserId === String(a.userId) && styles.selectItemActive]}
                    >
                      <Text
                        style={[
                          styles.selectItemText,
                          approveSelectedUserId === String(a.userId) && styles.selectItemTextActive,
                        ]}
                      >
                        {a.approverName || a.name || a.userId}
                      </Text>
                    </Pressable>
                  ))}
                  {filteredApprovers.length === 0 ? (
                    <View style={{ padding: 12 }}>
                      <Text style={styles.mutedText}>No eligible approvers found. Admin setup required.</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {approvalStage === 'l2' ? (
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
                disabled={approving || ((approvalStage === 'department' || approvalStage === 'l1') && !approveSelectedUserId)}
                style={[styles.confirmBtn, { backgroundColor: '#047857' }, approving && { opacity: 0.7 }]}
              >
                {approving ? (
                  <View style={styles.confirmBtnRow}>
                    <ActivityIndicator color="#ffffff" />
                    <Text style={styles.confirmBtnTextDanger}>Processing…</Text>
                  </View>
                ) : (
                  <Text style={styles.confirmBtnTextDanger}>{approvalStage === 'finance' ? 'Complete' : 'Approve'}</Text>
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
            <Text style={styles.confirmText}>Provide a reason for rejection.</Text>

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
                disabled={rejecting || !rejectReason.trim()}
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

  actionCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  helperText: { marginTop: 6, color: '#6b7280', fontSize: 12, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  approveBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#047857',
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  rejectBtn: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtnText: { color: '#b91c1c', fontSize: 12, fontWeight: '900' },

  loadingInline: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  loadingText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  mutedText: { color: '#6b7280', fontSize: 12, fontWeight: '600' },

  attachmentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  attachmentName: { color: '#111827', fontSize: 12, fontWeight: '900' },
  attachmentMeta: { marginTop: 2, color: '#6b7280', fontSize: 11, fontWeight: '700' },
  attachmentBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  auditRow: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  auditDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#054653', marginTop: 6 },
  auditTitle: { color: '#054653', fontSize: 12, fontWeight: '900' },
  auditDesc: { marginTop: 4, color: '#111827', fontSize: 12, fontWeight: '700', lineHeight: 16 },
  auditMeta: { marginTop: 4, color: '#6b7280', fontSize: 11, fontWeight: '700' },

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

