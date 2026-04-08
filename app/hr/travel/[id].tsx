import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import { HR_COLLECTIONS, HR_DB_ID, hrDatabases, Query } from '@/lib/appwrite';

export default function HrTravelRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isLoading } = useHrAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [doc, setDoc] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [actionStage, setActionStage] = useState<'l1' | 'l2' | null>(null);
  const [actionComments, setActionComments] = useState('');
  const [acting, setActing] = useState(false);

  const canEdit = useMemo(() => {
    const status = String(doc?.status || '').toLowerCase();
    return doc && doc.userId === user?.$id && (status === 'pending' || status === 'rejected');
  }, [doc, user?.$id]);

  const parsed = useMemo(() => {
    if (!doc) return null;
    return {
      ...doc,
      expenseBreakdown: safeJsonParseArray(doc.expenseBreakdown),
      bankDetails: safeJsonParseObject(doc.bankDetails),
      attachments: safeJsonParseArray(doc.attachments),
    };
  }, [doc]);

  const financeDeptId = ((process.env as any)?.EXPO_PUBLIC_FINANCE_DEPARTMENT_ID ||
    (process.env as any)?.NEXT_PUBLIC_FINANCE_DEPARTMENT_ID ||
    '') as string;
  const isFinanceUser = !!financeDeptId && String((user as any)?.departmentId || '') === financeDeptId;

  const canAct = useMemo(() => {
    if (!parsed || !user?.$id) return { l1: false, l2: false, finance: false };
    const myId = String(user.$id);
    const requesterId = String(parsed.userId || '');
    if (requesterId && requesterId === myId) return { l1: false, l2: false };
    const status = String(parsed.status || '').toLowerCase();
    return {
      l1: String(parsed.l1ApproverId || '') === myId && status === 'pending',
      l2: String(parsed.l2ApproverId || '') === myId && status === 'l1_approved',
      finance: isFinanceUser && status === 'l2_approved',
    };
  }, [parsed, user?.$id, isFinanceUser]);

  const resolveActiveL2ApproverId = useCallback(async () => {
    const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUEST_APPROVERS, [
      Query.equal('level', 'L2'),
      Query.equal('isActive', true),
      Query.limit(1),
    ]);
    const d = (res as any)?.documents?.[0];
    const uid = String(d?.userId || '').trim();
    if (!uid) throw new Error('No active L2 approver is configured.');
    return uid;
  }, []);

  const openApprove = (stage: 'l1' | 'l2' | 'finance') => {
    if (stage === 'l1' && !canAct.l1) return;
    if (stage === 'l2' && !canAct.l2) return;
    if (stage === 'finance' && !canAct.finance) return;
    setActionStage(stage);
    setActionComments('');
    setApproveModalOpen(true);
  };

  const openReject = (stage: 'l1' | 'l2' | 'finance') => {
    if (stage === 'l1' && !canAct.l1) return;
    if (stage === 'l2' && !canAct.l2) return;
    if (stage === 'finance' && !canAct.finance) return;
    setActionStage(stage);
    setActionComments('');
    setRejectModalOpen(true);
  };

  const closeActionModals = useCallback(() => {
    if (acting) return;
    setApproveModalOpen(false);
    setRejectModalOpen(false);
    setActionStage(null);
    setActionComments('');
  }, [acting]);

  const confirmApprove = useCallback(async () => {
    if (!parsed?.$id || !actionStage) return;
    setActing(true);
    try {
      const now = new Date().toISOString();
      const update: any = {};
      if (actionStage === 'l1') {
        const l2Id = await resolveActiveL2ApproverId();
        update.status = 'l1_approved';
        update.l1ApprovalDate = now;
        update.l1Comments = actionComments.trim() || null;
        update.l2ApproverId = l2Id;
      } else if (actionStage === 'l2') {
        update.status = 'l2_approved';
        update.l2ApprovalDate = now;
        update.l2Comments = actionComments.trim() || null;
      } else {
        update.status = 'completed';
        update.completedDate = now;
        update.completionComments = actionComments.trim() || null;
      }
      await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, String(parsed.$id), update);
      closeActionModals();
      await load();
    } catch (e: any) {
      Alert.alert('Approve failed', e?.message || 'Unable to approve this request.');
    } finally {
      setActing(false);
    }
  }, [actionComments, actionStage, closeActionModals, load, parsed?.$id, resolveActiveL2ApproverId]);

  const confirmReject = useCallback(async () => {
    if (!parsed?.$id || !actionStage || !user?.$id) return;
    const reason = actionComments.trim();
    if (!reason) {
      Alert.alert('Validation', 'Please enter a rejection reason.');
      return;
    }
    setActing(true);
    try {
      const now = new Date().toISOString();
      const update: any = {
        status: 'rejected',
        rejectionReason: reason,
        rejectedBy: String(user.$id),
        rejectionDate: now,
      };
      await hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, String(parsed.$id), update);
      closeActionModals();
      await load();
    } catch (e: any) {
      Alert.alert('Reject failed', e?.message || 'Unable to reject this request.');
    } finally {
      setActing(false);
    }
  }, [actionComments, actionStage, closeActionModals, load, parsed?.$id, user?.$id]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      // Web routes use requestId (e.g. TR-xxxxxx), not Appwrite $id.
      const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
        Query.equal('requestId', String(id)),
        Query.limit(1),
      ]);
      let d = (res as any)?.documents?.[0];

      // Fallback (older mobile links may still pass Appwrite $id)
      if (!d) {
        try {
          d = await hrDatabases.getDocument(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, String(id));
        } catch {
          d = null;
        }
      }

      if (!d) throw new Error('Travel request not found');
      setDoc(d);

      // Attachments are stored as separate documents on the web.
      try {
        const requestId = String(d.requestId || id);
        const att = await hrDatabases.listDocuments(
          HR_DB_ID,
          HR_COLLECTIONS.TRAVEL_REQUEST_ATTACHMENTS,
          [Query.equal('requestId', requestId), Query.orderDesc('uploadDate'), Query.limit(50)],
        );
        setAttachments((att as any)?.documents ?? []);
      } catch {
        setAttachments([]);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load request');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!isLoading && user) load();
  }, [isLoading, user, load]);

  if (isLoading || !user) return null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => router.back()} style={styles.headerIconBtn}>
              <MaterialCommunityIcons name="chevron-left" size={22} color="#054653" />
            </Pressable>

            <View style={{ flex: 1 }}>
              <Text style={styles.headerKicker}>Travel Request</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {parsed?.requestId ? parsed.requestId : String(id)}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {parsed?.destination || parsed?.activityName || 'Request details'}
              </Text>
            </View>

            {canEdit ? (
              <Pressable
                onPress={() => router.push(`/hr/travel/${String(parsed?.requestId || id)}/edit`)}
                style={styles.headerIconBtn}
              >
                <MaterialCommunityIcons name="pencil-outline" size={20} color="#054653" />
              </Pressable>
            ) : (
              <View style={{ width: 36 }} />
            )}
          </View>

          {!loading && !error && parsed ? (
            <View style={styles.headerMetaRow}>
              <View style={[styles.statusPill, statusPillStyle(parsed.status).pill]}>
                <Text style={[styles.statusPillText, statusPillStyle(parsed.status).text]}>
                  {statusLabel(parsed.status)}
                </Text>
              </View>
              <View style={styles.amountPill}>
                <MaterialCommunityIcons name="cash" size={14} color="#054653" />
                <Text style={styles.amountText}>
                  {formatCurrency(parsed.totalAmount, parsed.currency) || '—'}
                </Text>
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
          </View>
        ) : parsed ? (
          <View style={{ gap: 12 }}>
            {(canAct.l1 || canAct.l2 || canAct.finance) ? (
              <View style={styles.actionCard}>
                <Text style={styles.actionTitle}>
                  {canAct.l1 ? 'Level 1 approval' : canAct.l2 ? 'Level 2 approval' : 'Finance completion'}
                </Text>
                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.actionIconBtn}
                    onPress={() => openApprove(canAct.l1 ? 'l1' : canAct.l2 ? 'l2' : 'finance')}
                  >
                    <MaterialCommunityIcons name="check" size={18} color="#047857" />
                  </Pressable>
                  <Pressable
                    style={styles.actionIconBtn}
                    onPress={() => openReject(canAct.l1 ? 'l1' : canAct.l2 ? 'l2' : 'finance')}
                  >
                    <MaterialCommunityIcons name="close" size={18} color="#b91c1c" />
                  </Pressable>
                </View>
              </View>
            ) : null}
            <View style={styles.card}>
              <Row label="Status" value={statusLabel(parsed.status)} />
              <Row
                label="Total Amount"
                value={formatCurrency(parsed.totalAmount, parsed.currency) || '—'}
              />
              <Row label="Submission Date" value={formatDateTime(parsed.submissionDate)} />
            </View>

            <Section title="Trip Details">
              <Grid>
                <Field label="Payment Type" value={paymentTypeLabel(parsed.paymentType)} />
                <Field label="Activity Name" value={parsed.activityName} />
                {parsed.projectName ? <Field label="Project Name" value={parsed.projectName} /> : null}
                {parsed.projectId ? <Field label="Project ID" value={parsed.projectId} /> : null}
                <Field label="Travel Type" value={parsed.travelType} />
                <Field label="Origin" value={parsed.origin} />
                <Field label="Destination" value={parsed.destination} />
                <Field label="From Date/Time" value={formatDateTime(parsed.dateTimeFrom)} />
                <Field label="To Date/Time" value={formatDateTime(parsed.dateTimeTo)} />
              </Grid>
            </Section>

            <Section title="Expense Breakdown">
              <View style={styles.card}>
                <Row label="Currency" value={parsed.currency || '—'} />
                {Array.isArray(parsed.expenseBreakdown) && parsed.expenseBreakdown.length > 0 ? (
                  <View style={{ marginTop: 10, gap: 10 }}>
                    {parsed.expenseBreakdown.map((e: any, idx: number) => (
                      <View key={e?.id || idx} style={styles.expenseItem}>
                        <Text style={styles.expenseTitle}>{String(e?.purpose || `Item ${idx + 1}`)}</Text>
                        {e?.description ? (
                          <Text style={styles.expenseDesc}>{String(e.description)}</Text>
                        ) : null}
                        <View style={styles.expenseMetaRow}>
                          <Text style={styles.expenseMeta}>
                            Qty: {typeof e?.quantity === 'number' ? e.quantity : String(e?.quantity || '—')}
                          </Text>
                          <Text style={styles.expenseMeta}>
                            Unit: {formatCurrency(e?.unitCost, parsed.currency) || '—'}
                          </Text>
                          <Text style={styles.expenseMeta}>
                            Subtotal: {formatCurrency(e?.subtotal, parsed.currency) || '—'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.mutedText}>No expense items.</Text>
                )}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Amount</Text>
                  <Text style={styles.totalValue}>
                    {formatCurrency(parsed.totalAmount, parsed.currency) || '—'}
                  </Text>
                </View>
              </View>
            </Section>

            <Section title="Payment Information">
              <Grid>
                <Field label="Payment Method" value={paymentMethodLabel(parsed.paymentMethod)} />
                {String(parsed.paymentMethod || '').toLowerCase() === 'bank_transfer' ? (
                  parsed.hasBankDetailsOnFile ? (
                    <Field label="Bank Details" value="On file with finance department" />
                  ) : (
                    <>
                      <Field label="Account Number" value={parsed.bankDetails?.accountNumber} />
                      <Field label="Bank Name" value={parsed.bankDetails?.bankName} />
                      <Field label="Branch" value={parsed.bankDetails?.branch} />
                      {parsed.bankDetails?.swiftCode ? (
                        <Field label="SWIFT Code" value={parsed.bankDetails.swiftCode} />
                      ) : null}
                    </>
                  )
                ) : null}
                {String(parsed.paymentMethod || '').toLowerCase() === 'mobile_money' ? (
                  <Field label="Mobile Number" value={parsed.mobileNumber} />
                ) : null}
              </Grid>
            </Section>

            <Section title="Approval Information">
              <Grid>
                <Field label="Level 1 Approver ID" value={parsed.l1ApproverId} />
                {parsed.l1ApprovalDate ? (
                  <Field label="L1 Approval Date" value={formatDateTime(parsed.l1ApprovalDate)} />
                ) : null}
                {parsed.l1Comments ? <Field label="L1 Comments" value={parsed.l1Comments} /> : null}

                {parsed.l2ApproverId ? <Field label="Level 2 Approver ID" value={parsed.l2ApproverId} /> : null}
                {parsed.l2ApprovalDate ? (
                  <Field label="L2 Approval Date" value={formatDateTime(parsed.l2ApprovalDate)} />
                ) : null}
                {parsed.l2Comments ? <Field label="L2 Comments" value={parsed.l2Comments} /> : null}

                {String(parsed.status || '').toLowerCase() === 'rejected' ? (
                  <>
                    <Field label="Rejection Date" value={formatDateTime(parsed.rejectionDate)} />
                    <Field label="Rejection Reason" value={parsed.rejectionReason} />
                  </>
                ) : null}

                {String(parsed.status || '').toLowerCase() === 'completed' ? (
                  <>
                    <Field label="Completed" value={formatDateTime(parsed.completedDate)} />
                    {parsed.completionComments ? (
                      <Field label="Completion Comments" value={parsed.completionComments} />
                    ) : null}
                  </>
                ) : null}
              </Grid>
            </Section>

            {attachments.length > 0 ? (
              <Section title={`Attachments (${attachments.length})`}>
                <View style={styles.card}>
                  {attachments.map((a) => (
                    <View key={a.$id} style={styles.attachmentRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.attachmentName}>{a.fileName || 'Attachment'}</Text>
                        <Text style={styles.attachmentMeta}>
                          {a.mimeType ? String(a.mimeType) : '—'}
                          {a.fileSize ? ` • ${formatFileSize(a.fileSize)}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </Section>
            ) : null}

            {parsed.comments ? (
              <Section title="Additional Comments">
                <View style={styles.card}>
                  <Text style={styles.commentText}>{String(parsed.comments)}</Text>
                </View>
              </Section>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      <HrBottomNav />

      <Modal visible={approveModalOpen} transparent animationType="fade" onRequestClose={closeActionModals}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeActionModals} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Approve</Text>
            <Text style={styles.modalSub}>
              {actionStage === 'l1' ? 'Approves L1 and forwards to L2.' : 'Approves L2 and forwards to finance.'}
            </Text>
            <TextInput
              value={actionComments}
              onChangeText={setActionComments}
              placeholder="Comments (optional)"
              placeholderTextColor="#9ca3af"
              style={styles.modalInput}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable onPress={closeActionModals} style={[styles.modalBtn, styles.modalBtnOutline]} disabled={acting}>
                <Text style={styles.modalBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmApprove} style={[styles.modalBtn, styles.modalBtnApprove]} disabled={acting}>
                <Text style={styles.modalBtnTextApprove}>{acting ? 'Working…' : 'Approve'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={rejectModalOpen} transparent animationType="fade" onRequestClose={closeActionModals}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeActionModals} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject</Text>
            <Text style={styles.modalSub}>Adds a rejection reason and returns to requester.</Text>
            <TextInput
              value={actionComments}
              onChangeText={setActionComments}
              placeholder="Rejection reason *"
              placeholderTextColor="#9ca3af"
              style={styles.modalInput}
              multiline
            />
            <View style={styles.modalActions}>
              <Pressable onPress={closeActionModals} style={[styles.modalBtn, styles.modalBtnOutline]} disabled={acting}>
                <Text style={styles.modalBtnTextOutline}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmReject} style={[styles.modalBtn, styles.modalBtnReject]} disabled={acting}>
                <Text style={styles.modalBtnTextReject}>{acting ? 'Working…' : 'Reject'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="default" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <ThemedText type="default" style={styles.rowValue}>
        {value}
      </ThemedText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value ? String(value) : '—'}</Text>
    </View>
  );
}

function safeJsonParseArray(v: any): any[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeJsonParseObject(v: any): Record<string, any> | null {
  if (!v) return null;
  if (typeof v === 'object' && !Array.isArray(v)) return v as any;
  if (typeof v !== 'string') return null;
  try {
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function formatDateTime(v: any) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function formatCurrency(amount: any, currency: any) {
  if (amount === null || amount === undefined || amount === '') return '';
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n)) return '';
  const c = currency ? String(currency) : '';
  return c ? `${c} ${n.toLocaleString()}` : n.toLocaleString();
}

function paymentTypeLabel(type: any) {
  return String(type || '').toLowerCase() === 'advance' ? 'Advance' : type ? String(type) : '—';
}

function paymentMethodLabel(method: any) {
  const m = String(method || '').toLowerCase();
  if (m === 'cash') return 'Cash';
  if (m === 'bank_transfer') return 'Bank Transfer';
  if (m === 'mobile_money') return 'Mobile Money';
  if (m === 'cheque') return 'Cheque';
  return method ? String(method) : '—';
}

function statusLabel(status: any) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return 'Pending L1 Approval';
  if (s === 'l1_approved') return 'Pending L2 Approval';
  if (s === 'l2_approved') return 'Pending Finance';
  if (s === 'rejected') return 'Rejected';
  if (s === 'completed') return 'Completed';
  return status ? String(status) : '—';
}

function statusPillStyle(status: any) {
  const s = String(status || '').toLowerCase();
  if (s === 'rejected') return { pill: { backgroundColor: '#fef2f2' }, text: { color: '#b91c1c' } };
  if (s === 'l2_approved') return { pill: { backgroundColor: '#fff7ed' }, text: { color: '#92400e' } };
  if (s === 'l1_approved') return { pill: { backgroundColor: '#eff6ff' }, text: { color: '#1d4ed8' } };
  if (s === 'completed') return { pill: { backgroundColor: '#f5f3ff' }, text: { color: '#5b21b6' } };
  return { pill: { backgroundColor: '#fff7ed' }, text: { color: '#92400e' } };
}

function formatFileSize(bytes: any) {
  const n = typeof bytes === 'number' ? bytes : Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(n) / Math.log(k)));
  return `${(n / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 140 },
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
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#e6f4f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerKicker: { color: '#6b7280', fontSize: 11, fontWeight: '800' },
  headerTitle: { color: '#054653', fontSize: 18, fontWeight: '900', marginTop: 2 },
  headerSub: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '600' },
  actionCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  actionTitle: { color: '#054653', fontSize: 13, fontWeight: '900' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  modalTitle: { color: '#0f172a', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  modalSub: { marginTop: 6, color: '#6b7280', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  modalInput: {
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
  modalActions: { marginTop: 14, flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnOutline: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  modalBtnApprove: { backgroundColor: '#047857' },
  modalBtnReject: { backgroundColor: '#b91c1c' },
  modalBtnTextOutline: { color: '#054653', fontSize: 12, fontWeight: '900' },
  modalBtnTextApprove: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  modalBtnTextReject: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  headerMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '900' },
  amountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  amountText: { color: '#054653', fontSize: 11, fontWeight: '900' },
  loadingBox: { paddingVertical: 26, alignItems: 'center' },
  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 12,
  },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '600' },
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowLabel: { color: '#6b7280', fontSize: 11, fontWeight: '700' },
  rowValue: { marginTop: 2, color: '#111827', fontSize: 13, fontWeight: '600' },
  sectionTitle: { color: '#054653', fontSize: 13, fontWeight: '900' },
  grid: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  field: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  fieldLabel: { color: '#6b7280', fontSize: 11, fontWeight: '800' },
  fieldValue: { marginTop: 2, color: '#111827', fontSize: 13, fontWeight: '600' },
  expenseItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 10,
  },
  expenseTitle: { color: '#111827', fontWeight: '900', fontSize: 12 },
  expenseDesc: { marginTop: 4, color: '#6b7280', fontSize: 11 },
  expenseMetaRow: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  expenseMeta: { color: '#374151', fontSize: 11, fontWeight: '700' },
  totalRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: { color: '#054653', fontSize: 12, fontWeight: '900' },
  totalValue: { color: '#054653', fontSize: 14, fontWeight: '900' },
  mutedText: { marginTop: 10, color: '#6b7280', fontSize: 12 },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  attachmentName: { color: '#111827', fontSize: 12, fontWeight: '800' },
  attachmentMeta: { marginTop: 2, color: '#6b7280', fontSize: 11 },
  commentText: { color: '#111827', fontSize: 13, fontWeight: '600' },
});

