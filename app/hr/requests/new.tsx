import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedView } from '@/components/themed-view';
import { HrBottomNav } from '@/components/HrBottomNav';
import { useHrAuth } from '@/context/HrAuthContext';
import { HR_BUCKETS, HR_COLLECTIONS, HR_DB_ID, hrDatabases, hrStorage, ID, Query } from '@/lib/appwrite';
import { generateUniqueCode } from '@/lib/hr/travelRequests';

type SubmissionMode = 'PENDING' | 'DRAFT';
type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

type LocalAttachment = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

type SubmitMode = 'DRAFT' | 'PENDING';

const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/plain',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

async function withTimeout<T>(p: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

function guessMimeTypeFromName(name: string): string {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return 'application/msword';
  if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

async function fetchGeneralRequestCategoryByCode(categoryCode: string) {
  if (!categoryCode) return null;
  const resolved = await resolveGeneralRequestAdminCollectionIds();
  const categoriesId = resolved.categoriesId || HR_COLLECTIONS.GENERAL_REQUEST_CATEGORIES;
  if (!categoriesId) return null;
  try {
    const res = await hrDatabases.listDocuments(HR_DB_ID, categoriesId as any, [
      Query.equal('categoryCode', categoryCode),
      Query.limit(1),
    ]);
    return (res as any)?.documents?.[0] ?? null;
  } catch {
    return null;
  }
}

async function loadGeneralRequestL1Approvers(excludeUserId: string) {
  const resolved = await resolveGeneralRequestAdminCollectionIds();
  const approversId = resolved.approversId || HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS;
  if (!approversId) return [];
  const res = await hrDatabases.listDocuments(HR_DB_ID, approversId as any, [
    Query.equal('isActive', true),
    Query.orderAsc('approverName'),
    Query.limit(300),
  ]);
  const docs = ((res as any)?.documents ?? []) as any[];
  const q = String(excludeUserId || '');
  return docs
    .filter((a) => String(a.level || '').toUpperCase() === 'L1')
    .filter((a) => a.isActive !== false)
    .filter((a) => String(a.userId) !== q);
}

async function resolveGeneralRequestAdminCollectionIds() {
  const fromEnv = {
    typesId: String(HR_COLLECTIONS.GENERAL_REQUEST_TYPES || ''),
    categoriesId: String(HR_COLLECTIONS.GENERAL_REQUEST_CATEGORIES || ''),
    approversId: String(HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS || ''),
  };
  if (fromEnv.typesId && fromEnv.categoriesId && fromEnv.approversId) return fromEnv;

  try {
    const anyDb = hrDatabases as any;
    if (typeof anyDb.listCollections !== 'function') return fromEnv;
    const res = await anyDb.listCollections(HR_DB_ID);
    const collections = (res?.collections ?? []) as any[];
    const pick = (needle: string) =>
      String(collections.find((c) => String(c.name || '').toLowerCase().includes(needle.toLowerCase()))?.$id || '');

    return {
      typesId: fromEnv.typesId || pick('general request types'),
      categoriesId: fromEnv.categoriesId || pick('general request categories'),
      approversId: fromEnv.approversId || pick('general request approvers'),
    };
  } catch {
    return fromEnv;
  }
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
      // @ts-ignore - RN fetch supports AbortController in modern runtimes
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) console.warn('Email API failed', res.status);
  } catch (e) {
    console.warn('Email send failed', e);
  }
}

async function notifySubmissionBestEffort(params: {
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
        `Your request has been submitted and is awaiting: ${params.nextStageLabel}.\n\n` +
        `Request ID: ${requestId}\n` +
        `Type: ${reqType}\n` +
        `Subject: ${subject}\n\n` +
        `Best regards,\nNREP HR System`,
      email: requester.email,
      cc: requester.otherEmail,
    });
  }
}

async function resolveDepartmentHead(departmentId: string) {
  if (!departmentId) throw new Error('Department is not set.');
  const dept = await hrDatabases.getDocument(HR_DB_ID, HR_COLLECTIONS.DEPARTMENTS, departmentId);

  const managerId =
    (dept as any)?.managerId ||
    (dept as any)?.departmentHeadId ||
    (dept as any)?.departmentHeadUserId ||
    (dept as any)?.headId ||
    null;

  if (!managerId) throw new Error('Department head is not configured for this department.');

  const [managerUserRes] = await Promise.all([
    hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.USERS, [Query.equal('userId', String(managerId)), Query.limit(1)]),
  ]);
  const managerUserDoc = (managerUserRes as any)?.documents?.[0];
  const managerName =
    managerUserDoc?.name ||
    (dept as any)?.managerName ||
    (dept as any)?.departmentHeadName ||
    managerUserDoc?.email ||
    String(managerId);

  return { managerId: String(managerId), managerName: String(managerName) };
}

const GENERAL_REQUEST_WIZARD_STEPS = 5 as const;

function HrRequestCreateWizard({ user, onCancel }: { user: any; onCancel: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // HrBottomNav is position:absolute (~safe area + pill + padding); keep footer above it.
  const hrBottomNavReserve = useMemo(() => Math.max(insets.bottom, 10) + 100, [insets.bottom]);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [types, setTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [approvers, setApprovers] = useState<any[]>([]);

  const [requestTypeCode, setRequestTypeCode] = useState<string>('');
  const [requestCategoryCode, setRequestCategoryCode] = useState<string>('');
  const [requestPriority, setRequestPriority] = useState<Priority>('NORMAL');
  const [subject, setSubject] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [businessJustification, setBusinessJustification] = useState<string>('');
  const [selectedL1ApproverId, setSelectedL1ApproverId] = useState<string>('');

  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [confirmSubmission, setConfirmSubmission] = useState(false);

  const [submitPhase, setSubmitPhase] = useState<SubmitMode | null>(null);
  const [completedSubmitMode, setCompletedSubmitMode] = useState<SubmitMode>('PENDING');
  const [submittedDocId, setSubmittedDocId] = useState<string | null>(null);
  const [showSubmittedModal, setShowSubmittedModal] = useState(false);

  const downloadSubmittedRequest = useCallback(async () => {
    if (!submittedDocId) return;
    try {
      const doc = await hrDatabases.getDocument(
        HR_DB_ID,
        HR_COLLECTIONS.GENERAL_REQUESTS,
        String(submittedDocId),
      );
      if (!doc) throw new Error('Request not found.');

      const safe = (v: any) => String(v ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const requestId = safe((doc as any).requestId || (doc as any).$id || submittedDocId);

      const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 20px; color: #0f172a; }
      .brand { background: linear-gradient(90deg, #054653, #0e706d, #FFB803); border-radius: 14px; padding: 14px 16px; color: white; }
      .title { font-size: 18px; font-weight: 800; margin: 0; }
      .sub { font-size: 12px; opacity: 0.92; margin: 6px 0 0; }
      .card { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; }
      .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid #f3f4f6; }
      .row:first-child { border-top: 0; }
      .k { font-size: 11px; color: #6b7280; font-weight: 700; }
      .v { font-size: 12px; color: #0f172a; font-weight: 700; text-align: right; }
      .muted { color: #6b7280; font-weight: 600; }
    </style>
  </head>
  <body>
    <div class="brand">
      <p class="title">General Request</p>
      <p class="sub">Request ID: ${requestId}</p>
    </div>

    <div class="card">
      <div class="row"><div class="k">Type</div><div class="v">${safe((doc as any).requestType || '—')}</div></div>
      <div class="row"><div class="k">Category</div><div class="v">${safe((doc as any).requestCategory || '—')}</div></div>
      <div class="row"><div class="k">Priority</div><div class="v">${safe((doc as any).requestPriority || '—')}</div></div>
      <div class="row"><div class="k">Status</div><div class="v">${safe((doc as any).status || '—')}</div></div>
      <div class="row"><div class="k">Subject</div><div class="v">${safe((doc as any).subject || '—')}</div></div>
      <div class="row"><div class="k">Description</div><div class="v muted">${safe((doc as any).description || '—')}</div></div>
      <div class="row"><div class="k">Business justification</div><div class="v muted">${safe((doc as any).businessJustification || '—')}</div></div>
      <div class="row"><div class="k">Submitted</div><div class="v">${safe((doc as any).submissionDate || (doc as any).$createdAt || '—')}</div></div>
    </div>
  </body>
</html>`;

      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          UTI: 'com.adobe.pdf',
          mimeType: 'application/pdf',
          dialogTitle: `Request ${requestId}`,
        } as any);
      } else {
        Alert.alert('Saved', `PDF generated at:\n${file.uri}`);
      }
    } catch (e: any) {
      Alert.alert('Download failed', e?.message || 'Unable to download this request.');
    }
  }, [submittedDocId]);
  const [submitStage, setSubmitStage] = useState<string>('');

  const submitting = submitPhase !== null;

  const requestType = useMemo(() => types.find((t) => String(t.typeCode) === requestTypeCode), [types, requestTypeCode]);
  const requestCategory = useMemo(
    () => categories.find((c) => String(c.categoryCode) === requestCategoryCode),
    [categories, requestCategoryCode],
  );

  const requiresDepartmentApproval = !!requestCategory?.requiresDepartmentApproval;

  const filteredCategories = useMemo(() => {
    if (!requestTypeCode) return [];
    return categories
      .filter((c) => String(c.requestType || '') === requestTypeCode)
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  }, [categories, requestTypeCode]);

  const l1ApproverChoices = useMemo(() => {
    const q = String(user?.$id || '');
    return approvers
      .filter((a) => String(a.level || '').toUpperCase() === 'L1')
      .filter((a) => a.isActive !== false)
      .filter((a) => String(a.userId) !== q)
      .sort((a, b) => String(a.approverName || a.name || '').localeCompare(String(b.approverName || b.name || '')));
  }, [approvers, user?.$id]);

  const totalAttachmentSize = useMemo(() => attachments.reduce((sum, f) => sum + (Number(f.size) || 0), 0), [attachments]);

  useEffect(() => {
    const boot = async () => {
      try {
        setLoading(true);
        setError(null);

        const resolved = await resolveGeneralRequestAdminCollectionIds();
        if (!resolved.typesId || !resolved.categoriesId || !resolved.approversId) {
          setError('Request types/categories/approvers collections are not configured on mobile.');
          return;
        }

        const [t, c, a] = await Promise.all([
          hrDatabases.listDocuments(HR_DB_ID, resolved.typesId as any, [
            Query.orderAsc('sortOrder'),
            Query.limit(200),
          ]),
          hrDatabases.listDocuments(HR_DB_ID, resolved.categoriesId as any, [
            Query.limit(500),
            Query.orderAsc('displayOrder'),
          ]),
          hrDatabases.listDocuments(HR_DB_ID, resolved.approversId as any, [
            Query.equal('isActive', true),
            Query.orderAsc('approverName'),
            Query.limit(300),
          ]),
        ]);

        setTypes(((t as any)?.documents ?? []) as any[]);
        setCategories(((c as any)?.documents ?? []) as any[]);
        setApprovers(((a as any)?.documents ?? []) as any[]);
      } catch (e: any) {
        setError(e?.message || 'Failed to load request wizard data');
      } finally {
        setLoading(false);
      }
    };

    if (user?.$id) boot();
  }, [user?.$id]);

  useEffect(() => {
    // When category changes, reset dependent fields + set default priority (web mirrors this behavior).
    if (!requestCategory) return;
    setRequestPriority(String(requestCategory.defaultPriority || 'NORMAL').toUpperCase() as Priority);
    if (requiresDepartmentApproval) setSelectedL1ApproverId('');
  }, [requestCategoryCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const stepTitle = useMemo(() => {
    if (currentStep === 1) return 'Request Type & Category';
    if (currentStep === 2) return 'Request Details';
    if (currentStep === 3) return 'Level 1 Approver';
    if (currentStep === 4) return 'Attachments';
    return 'Review & Submit';
  }, [currentStep]);

  /** Second line on submit-for-approval: L1 display name only (no payload prose). */
  const submitForApprovalApproverLine = useMemo(() => {
    if (requiresDepartmentApproval) return '';
    const l1 = approvers.find((a) => String(a.userId) === String(selectedL1ApproverId));
    return String(l1?.approverName || l1?.name || '').trim();
  }, [requiresDepartmentApproval, approvers, selectedL1ApproverId]);

  const pickFilesEnabled = !!HR_BUCKETS.GENERAL_REQUEST_ATTACHMENTS;

  const clearGeneralRequestType = useCallback(() => {
    setRequestTypeCode('');
    setRequestCategoryCode('');
    setSelectedL1ApproverId('');
    setConfirmSubmission(false);
  }, []);

  const clearGeneralRequestCategory = useCallback(() => {
    setRequestCategoryCode('');
    setSelectedL1ApproverId('');
    setConfirmSubmission(false);
  }, []);

  const pickFiles = async () => {
    if (!pickFilesEnabled) {
      Alert.alert('Setup needed', 'Add `EXPO_PUBLIC_GENERAL_REQUEST_ATTACHMENTS_BUCKET_ID` in `mobile/.env` and restart.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: ALLOWED_ATTACHMENT_MIME_TYPES,
      });

      if (result.canceled) return;
      const assets = result.assets || [];

      const next: LocalAttachment[] = [];
      let nextTotalSize = totalAttachmentSize;
      for (const a of assets) {
        const uri = a.uri;
        const name = a.name || 'file';
        const size = Number(a.size || 0);
        const mimeType = a.mimeType || guessMimeTypeFromName(name);

        if (!uri || !name) continue;
        if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType)) {
          Alert.alert('Unsupported file', `${name} has an unsupported format.`);
          continue;
        }
        if (size > MAX_FILE_SIZE) {
          Alert.alert('File too large', `${name} exceeds 10MB.`);
          continue;
        }

        // Prevent duplicates by name+size.
        const isDup = attachments.some((x) => x.name === name && x.size === size);
        if (isDup) continue;

        if (nextTotalSize + size > MAX_TOTAL_SIZE) {
          Alert.alert('Total size limit reached', 'Your total upload size cannot exceed 50MB.');
          break;
        }

        nextTotalSize += size;
        next.push({
          id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          uri,
          name,
          mimeType,
          size,
        });
      }

      if (next.length) {
        setAttachments((prev) => [...prev, ...next]);
      }
    } catch (e: any) {
      Alert.alert('Picker error', e?.message || 'Failed to pick files');
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((x) => x.id !== id));
  };

  const validateStepAndCollectErrors = (mode: SubmitMode) => {
    const errors: string[] = [];

    if (!requestTypeCode) errors.push('Select a request type.');
    if (!requestCategoryCode) errors.push('Select a request category.');

    if (!subject || subject.trim().length < 10) errors.push('Subject must be at least 10 characters.');
    if (subject.trim().length > 200) errors.push('Subject cannot exceed 200 characters.');

    if (!description || description.trim().length < 20) errors.push('Description must be at least 20 characters.');
    if (description.trim().length > 2000) errors.push('Description cannot exceed 2000 characters.');

    if (businessJustification && businessJustification.trim().length > 1000) {
      errors.push('Business justification cannot exceed 1000 characters.');
    }

    if (mode !== 'DRAFT') {
      if (requiresDepartmentApproval) {
        if (!requestCategory?.departmentId) errors.push('This category needs a department for routing.');
      } else {
        if (!selectedL1ApproverId) errors.push('Select a Level 1 approver.');
      }
    }

    if (attachments.length) {
      if (attachments.some((f) => f.size > MAX_FILE_SIZE)) errors.push('One or more files exceed the 10MB limit.');
      if (totalAttachmentSize > MAX_TOTAL_SIZE) errors.push('Total attachment size cannot exceed 50MB.');
      if (!pickFilesEnabled) errors.push('Attachments upload is not configured on this device.');
    }

    if (!confirmSubmission && mode !== 'DRAFT') {
      errors.push('Please confirm submission before sending for approval.');
    }

    return errors;
  };

  const submitWithMode = async (mode: SubmitMode) => {
    if (submitting) return;

    const errors = validateStepAndCollectErrors(mode);
    if (errors.length) {
      setError(errors[0]);
      return;
    }

    setError(null);
    setSubmitPhase(mode);

    try {
      const nowISO = new Date().toISOString();
      const requestId = await generateUniqueCode('GR-', 6);

      setSubmitStage('Uploading attachments…');
      const attachmentIds: string[] = [];

      if (attachments.length) {
        for (const file of attachments) {
          await withTimeout(
            FileSystem.getInfoAsync(file.uri) as any,
            15_000,
            `Checking file failed/timed out: ${file.name}. Please retry.`,
          );

          const created = await withTimeout(
            hrStorage.createFile({
              bucketId: HR_BUCKETS.GENERAL_REQUEST_ATTACHMENTS,
              fileId: ID.unique(),
              file: { uri: file.uri, name: file.name, type: file.mimeType, size: file.size },
            } as any),
            90_000,
            `Attachment upload timed out (${file.name}). Please retry on a stronger network.`,
          );

          attachmentIds.push((created as any).$id as string);
        }
      }

      const payload: any = {
        requestId,
        requestType: requestTypeCode,
        requestCategory: requestCategoryCode,
        requestPriority,
        subject: subject.trim(),
        description: description.trim(),
        businessJustification: businessJustification.trim() ? businessJustification.trim() : null,
        userId: String(user.$id),
        userName: user.name || user.email || 'Unknown User',
        status: mode === 'DRAFT' ? 'DRAFT' : 'PENDING',
        approvalStage: mode === 'DRAFT' ? null : requiresDepartmentApproval ? 'DEPARTMENT_REVIEW' : 'L1_APPROVAL',
        submissionDate: nowISO,
        attachmentIds: attachmentIds.length ? attachmentIds : [],
        isActive: true,
      };

      if (mode !== 'DRAFT') {
        if (requiresDepartmentApproval) {
          setSubmitStage('Resolving department head…');
          const deptHead = await resolveDepartmentHead(String(requestCategory?.departmentId));
          payload.departmentReviewerId = deptHead.managerId;
          payload.departmentReviewerName = deptHead.managerName;
          payload.departmentReviewDate = null;
          payload.departmentReviewComments = null;
        } else {
          const l1 = approvers.find((a) => String(a.userId) === String(selectedL1ApproverId));
          payload.l1ApproverId = selectedL1ApproverId;
          payload.l1ApproverName = l1?.approverName || l1?.name || l1?.userId || '';
          payload.l1ApprovalDate = null;
          payload.l1Comments = null;
        }
      }

      setSubmitStage('Creating request…');
      const created = await withTimeout(
        hrDatabases.createDocument(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, ID.unique(), payload as any),
        45_000,
        'Creating your request is taking too long. Please try again.',
      );

      if (mode !== 'DRAFT') {
        const nextStageLabel = requiresDepartmentApproval ? 'Department Review' : 'L1 Review';
        await notifySubmissionBestEffort({
          request: created,
          nextStageLabel,
          nextApproverUserId: requiresDepartmentApproval ? payload.departmentReviewerId : payload.l1ApproverId,
          requesterUserId: String(user.$id),
        });
      }

      setCompletedSubmitMode(mode);
      setSubmittedDocId((created as any)?.$id || null);
      setShowSubmittedModal(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to submit request');
    } finally {
      setSubmitPhase(null);
      setSubmitStage('');
    }
  };

  const goNext = () => {
    if (currentStep === 1) {
      if (!requestTypeCode.trim()) {
        setError('Select a request type.');
        return;
      }
      if (!requestCategoryCode.trim()) {
        setError('Select a category for this request type.');
        return;
      }
    }
    if (currentStep === 2) {
      if (!subject.trim() || subject.trim().length < 10) {
        setError('Subject must be at least 10 characters.');
        return;
      }
      if (subject.trim().length > 200) {
        setError('Subject cannot exceed 200 characters.');
        return;
      }
      if (!description.trim() || description.trim().length < 20) {
        setError('Description must be at least 20 characters.');
        return;
      }
      if (description.trim().length > 2000) {
        setError('Description cannot exceed 2000 characters.');
        return;
      }
      if (businessJustification && businessJustification.trim().length > 1000) {
        setError('Business justification cannot exceed 1000 characters.');
        return;
      }
    }
    if (currentStep === 3 && !requiresDepartmentApproval) {
      if (!l1ApproverChoices.length) {
        setError('No Level 1 approvers are configured.');
        return;
      }
      if (!selectedL1ApproverId) {
        setError('Select a Level 1 approver.');
        return;
      }
    }
    setError(null);
    setCurrentStep((s) => (s < GENERAL_REQUEST_WIZARD_STEPS ? ((s + 1) as any) : s));
  };

  const goBack = () => {
    setError(null);
    setCurrentStep((s) => (s > 1 ? ((s - 1) as any) : s));
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#054653" />
          <Text style={styles.loadingText}>Loading Requests…</Text>
        </View>
      </ThemedView>
    );
  }

  const attachmentWarning = !pickFilesEnabled ? 'Attachments upload is not configured on this device.' : null;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(16, insets.top + 12),
            paddingBottom: 16,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={createWizardStyles.headerCard}>
          <View style={createWizardStyles.headerRow}>
            <View style={createWizardStyles.iconWrap}>
              <MaterialCommunityIcons name="clipboard-plus-outline" size={22} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={createWizardStyles.headerTitle}>New General Request</Text>
              <Text style={createWizardStyles.headerSub}>{stepTitle}</Text>
            </View>
          </View>

          <View style={createWizardStyles.progressOuter}>
            <View style={[createWizardStyles.progressInner, { width: `${(currentStep / GENERAL_REQUEST_WIZARD_STEPS) * 100}%` }]} />
          </View>

          <View style={createWizardStyles.stepDotsRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <View key={s} style={[createWizardStyles.stepDot, s === currentStep ? createWizardStyles.stepDotActive : s < currentStep ? createWizardStyles.stepDotDone : null]}>
                <Text style={[createWizardStyles.stepDotText, s === currentStep ? createWizardStyles.stepDotTextActive : s < currentStep ? createWizardStyles.stepDotTextDone : null]}>
                  {s}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {error ? (
          <View style={createWizardStyles.errorBox}>
            <Text style={createWizardStyles.errorText}>{error}</Text>
          </View>
        ) : null}

        {currentStep === 1 ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
            <View style={createWizardStyles.card}>
              {!requestTypeCode ? (
                <>
                  <Text style={createWizardStyles.sectionTitle}>Select request type</Text>
                  {types.length ? (
                    <ScrollView style={createWizardStyles.selectListTall} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {types.map((t) => (
                        <Pressable
                          key={String(t.$id || t.typeCode)}
                          onPress={() => {
                            setRequestTypeCode(String(t.typeCode || ''));
                            setRequestCategoryCode('');
                            setSelectedL1ApproverId('');
                            setConfirmSubmission(false);
                          }}
                          style={({ pressed }) => [
                            createWizardStyles.selectItem,
                            pressed ? createWizardStyles.selectItemPressed : null,
                          ]}
                        >
                          <Text style={createWizardStyles.selectItemText}>
                            {t.typeName || t.name || String(t.typeCode || '')}
                          </Text>
                          <Text style={createWizardStyles.selectMeta}>{String(t.typeCode || '')}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={createWizardStyles.emptyText}>No request types found.</Text>
                  )}
                </>
              ) : !requestCategoryCode ? (
                <>
                  <View style={createWizardStyles.stepChoiceBanner}>
                    <MaterialCommunityIcons name="shape-outline" size={20} color="#054653" style={{ marginTop: 2 }} />
                    <View style={createWizardStyles.stepChoiceBannerTextCol}>
                      <Text style={createWizardStyles.stepChoiceBannerLabel}>Request type</Text>
                      <Text style={createWizardStyles.stepChoiceBannerValue} numberOfLines={2}>
                        {requestType?.typeName || requestType?.name || requestTypeCode}
                      </Text>
                    </View>
                    <Pressable onPress={clearGeneralRequestType} style={createWizardStyles.stepChangeBtn} hitSlop={8}>
                      <Text style={createWizardStyles.stepChangeBtnText}>Change</Text>
                    </Pressable>
                  </View>

                  <Text style={createWizardStyles.sectionTitle}>Select category</Text>
                  {filteredCategories.length ? (
                    <ScrollView style={createWizardStyles.selectListTall} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filteredCategories.map((c) => (
                        <Pressable
                          key={String(c.$id || c.categoryCode)}
                          onPress={() => {
                            setRequestCategoryCode(String(c.categoryCode || ''));
                            setSelectedL1ApproverId('');
                            setConfirmSubmission(false);
                          }}
                          style={({ pressed }) => [createWizardStyles.selectItem, pressed ? createWizardStyles.selectItemPressed : null]}
                        >
                          <Text style={createWizardStyles.selectItemText}>
                            {c.categoryName || c.name || String(c.categoryCode || '')}
                          </Text>
                          <Text style={createWizardStyles.selectMeta}>
                            {c.requiresDepartmentApproval ? 'Department approval' : 'Direct (L1)'}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : (
                    <Text style={createWizardStyles.emptyText}>No categories for this type.</Text>
                  )}
                </>
              ) : (
                <>
                  <View style={createWizardStyles.stepChoiceBanner}>
                    <MaterialCommunityIcons name="shape-outline" size={20} color="#054653" style={{ marginTop: 2 }} />
                    <View style={createWizardStyles.stepChoiceBannerTextCol}>
                      <Text style={createWizardStyles.stepChoiceBannerLabel}>Request type</Text>
                      <Text style={createWizardStyles.stepChoiceBannerValue} numberOfLines={2}>
                        {requestType?.typeName || requestType?.name || requestTypeCode}
                      </Text>
                    </View>
                    <Pressable onPress={clearGeneralRequestType} style={createWizardStyles.stepChangeBtn} hitSlop={8}>
                      <Text style={createWizardStyles.stepChangeBtnText}>Change</Text>
                    </Pressable>
                  </View>

                  <View style={[createWizardStyles.stepChoiceBanner, { marginTop: 4 }]}>
                    <MaterialCommunityIcons name="folder-outline" size={20} color="#054653" style={{ marginTop: 2 }} />
                    <View style={createWizardStyles.stepChoiceBannerTextCol}>
                      <Text style={createWizardStyles.stepChoiceBannerLabel}>Category</Text>
                      <Text style={createWizardStyles.stepChoiceBannerValue} numberOfLines={2}>
                        {requestCategory?.categoryName || requestCategory?.name || requestCategoryCode}
                      </Text>
                    </View>
                    <Pressable onPress={clearGeneralRequestCategory} style={createWizardStyles.stepChangeBtn} hitSlop={8}>
                      <Text style={createWizardStyles.stepChangeBtnText}>Change</Text>
                    </Pressable>
                  </View>

                  <Text style={[createWizardStyles.sectionTitle, { marginTop: 6 }]}>Priority</Text>
                  <View style={createWizardStyles.chipsRow}>
                    {PRIORITIES.map((p) => {
                      const active = requestPriority === p;
                      return (
                        <Pressable key={p} onPress={() => setRequestPriority(p)} style={[createWizardStyles.chip, active && createWizardStyles.chipActive]}>
                          <Text style={[createWizardStyles.chipText, active && createWizardStyles.chipTextActive]}>{p}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {requestCategory?.requiresDepartmentApproval ? (
                    <View style={[createWizardStyles.warningBox, { marginTop: 12 }]}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#92400e" />
                      <Text style={createWizardStyles.warningText}>This category goes to the department head first (Department Review).</Text>
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        ) : null}

        {currentStep === 2 ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
            <View style={createWizardStyles.card}>
              <Text style={createWizardStyles.sectionTitle}>Request Subject</Text>
              <TextInput
                value={subject}
                onChangeText={setSubject}
                style={createWizardStyles.input}
                placeholder="Enter a clear subject (min 10 characters)"
              />

              <Text style={createWizardStyles.sectionTitle}>Detailed Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                style={[createWizardStyles.input, createWizardStyles.textarea]}
                placeholder="Provide detailed information (min 20 characters)"
                multiline
              />

              <Text style={createWizardStyles.sectionTitle}>Business Justification (optional)</Text>
              <TextInput
                value={businessJustification}
                onChangeText={setBusinessJustification}
                style={[createWizardStyles.input, createWizardStyles.textareaSmall]}
                placeholder="Add context (max 1000 characters)"
                multiline
              />
            </View>
          </KeyboardAvoidingView>
        ) : null}

        {currentStep === 3 ? (
          <View style={createWizardStyles.card}>
            <Text style={createWizardStyles.sectionTitle}>Level 1 approver</Text>
            <Text style={createWizardStyles.stepSubcopy}>
              {requiresDepartmentApproval
                ? 'This category routes to your department head first. Level 1 is assigned after department review—tap Next to continue.'
                : 'Choose who should receive this request first.'}
            </Text>

            {!requiresDepartmentApproval ? (
              l1ApproverChoices.length ? (
                <ScrollView style={createWizardStyles.selectListTall} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {l1ApproverChoices.map((a) => {
                    const active = String(a.userId) === String(selectedL1ApproverId);
                    return (
                      <Pressable
                        key={String(a.$id || a.userId)}
                        onPress={() => setSelectedL1ApproverId(String(a.userId))}
                        style={({ pressed }) => [
                          createWizardStyles.selectItem,
                          active && createWizardStyles.selectItemActive,
                          pressed ? createWizardStyles.selectItemPressed : null,
                        ]}
                      >
                        <Text style={[createWizardStyles.selectItemText, active && createWizardStyles.selectItemTextActive]}>
                          {a.approverName || a.name || a.userId || 'Approver'}
                        </Text>
                        <Text style={createWizardStyles.selectMeta}>{a.approverEmail || ''}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={createWizardStyles.emptyText}>No L1 approvers found. Setup required.</Text>
              )
            ) : (
              <View style={[createWizardStyles.warningBox, { marginTop: 12 }]}>
                <MaterialCommunityIcons name="account-group-outline" size={18} color="#054653" />
                <Text style={createWizardStyles.warningText}>
                  Department review runs first; the app will set departmentReviewerId from your category. You do not pick an L1 approver on this screen.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {currentStep === 4 ? (
          <View style={createWizardStyles.card}>
            <Text style={createWizardStyles.sectionTitle}>Upload Attachments (Optional)</Text>

            {attachmentWarning ? (
              <View style={createWizardStyles.warningBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#92400e" />
                <Text style={createWizardStyles.warningText}>{attachmentWarning}</Text>
              </View>
            ) : null}

            <Pressable onPress={pickFiles} disabled={!pickFilesEnabled} style={[createWizardStyles.uploadArea, !pickFilesEnabled && { opacity: 0.6 }]}>
              <MaterialCommunityIcons name="folder-upload-outline" size={22} color="#054653" />
              <Text style={createWizardStyles.uploadTitle}>Tap to choose files</Text>
              <Text style={createWizardStyles.uploadSub}>PDF, Word, Excel, images, and text (max 10MB each)</Text>
            </Pressable>

            {attachments.length ? (
              <View style={{ marginTop: 12 }}>
                <Text style={createWizardStyles.helperText}>
                  Attached: {attachments.length} • Total: {Math.round(totalAttachmentSize / (1024 * 1024) * 10) / 10}MB
                </Text>
                <View style={{ marginTop: 10, gap: 8 }}>
                  {attachments.map((f) => (
                    <View key={f.id} style={createWizardStyles.attachmentRow}>
                      <View style={createWizardStyles.attachmentLeft}>
                        <MaterialCommunityIcons name="paperclip" size={16} color="#054653" />
                        <View>
                          <Text style={createWizardStyles.attachmentName} numberOfLines={1}>
                            {f.name}
                          </Text>
                          <Text style={createWizardStyles.attachmentMeta}>
                            {f.mimeType} • {Math.round(f.size / 1024)}KB
                          </Text>
                        </View>
                      </View>
                      <Pressable onPress={() => removeAttachment(f.id)} style={createWizardStyles.attachmentRemove}>
                        <MaterialCommunityIcons name="trash-can-outline" size={18} color="#b91c1c" />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={createWizardStyles.emptyText}>(No files selected)</Text>
            )}
          </View>
        ) : null}

        {currentStep === 5 ? (
          <View style={createWizardStyles.card}>
            <Text style={createWizardStyles.sectionTitle}>Review</Text>

            <View style={createWizardStyles.summaryRow}>
              <View style={{ flex: 1 }}>
                <Text style={createWizardStyles.summaryLabel}>Type</Text>
                <Text style={createWizardStyles.summaryValue}>{requestType?.typeName || requestType?.name || requestTypeCode || '—'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={createWizardStyles.summaryLabel}>Category</Text>
                <Text style={createWizardStyles.summaryValue}>{requestCategory?.categoryName || requestCategoryCode || '—'}</Text>
              </View>
            </View>

            <View style={createWizardStyles.summaryRow}>
              <View style={{ flex: 1 }}>
                <Text style={createWizardStyles.summaryLabel}>Priority</Text>
                <Text style={createWizardStyles.summaryValue}>{requestPriority}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={createWizardStyles.summaryLabel}>Level 1</Text>
                <Text style={createWizardStyles.summaryValue}>
                  {requiresDepartmentApproval
                    ? 'Set after department review'
                    : (() => {
                        const a = l1ApproverChoices.find((x) => String(x.userId) === String(selectedL1ApproverId));
                        return a ? String(a.approverName || a.name || a.userId || '—') : '—';
                      })()}
                </Text>
              </View>
            </View>

            <View style={{ marginBottom: 10 }}>
              <Text style={createWizardStyles.summaryLabel}>Attachments</Text>
              <Text style={createWizardStyles.summaryValue}>
                {attachments.length ? `${attachments.length} file${attachments.length === 1 ? '' : 's'}` : 'None'}
              </Text>
            </View>

            <View style={createWizardStyles.summaryCard}>
              <Text style={createWizardStyles.summaryLabel}>Subject</Text>
              <Text style={createWizardStyles.summaryBody}>{subject || '—'}</Text>
              <Text style={createWizardStyles.summaryLabel} >Description</Text>
              <Text style={createWizardStyles.summaryBody}>{description ? description.slice(0, 140) + (description.length > 140 ? '…' : '') : '—'}</Text>
            </View>

            <View style={createWizardStyles.reviewActionsSection}>
              <Text style={createWizardStyles.reviewActionsHeading}>Finish up</Text>
              <Text style={createWizardStyles.reviewActionsSub}>
                Save a draft to continue later, or send the request into the approval workflow.
              </Text>

              <Pressable
                onPress={() => submitWithMode('DRAFT')}
                disabled={submitting}
                style={({ pressed }) => [
                  createWizardStyles.reviewActionCard,
                  createWizardStyles.reviewActionCardDraft,
                  pressed && createWizardStyles.reviewActionCardPressed,
                  submitting && submitPhase !== 'DRAFT' && createWizardStyles.reviewActionCardInactive,
                ]}
              >
                <View style={[createWizardStyles.reviewActionIconWrap, createWizardStyles.reviewActionIconWrapDraft]}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#1f2937" />
                </View>
                <View style={createWizardStyles.reviewActionTextCol}>
                  <Text style={createWizardStyles.reviewActionTitle}>Save as draft</Text>
                  <Text style={createWizardStyles.reviewActionSubtitle}>Keep editing from your requests list anytime.</Text>
                </View>
                {submitPhase === 'DRAFT' ? (
                  <ActivityIndicator color="#054653" />
                ) : (
                  <MaterialCommunityIcons name="chevron-right" size={22} color="#9ca3af" />
                )}
              </Pressable>

              <View style={createWizardStyles.reviewDividerWrap}>
                <View style={createWizardStyles.reviewDividerLine} />
                <Text style={createWizardStyles.reviewDividerText}>or submit</Text>
                <View style={createWizardStyles.reviewDividerLine} />
              </View>

              <Pressable
                onPress={() => setConfirmSubmission((v) => !v)}
                disabled={submitting}
                style={[createWizardStyles.confirmPanel, !confirmSubmission && createWizardStyles.confirmPanelMuted]}
              >
                <MaterialCommunityIcons
                  name={confirmSubmission ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                  size={24}
                  color={confirmSubmission ? '#054653' : '#9ca3af'}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      createWizardStyles.confirmPanelTitle,
                      !confirmSubmission && createWizardStyles.confirmPanelTitleMuted,
                    ]}
                  >
                    Confirmation required
                  </Text>
                  <Text style={createWizardStyles.confirmPanelBody}>
                    I confirm this information is accurate and complete before sending for approval.
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => submitWithMode('PENDING')}
                disabled={submitting}
                style={({ pressed }) => [
                  createWizardStyles.reviewActionCardSubmitSlim,
                  pressed && createWizardStyles.reviewActionCardPressed,
                  submitting && submitPhase !== 'PENDING' && createWizardStyles.reviewActionCardInactive,
                  !confirmSubmission && createWizardStyles.reviewActionCardSubmitDimmed,
                ]}
              >
                <View style={createWizardStyles.reviewActionTextCol}>
                  <Text style={[createWizardStyles.reviewActionTitle, createWizardStyles.reviewActionTitleOnPrimary]}>Submit for approval</Text>
                  {submitPhase === 'PENDING' && submitStage ? (
                    <Text
                      style={[createWizardStyles.reviewActionSubtitle, createWizardStyles.reviewActionSubtitleOnPrimary]}
                      numberOfLines={2}
                    >
                      {submitStage}
                    </Text>
                  ) : submitForApprovalApproverLine ? (
                    <Text
                      style={[createWizardStyles.reviewActionApproverName, createWizardStyles.reviewActionApproverNameOnPrimary]}
                      numberOfLines={1}
                    >
                      {submitForApprovalApproverLine}
                    </Text>
                  ) : null}
                </View>
                {submitPhase === 'PENDING' ? <ActivityIndicator color="#ffffff" style={{ marginLeft: 8 }} /> : null}
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[createWizardStyles.wizardFooter, { marginBottom: hrBottomNavReserve, flexShrink: 0 }]}>
        <View style={createWizardStyles.navRow}>
          <View style={{ flex: 1 }}>
            {currentStep > 1 ? (
              <Pressable onPress={goBack} style={[createWizardStyles.navBtn, createWizardStyles.navBtnOutline]}>
                <Text style={[createWizardStyles.navBtnText, createWizardStyles.navBtnTextOutline]} numberOfLines={1}>
                  Back:{' '}
                  {currentStep === 2
                    ? 'Request Type'
                    : currentStep === 3
                      ? 'Request Details'
                      : currentStep === 4
                        ? 'Approver'
                        : 'Attachments'}
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={onCancel} style={[createWizardStyles.navBtn, createWizardStyles.navBtnOutline]}>
                <Text style={[createWizardStyles.navBtnText, createWizardStyles.navBtnTextOutline]}>Cancel</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flex: 1 }}>
            {currentStep < GENERAL_REQUEST_WIZARD_STEPS ? (
              <Pressable onPress={goNext} style={createWizardStyles.navBtn}>
                <Text style={createWizardStyles.navBtnText}>Next</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <Modal visible={showSubmittedModal} transparent animationType="fade" onRequestClose={() => setShowSubmittedModal(false)}>
        <View style={createWizardStyles.submittedBackdrop}>
          <View style={createWizardStyles.submittedCard}>
            <View
              style={[
                createWizardStyles.submittedIconWrap,
                completedSubmitMode === 'DRAFT'
                  ? createWizardStyles.submittedIconWrapDraft
                  : createWizardStyles.submittedIconWrapSubmit,
              ]}
            >
              <MaterialCommunityIcons
                name={completedSubmitMode === 'DRAFT' ? 'content-save-check-outline' : 'check-decagram'}
                size={24}
                color={completedSubmitMode === 'DRAFT' ? '#047857' : '#054653'}
              />
            </View>
            <Text style={createWizardStyles.submittedTitle}>
              {completedSubmitMode === 'DRAFT' ? 'Draft saved' : 'Submitted successfully'}
            </Text>
            <Text style={createWizardStyles.submittedSub}>
              {completedSubmitMode === 'DRAFT' ? 'Draft saved.' : 'Your request has been submitted for approval.'}
            </Text>

            <View style={createWizardStyles.submittedActions}>
            {submittedDocId ? (
              <Pressable
                onPress={downloadSubmittedRequest}
                style={[createWizardStyles.submittedBtn, createWizardStyles.submittedBtnGradient]}
              >
                <LinearGradient
                  colors={['#054653', '#0e706d', '#FFB803']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={createWizardStyles.submittedBtnGradientInner}
                >
                  <Text style={createWizardStyles.submittedBtnTextPrimary}>Download Request</Text>
                </LinearGradient>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => {
                setShowSubmittedModal(false);
                router.replace('/hr/requests' as any);
              }}
              style={[createWizardStyles.submittedBtn, createWizardStyles.submittedBtnOutline]}
            >
              <Text style={createWizardStyles.submittedBtnTextOutline}>Back to Requests</Text>
            </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <HrBottomNav />
    </ThemedView>
  );
}

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
  const [editCategoryDoc, setEditCategoryDoc] = useState<any | null>(null);
  const [editL1Approvers, setEditL1Approvers] = useState<any[]>([]);
  const [editL1ApproverId, setEditL1ApproverId] = useState('');
  const [loadingEditMeta, setLoadingEditMeta] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEditCategoryDoc(null);
      setEditL1Approvers([]);
      setEditL1ApproverId('');
      if (!request || !user?.$id) return;
      const st = String(request.status || '').toUpperCase();
      if (st !== 'DRAFT' && st !== 'REJECTED') return;
      const catCode = String(request.requestCategory || '').trim();
      if (!catCode) return;
      setLoadingEditMeta(true);
      try {
        const cat = await fetchGeneralRequestCategoryByCode(catCode);
        if (cancelled) return;
        setEditCategoryDoc(cat);
        setEditL1ApproverId(String(request.l1ApproverId || ''));
        if (cat && !cat.requiresDepartmentApproval) {
          const list = await loadGeneralRequestL1Approvers(String(user.$id));
          if (cancelled) return;
          setEditL1Approvers(list);
        }
      } catch {
        if (!cancelled) setEditCategoryDoc(null);
      } finally {
        if (!cancelled) setLoadingEditMeta(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request?.$id, request?.status, request?.requestCategory, request?.l1ApproverId, user?.$id]);

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
        userName: user.name || user.email || 'Unknown User',
      };

      if (submissionMode === 'DRAFT') {
        updateData.status = 'DRAFT';
        updateData.approvalStage = null;
        updateData.departmentReviewDate = null;
        updateData.departmentReviewComments = null;
        updateData.l1ApprovalDate = null;
        updateData.l1Comments = null;
        updateData.l2ApprovalDate = null;
        updateData.l2Comments = null;
        updateData.submissionDate = null;

        await hrDatabases.updateDocument(
          HR_DB_ID,
          HR_COLLECTIONS.GENERAL_REQUESTS,
          String(editId),
          updateData,
        );
        Alert.alert('Saved', 'Changes saved as draft.');
        router.replace('/hr/requests');
        return;
      }

      const statusUpper = String(request.status || '').toUpperCase();
      const isInitialSubmit = statusUpper === 'DRAFT' || statusUpper === 'REJECTED';

      if (isInitialSubmit) {
        let cat = editCategoryDoc;
        if (!cat && request.requestCategory) {
          cat = await fetchGeneralRequestCategoryByCode(String(request.requestCategory));
        }
        if (!cat) {
          throw new Error('Could not load this request’s category. Check your configuration and try again.');
        }

        const requiresDept = !!cat.requiresDepartmentApproval;
        if (requiresDept && !cat.departmentId) {
          throw new Error('This category requires department approval but has no department assigned.');
        }

        updateData.status = 'PENDING';
        updateData.submissionDate = now;

        if (requiresDept) {
          const deptHead = await resolveDepartmentHead(String(cat.departmentId));
          updateData.approvalStage = 'DEPARTMENT_REVIEW';
          updateData.departmentReviewerId = deptHead.managerId;
          updateData.departmentReviewerName = deptHead.managerName;
          updateData.departmentReviewDate = null;
          updateData.departmentReviewComments = null;
          updateData.l1ApprovalDate = null;
          updateData.l1Comments = null;
          updateData.l2ApprovalDate = null;
          updateData.l2Comments = null;
        } else {
          const l1Id = String(request.l1ApproverId || editL1ApproverId || '').trim();
          if (!l1Id) {
            throw new Error('Select a Level 1 approver before submitting.');
          }
          const l1DocResolved = editL1Approvers.find((a) => String(a.userId) === l1Id);
          updateData.approvalStage = 'L1_APPROVAL';
          updateData.l1ApproverId = l1Id;
          updateData.l1ApproverName =
            l1DocResolved?.approverName || l1DocResolved?.name || request.l1ApproverName || String(l1Id);
          updateData.l1ApprovalDate = null;
          updateData.l1Comments = null;
          updateData.l2ApprovalDate = null;
          updateData.l2Comments = null;
        }

        await hrDatabases.updateDocument(
          HR_DB_ID,
          HR_COLLECTIONS.GENERAL_REQUESTS,
          String(editId),
          updateData,
        );

        const requiresDeptResolved = !!cat.requiresDepartmentApproval && !!cat.departmentId;
        const nextStageLabel = requiresDeptResolved ? 'Department Review' : 'L1 Review';
        const nextUid = requiresDeptResolved ? updateData.departmentReviewerId : updateData.l1ApproverId;
        await notifySubmissionBestEffort({
          request: { ...request, ...updateData },
          nextStageLabel,
          nextApproverUserId: nextUid ? String(nextUid) : null,
          requesterUserId: String(user.$id),
        });

        Alert.alert('Saved', 'Submitted for approval.');
        router.replace('/hr/requests');
        return;
      }

      if (!stageUpper) {
        throw new Error('This pending request has no approval stage to resubmit.');
      }

      updateData.status = 'PENDING';
      updateData.approvalStage = stageUpper;
      updateData.submissionDate = now;

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

      await hrDatabases.updateDocument(
        HR_DB_ID,
        HR_COLLECTIONS.GENERAL_REQUESTS,
        String(editId),
        updateData,
      );

      Alert.alert('Saved', 'Submitted for approval.');
      router.replace('/hr/requests');
    } catch (e: any) {
      setError(e?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }, [
    editable,
    editCategoryDoc,
    editId,
    editL1ApproverId,
    editL1Approvers,
    form,
    request,
    requestApprovalStageUpper,
    router,
    submissionMode,
    user,
    validate,
  ]);

  if (isCreateMode) {
    if (isLoading || !user) return null;
    return <HrRequestCreateWizard user={user} onCancel={() => router.back()} />;
  }

  // Edit mode
  if (isLoading || !user) return null;

  const hrEditBottomReserve = Math.max(insets.bottom, 10) + 100;

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(16, insets.top + 12),
            paddingBottom: hrEditBottomReserve,
          },
        ]}
        keyboardShouldPersistTaps="handled"
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
              <Text style={styles.sub} numberOfLines={3}>
                {requestStatusUpper === 'DRAFT' || requestStatusUpper === 'REJECTED'
                  ? 'Drafts match the web: keep as draft or submit for approval (category sets department-first vs Level 1).'
                  : 'Update details and save. For pending requests, Submit re-opens the current approval stage.'}
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

            {requestStatusUpper === 'DRAFT' || requestStatusUpper === 'REJECTED' ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Approval routing</Text>
                {loadingEditMeta ? (
                  <View style={styles.loadingBox}>
                    <ActivityIndicator color="#054653" />
                    <Text style={styles.loadingText}>Loading category…</Text>
                  </View>
                ) : editCategoryDoc?.requiresDepartmentApproval ? (
                  <Text style={styles.helperText}>
                    This category goes to your department head first (like the web). You do not pick Level 1 here.
                  </Text>
                ) : editL1Approvers.length ? (
                  <>
                    <Text style={styles.helperText}>Pick who receives the request for Level 1 approval.</Text>
                    <Text style={styles.label}>Level 1 approver *</Text>
                    <ScrollView style={styles.editApproverList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {editL1Approvers.map((a) => {
                        const active = String(a.userId) === String(editL1ApproverId);
                        return (
                          <Pressable
                            key={String(a.$id || a.userId)}
                            onPress={() => setEditL1ApproverId(String(a.userId))}
                            disabled={!editable}
                            style={({ pressed }) => [
                              styles.editApproverItem,
                              active && styles.editApproverItemActive,
                              pressed && { opacity: 0.85 },
                              !editable && { opacity: 0.6 },
                            ]}
                          >
                            <Text style={[styles.editApproverItemText, active && styles.editApproverItemTextActive]}>
                              {a.approverName || a.name || a.userId || 'Approver'}
                            </Text>
                            <Text style={styles.editApproverMeta}>{a.approverEmail || ''}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : (
                  <Text style={styles.errorInline}>No Level 1 approvers configured.</Text>
                )}
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>What happens next?</Text>
              <Text style={styles.helperText}>
                {requestStatusUpper === 'PENDING'
                  ? 'Submit for Approval re-opens your current stage (same idea as the web editor).'
                  : 'Choose Submit for Approval to send the draft in, or Keep as Draft to save without submitting.'}
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

  editApproverList: {
    maxHeight: 280,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    padding: 8,
  },
  editApproverItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  editApproverItemActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  editApproverItemText: { color: '#111827', fontSize: 13, fontWeight: '800' },
  editApproverItemTextActive: { color: '#054653' },
  editApproverMeta: { marginTop: 2, color: '#6b7280', fontSize: 11, fontWeight: '600' },

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

const createWizardStyles = StyleSheet.create({
  wizardFooter: {
    paddingHorizontal: 20,
    paddingTop: 4,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e5e7eb',
  },
  headerCard: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 16,
    backgroundColor: '#FFB803',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#054653', fontSize: 16, fontWeight: '900' },
  headerSub: { marginTop: 3, color: '#6b7280', fontSize: 12, fontWeight: '700' },

  progressOuter: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressInner: { height: 8, borderRadius: 999, backgroundColor: '#054653' },

  stepDotsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  stepDotDone: { borderColor: '#047857', backgroundColor: '#ecfdf5' },
  stepDotText: { color: '#64748b', fontSize: 11, fontWeight: '900' },
  stepDotTextActive: { color: '#054653' },
  stepDotTextDone: { color: '#047857' },

  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: '#b91c1c', fontSize: 12, fontWeight: '800', textAlign: 'center' },

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
    marginBottom: 14,
  },

  sectionTitle: { color: '#054653', fontSize: 13, fontWeight: '900', marginBottom: 10 },
  stepSubcopy: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 14,
    marginTop: -4,
  },

  selectList: { maxHeight: 260, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', padding: 6 },
  /** Taller list when it is the only picker on screen (type or category step). */
  selectListTall: { maxHeight: 340, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', padding: 6 },
  stepChoiceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  stepChoiceBannerTextCol: { flex: 1, minWidth: 0 },
  stepChoiceBannerLabel: { color: '#6b7280', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  stepChoiceBannerValue: { marginTop: 4, color: '#111827', fontSize: 14, fontWeight: '800' },
  stepChangeBtn: { alignSelf: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  stepChangeBtnText: { color: '#054653', fontSize: 12, fontWeight: '900' },
  selectItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
  },
  selectItemPressed: { opacity: 0.85 },
  selectItemActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  selectItemText: { color: '#111827', fontSize: 13, fontWeight: '800' },
  selectItemTextActive: { color: '#054653' },
  selectMeta: { marginTop: 2, color: '#6b7280', fontSize: 11, fontWeight: '700' },
  emptyText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },

  warningBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFB803',
    backgroundColor: '#fff7ed',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  warningText: { color: '#92400e', fontSize: 12, fontWeight: '800', flex: 1 },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { borderColor: '#054653', backgroundColor: '#e6f4f2' },
  chipText: { color: '#6b7280', fontSize: 12, fontWeight: '900' },
  chipTextActive: { color: '#054653' },

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
  textarea: { minHeight: 120, textAlignVertical: 'top' as any, paddingVertical: 10 },
  textareaSmall: { minHeight: 80, textAlignVertical: 'top' as any, paddingVertical: 10 },

  uploadArea: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  uploadTitle: { color: '#054653', fontSize: 13, fontWeight: '900' },
  uploadSub: { color: '#6b7280', fontSize: 12, fontWeight: '700', textAlign: 'center' },

  helperText: { color: '#6b7280', fontSize: 12, fontWeight: '700' },

  attachmentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  attachmentLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  attachmentName: { color: '#111827', fontSize: 12, fontWeight: '900', flex: 1 },
  attachmentMeta: { color: '#6b7280', fontSize: 11, fontWeight: '700', marginTop: 1 },
  attachmentRemove: { paddingHorizontal: 6, paddingVertical: 6 },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  summaryLabel: { color: '#6b7280', fontSize: 11, fontWeight: '800' },
  summaryValue: { marginTop: 3, color: '#111827', fontSize: 13, fontWeight: '900' },

  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    padding: 12,
  },
  summaryBody: { color: '#111827', fontSize: 12, fontWeight: '700', marginTop: 6, lineHeight: 18 },

  reviewActionsSection: {
    marginTop: 18,
    gap: 14,
  },
  reviewActionsHeading: {
    color: '#054653',
    fontSize: 15,
    fontWeight: '900',
  },
  reviewActionsSub: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: -6,
  },
  reviewActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 76,
  },
  reviewActionCardDraft: {
    borderColor: '#e5e7eb',
    backgroundColor: '#fafafa',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  reviewActionCardSubmit: {
    borderColor: '#043d47',
    backgroundColor: '#054653',
    shadowColor: '#054653',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  /** Submit CTA: must stay defined—JSX depends on this (teal bar + padding). */
  reviewActionCardSubmitSlim: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#043d47',
    backgroundColor: '#054653',
    shadowColor: '#054653',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
    minHeight: 52,
  },
  reviewActionCardPressed: {
    opacity: 0.92,
  },
  reviewActionCardInactive: {
    opacity: 0.45,
  },
  reviewActionCardSubmitDimmed: {
    opacity: 0.72,
  },
  reviewActionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewActionIconWrapDraft: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  reviewActionIconWrapSubmit: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  reviewActionTextCol: {
    flex: 1,
    minWidth: 0,
  },
  reviewActionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  reviewActionTitleOnPrimary: {
    color: '#ffffff',
  },
  reviewActionSubtitle: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  reviewActionSubtitleOnPrimary: {
    color: 'rgba(255,255,255,0.9)',
  },
  reviewActionApproverName: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  reviewActionApproverNameOnPrimary: {
    color: 'rgba(255,255,255,0.92)',
  },
  reviewDividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
  },
  reviewDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#e5e7eb',
  },
  reviewDividerText: {
    color: '#9ca3af',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  confirmPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bfe3dc',
    backgroundColor: '#ecfdf7',
  },
  confirmPanelMuted: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  confirmPanelTitle: {
    color: '#054653',
    fontSize: 13,
    fontWeight: '900',
  },
  confirmPanelTitleMuted: {
    color: '#6b7280',
  },
  confirmPanelBody: {
    marginTop: 4,
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },

  navRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 8 },
  navBtn: {
    borderRadius: 16,
    backgroundColor: '#054653',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnOutline: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  navBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  navBtnTextOutline: { color: '#054653', fontSize: 12, fontWeight: '900' },

  submittedBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  submittedCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  submittedIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  submittedIconWrapDraft: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  submittedIconWrapSubmit: {
    backgroundColor: '#e6f4f2',
    borderWidth: 1,
    borderColor: '#bfe3dc',
  },
  submittedTitle: { marginTop: 12, color: '#054653', fontSize: 16, fontWeight: '900', textAlign: 'center' },
  submittedSub: { marginTop: 6, color: '#6b7280', fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 18 },
  submittedActions: { marginTop: 14, gap: 10 },
  submittedBtn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  submittedBtnPrimary: { backgroundColor: '#054653' },
  submittedBtnTextPrimary: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  submittedBtnGradient: { backgroundColor: 'transparent', overflow: 'hidden' },
  submittedBtnGradientInner: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submittedBtnOutline: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb' },
  submittedBtnTextOutline: { color: '#054653', fontSize: 12, fontWeight: '900' },
});