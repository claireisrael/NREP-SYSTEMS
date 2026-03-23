import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { HR_COLLECTIONS, HR_DB_ID, hrDatabases } from '@/lib/appwrite';

type SubmissionMode = 'PENDING' | 'DRAFT';
type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

function canEditRequest(r: any, user: any) {
  try {
    const ownerId = r?.userId;
    const me = user?.$id || user?.userId;
    if (!ownerId || !me || ownerId !== me) return false;
    const status = String(r?.status || 'DRAFT').toUpperCase();
    const stage = String(r?.approvalStage || '').toUpperCase();
    if (status === 'DRAFT' || status === 'REJECTED') return true;
    if (status === 'PENDING') {
      if (stage === 'DEPARTMENT_REVIEW') return !r?.departmentReviewDate;
      if (stage === 'L1_APPROVAL') return !r?.l1ApprovalDate;
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

export default function HrRequestNewOrEdit() {
  const { user, isLoading } = useHrAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ edit?: string | string[] }>();

  const editId = useMemo(() => {
    const raw = params?.edit;
    if (!raw) return null;
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw;
  }, [params?.edit]);

  const [request, setRequest] = useState<any | null>(null);
  const [loadingRequest, setLoadingRequest] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestStatusUpper = String(request?.status || '').toUpperCase();
  const requestApprovalStageUpper = String(request?.approvalStage || '').toUpperCase();

  const editable = useMemo(() => {
    if (!request || !user) return false;
    return canEditRequest(request, user);
  }, [request, user]);

  const [submissionMode, setSubmissionMode] = useState<SubmissionMode>('DRAFT');

  const [form, setForm] = useState({
    requestPriority: 'NORMAL' as Priority,
    subject: '',
    description: '',
    businessJustification: '',
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const loadRequest = useCallback(async () => {
    if (!editId || !user) return;
    try {
      setError(null);
      setLoadingRequest(true);
      const d = await hrDatabases.getDocument(
        HR_DB_ID,
        HR_COLLECTIONS.GENERAL_REQUESTS,
        String(editId),
      );
      setRequest(d);
      const statusUpper = String(d?.status || '').toUpperCase();
      setSubmissionMode(statusUpper === 'PENDING' ? 'PENDING' : 'DRAFT');
      setForm({
        requestPriority: (String(d?.requestPriority || d?.priority || 'NORMAL').toUpperCase() as Priority) || 'NORMAL',
        subject: String(d?.subject || ''),
        description: String(d?.description || ''),
        businessJustification: String(d?.businessJustification || ''),
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load request');
      setRequest(null);
    } finally {
      setLoadingRequest(false);
    }
  }, [editId, user]);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!isLoading && user && editId) loadRequest();
  }, [isLoading, user, editId, loadRequest]);

  const isCreateMode = !editId;

  const validate = useCallback(() => {
    const errors: Record<string, string> = {};
    const subject = form.subject.trim();
    const description = form.description.trim();
    const bj = form.businessJustification.trim();

    if (!subject || subject.length < 10) errors.subject = 'Subject must be at least 10 characters.';
    if (subject.length > 200) errors.subject = 'Subject cannot exceed 200 characters.';
    if (!description || description.length < 20) errors.description = 'Description must be at least 20 characters.';
    if (description.length > 2000) errors.description = 'Description cannot exceed 2000 characters.';
    if (bj && bj.length > 1000) errors.businessJustification = 'Business justification cannot exceed 1000 characters.';

    if (!request) errors.request = 'Request not loaded.';
    return errors;
  }, [form, request]);

  const submit = useCallback(async () => {
    if (!request || !user || !editId) return;
    if (!editable) {
      Alert.alert('Not allowed', 'This request can no longer be edited.');
      return;
    }

    const errors = validate();
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const stageUpper = requestApprovalStageUpper;

      const updateData: any = {
        requestPriority: form.requestPriority,
        subject: form.subject.trim(),
        description: form.description.trim(),
        businessJustification: form.businessJustification.trim() || null,
        // Helpful fields for audit logging (your web version enriches these too).
        userName: user.name || user.email || 'Unknown User',
        userRole: user.systemRole || 'User',
      };

      if (submissionMode === 'DRAFT') {
        updateData.status = 'DRAFT';
        updateData.approvalStage = null;

        // Clear stage-specific dates/comments so the request stops being in the approval pipeline.
        updateData.departmentReviewDate = null;
        updateData.departmentReviewComments = null;
        updateData.l1ApprovalDate = null;
        updateData.l1Comments = null;
        updateData.l2ApprovalDate = null;
        updateData.l2Comments = null;

        updateData.submissionDate = null;
      } else {
        if (!stageUpper) {
          throw new Error('This pending request has no approval stage to resubmit.');
        }

        updateData.status = 'PENDING';
        updateData.approvalStage = stageUpper;
        updateData.submissionDate = now;

        // Re-open the stage by clearing the corresponding date/comments.
        if (stageUpper === 'DEPARTMENT_REVIEW') {
          updateData.departmentReviewDate = null;
          updateData.departmentReviewComments = null;
        }
        if (stageUpper === 'L1_APPROVAL') {
          updateData.l1ApprovalDate = null;
          updateData.l1Comments = null;
        }
        if (stageUpper === 'L2_APPROVAL') {
          updateData.l2ApprovalDate = null;
          updateData.l2Comments = null;
        }
      }

      await hrDatabases.updateDocument(
        HR_DB_ID,
        HR_COLLECTIONS.GENERAL_REQUESTS,
        String(editId),
        updateData,
      );

      Alert.alert('Saved', submissionMode === 'PENDING' ? 'Submitted for approval.' : 'Changes saved as draft.');
      router.replace('/hr/requests');
    } catch (e: any) {
      setError(e?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }, [editable, editId, form, request, requestApprovalStageUpper, router, submissionMode, user, validate]);

  if (isCreateMode) {
    // Keep your original “not yet implemented” UX for creating requests.
    // The edit flow is what normal staff rely on right now.
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="clipboard-plus-outline" size={26} color="#054653" />
            </View>
            <Text style={styles.title}>New Request</Text>
            <Text style={styles.sub}>
              Creating new general requests on mobile is not fully implemented yet. Use Edit on your pending/rejected requests for now.
            </Text>
            <Pressable onPress={() => router.back()} style={styles.btn}>
              <Text style={styles.btnText}>Back</Text>
            </Pressable>
          </View>
        </ScrollView>
        <HrBottomNav />
      </ThemedView>
    );
  }

  // Edit mode
  if (isLoading || !user) return null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(16, insets.top + 12) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="pencil-outline" size={26} color="#054653" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {requestStatusUpper === 'PENDING' ? 'Edit Pending Request' : 'Edit Request'}
              </Text>
              <Text style={styles.sub} numberOfLines={2}>
                Update details and save. For pending requests, saving can re-open the current approval stage.
              </Text>
            </View>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <MaterialCommunityIcons name="chevron-left" size={20} color="#054653" />
            </Pressable>
          </View>
        </View>

        {loadingRequest ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#054653" />
            <Text style={styles.loadingText}>Loading request…</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={loadRequest} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : request ? (
          <View style={{ gap: 12 }}>
            {!editable ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>Editing restricted</Text>
                <Text style={styles.warningText}>
                  This request is not editable in its current status/stage.
                </Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Request Summary</Text>
              <View style={styles.rowLine}>
                <Text style={styles.rowLabel}>Request ID</Text>
                <Text style={styles.rowValue}>{request.requestId || request.$id}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.rowLabel}>Status</Text>
                <Text style={styles.rowValue}>{requestStatusUpper || '—'}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.rowLabel}>Approval Stage</Text>
                <Text style={styles.rowValue}>{requestApprovalStageUpper || '—'}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.rowLabel}>Type</Text>
                <Text style={styles.rowValue}>{request.requestType || '—'}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.rowLabel}>Category</Text>
                <Text style={styles.rowValue}>{request.requestCategory || '—'}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Edit Fields</Text>

              <Text style={styles.label}>Priority</Text>
              <View style={styles.chipsRow}>
                {PRIORITIES.map((p) => {
                  const active = form.requestPriority === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setForm((prev) => ({ ...prev, requestPriority: p }))}
                      disabled={!editable}
                      style={({ pressed }) => [
                        styles.chip,
                        active && styles.chipActive,
                        pressed && { opacity: 0.85 },
                        !editable && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{p}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>Request Subject</Text>
              <TextInput
                value={form.subject}
                onChangeText={(t) => setForm((prev) => ({ ...prev, subject: t }))}
                style={[styles.input, !editable && { opacity: 0.7 }]}
                editable={editable}
                placeholder="Enter a clear subject (min 10 characters)"
                placeholderTextColor="#6b7280"
              />
              {validationErrors.subject ? <Text style={styles.errorInline}>{validationErrors.subject}</Text> : null}

              <Text style={styles.label}>Detailed Description</Text>
              <TextInput
                value={form.description}
                onChangeText={(t) => setForm((prev) => ({ ...prev, description: t }))}
                style={[styles.input, styles.textarea, !editable && { opacity: 0.7 }]}
                editable={editable}
                placeholder="Describe the request in detail (min 20 characters)"
                placeholderTextColor="#6b7280"
                multiline
              />
              {validationErrors.description ? <Text style={styles.errorInline}>{validationErrors.description}</Text> : null}

              <Text style={styles.label}>Business Justification (optional)</Text>
              <TextInput
                value={form.businessJustification}
                onChangeText={(t) => setForm((prev) => ({ ...prev, businessJustification: t }))}
                style={[styles.input, styles.textareaSmall, !editable && { opacity: 0.7 }]}
                editable={editable}
                placeholder="Add context (max 1000 characters)"
                placeholderTextColor="#6b7280"
                multiline
              />
              {validationErrors.businessJustification ? (
                <Text style={styles.errorInline}>{validationErrors.businessJustification}</Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>What happens next?</Text>
              <Text style={styles.helperText}>
                For pending requests, choosing `Submit for Approval` will re-open the current approval stage by clearing its date.
              </Text>

              <View style={styles.radioRow}>
                <Pressable
                  disabled={!editable}
                  onPress={() => setSubmissionMode('PENDING')}
                  style={({ pressed }) => [
                    styles.radioOption,
                    submissionMode === 'PENDING' && styles.radioOptionActive,
                    pressed && { opacity: 0.85 },
                    !editable && { opacity: 0.6 },
                  ]}
                >
                  <View style={[styles.radioDot, submissionMode === 'PENDING' && styles.radioDotActive]} />
                  <Text style={[styles.radioText, submissionMode === 'PENDING' && styles.radioTextActive]}>
                    Submit for Approval
                  </Text>
                </Pressable>

                <Pressable
                  disabled={!editable}
                  onPress={() => setSubmissionMode('DRAFT')}
                  style={({ pressed }) => [
                    styles.radioOption,
                    submissionMode === 'DRAFT' && styles.radioOptionActive,
                    pressed && { opacity: 0.85 },
                    !editable && { opacity: 0.6 },
                  ]}
                >
                  <View style={[styles.radioDot, submissionMode === 'DRAFT' && styles.radioDotActive]} />
                  <Text style={[styles.radioText, submissionMode === 'DRAFT' && styles.radioTextActive]}>
                    Keep as Draft
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={submit}
              disabled={!editable || saving}
              style={({ pressed }) => [
                styles.primaryBtn,
                (!editable || saving) && { opacity: 0.65 },
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={styles.primaryBtnRow}>
                {saving ? <ActivityIndicator color="#ffffff" /> : null}
                <Text style={styles.primaryBtnText}>
                  {saving
                    ? submissionMode === 'PENDING'
                      ? 'Submitting…'
                      : 'Saving…'
                    : submissionMode === 'PENDING'
                      ? 'Submit for Approval'
                      : 'Save Changes'}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>Request not found.</Text>
          </View>
        )}
      </ScrollView>
      <HrBottomNav />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 140 },

  card: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 5,
  },

  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#FFB803',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: { color: '#054653', fontSize: 16, fontWeight: '900' },
  sub: { marginTop: 6, color: '#6b7280', fontSize: 12, fontWeight: '600', lineHeight: 18 },

  btn: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: '#054653',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },

  loadingBox: { paddingVertical: 30, alignItems: 'center', gap: 8 },
  loadingText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },

  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  errorInline: { marginTop: 6, color: '#b91c1c', fontSize: 12, fontWeight: '700' },

  retryBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 12,
    backgroundColor: '#054653',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  retryText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },

  warningBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFB803',
    backgroundColor: '#fff7ed',
    padding: 12,
    marginBottom: 2,
  },
  warningTitle: { color: '#054653', fontSize: 12, fontWeight: '900' },
  warningText: { marginTop: 4, color: '#6b7280', fontSize: 12, fontWeight: '600' },

  sectionTitle: { color: '#054653', fontSize: 13, fontWeight: '900', marginBottom: 10 },
  label: { color: '#111827', fontSize: 12, fontWeight: '800', marginTop: 10 },
  helperText: { marginTop: 6, color: '#6b7280', fontSize: 12, fontWeight: '600', lineHeight: 16 },

  rowLine: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  rowLabel: { color: '#6b7280', fontSize: 11, fontWeight: '800' },
  rowValue: { marginTop: 2, color: '#111827', fontSize: 13, fontWeight: '700' },

  input: {
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
  },
  textarea: { minHeight: 110, textAlignVertical: 'top' as any, paddingVertical: 10 },
  textareaSmall: { minHeight: 70, textAlignVertical: 'top' as any, paddingVertical: 10 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  chipText: { color: '#6b7280', fontSize: 12, fontWeight: '900' },
  chipTextActive: { color: '#054653' },

  radioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  radioOptionActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#9ca3af',
  },
  radioDotActive: { borderColor: '#054653', backgroundColor: '#054653' },
  radioText: { color: '#6b7280', fontSize: 12, fontWeight: '800' },
  radioTextActive: { color: '#054653' },

  primaryBtn: {
    borderRadius: 16,
    backgroundColor: '#054653',
    paddingVertical: 14,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  primaryBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '900' },
});

