import * as FileSystem from 'expo-file-system';
import { Query, ID } from 'react-native-appwrite';

import {
  HR_BUCKETS,
  HR_COLLECTIONS,
  HR_DB_ID,
  HR_PROJECTS_COLLECTIONS,
  HR_PROJECTS_DB_ID,
  hrDatabases,
  hrStorage,
} from '@/lib/appwrite';

export type HrProject = { $id: string; name?: string | null; projectID?: string | null };
export type HrApprover = { userId: string; name: string; department?: string | null };

export type LocalAttachment = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

export type UploadedAttachment = {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentId: string;
  fileUrl: string;
};

export type TravelRequestDoc = any & {
  $id: string;
  requestId: string;
  userId: string;
  status?: string;
  expenseBreakdown?: any;
  bankDetails?: any;
  attachments?: any;
};

export async function generateUniqueCode(prefix: string, length: number) {
  try {
    const response = await fetchWithTimeout(
      'https://alx.derrickml.com/api/codegen/generate-code',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, length }),
      },
      8000,
    );
    if (!response.ok) throw new Error(`Codegen failed (${response.status})`);
    const data = await response.json();
    if (!data?.code) throw new Error('Invalid codegen response');
    return String(data.code);
  } catch (e: any) {
    // Fallback: still allow submissions when codegen service is down.
    const fallback = generateLocalCode(prefix, length);
    console.warn('Codegen unavailable, using fallback requestId:', fallback, e?.message || e);
    return fallback;
  }
}

export async function getTravelRequestByRequestId(requestId: string): Promise<TravelRequestDoc> {
  const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
    Query.equal('requestId', requestId),
    Query.limit(1),
  ]);
  const doc = (res as any)?.documents?.[0];
  if (!doc) throw new Error('Travel request not found');
  return normalizeTravelRequest(doc);
}

export async function updateTravelRequest(params: {
  documentId: string;
  formData: {
    paymentType: 'advance' | 'reimbursement';
    activityName: string;
    projectName: string;
    projectId: string;
    l1ApproverId: string;
    travelType: string;
    origin: string;
    destination: string;
    dateTimeFrom: string;
    dateTimeTo: string;
    currency: string;
    expenseBreakdown: any[];
    totalAmount: number;
    paymentMethod: 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';
    bankDetails: any | null;
    mobileNumber: string;
    hasBankDetailsOnFile: boolean;
    comments: string;
  };
  requestId: string;
  userId: string;
  existingUploads: UploadedAttachment[];
  newAttachments: LocalAttachment[];
}) {
  const uploads: UploadedAttachment[] = [...(params.existingUploads || [])];
  const newFiles = params.newAttachments || [];
  if (newFiles.length) {
    // Upload attachments with limited concurrency + timeout so "edit submit" can’t hang forever.
    const uploaded = await mapWithConcurrency(newFiles, 2, async (file) => {
      return await withTimeout(
        uploadTravelAttachment(file, params.requestId, params.userId),
        90_000,
        `Attachment upload timed out (${file.name}). Please retry on a stronger network.`,
      );
    });
    uploads.push(...uploaded);
  }

  const updateData = {
    paymentType: params.formData.paymentType,
    activityName: params.formData.activityName,
    projectName: params.formData.projectName || null,
    projectId: params.formData.projectId || null,
    l1ApproverId: params.formData.l1ApproverId,
    travelType: params.formData.travelType,
    origin: params.formData.origin,
    destination: params.formData.destination,
    dateTimeFrom: params.formData.dateTimeFrom,
    dateTimeTo: params.formData.dateTimeTo,
    currency: params.formData.currency,
    totalAmount: params.formData.totalAmount,
    expenseBreakdown: JSON.stringify(params.formData.expenseBreakdown || []),
    paymentMethod: params.formData.paymentMethod,
    bankDetails: params.formData.bankDetails ? JSON.stringify(params.formData.bankDetails) : null,
    mobileNumber: params.formData.mobileNumber || null,
    hasBankDetailsOnFile: params.formData.hasBankDetailsOnFile || false,
    attachments: uploads.length ? JSON.stringify(uploads) : null,
    comments: params.formData.comments || null,
    // Reset approval status and clear approval data when editing (same as web)
    status: 'pending',
    l1ApprovalDate: null,
    l2ApprovalDate: null,
    l1Comments: null,
    l2Comments: null,
    l2ApproverId: null,
    rejectionReason: null,
    rejectedBy: null,
    rejectionDate: null,
  };

  const updated = await withTimeout(
    hrDatabases.updateDocument(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, params.documentId, updateData),
    30_000,
    'Saving your edits is taking too long. Please check your internet and try again.',
  );

  return { document: normalizeTravelRequest(updated), uploads };
}

export async function listProjects(): Promise<HrProject[]> {
  const res = await hrDatabases.listDocuments(HR_PROJECTS_DB_ID, HR_PROJECTS_COLLECTIONS.PROJECTS, [
    Query.orderAsc('name'),
    Query.limit(200),
  ]);
  return ((res as any)?.documents ?? []) as HrProject[];
}

export async function listL1Approvers(currentUserId?: string | null): Promise<HrApprover[]> {
  const approverDocs = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUEST_APPROVERS, [
    Query.equal('level', 'L1'),
    Query.equal('isActive', true),
    Query.limit(200),
  ]);
  const approvers = ((approverDocs as any)?.documents ?? []) as any[];

  const uniqueUserIds = Array.from(
    new Set(
      approvers
        .map((a) => a.userId)
        .filter(Boolean)
        .filter((id) => (currentUserId ? id !== currentUserId : true)),
    ),
  );

  const users = await Promise.all(
    uniqueUserIds.map(async (uid) => {
      try {
        const userRes = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.USERS, [
          Query.equal('userId', uid),
          Query.limit(1),
        ]);
        const userDoc = (userRes as any)?.documents?.[0];
        return {
          userId: uid,
          name: userDoc?.name || `User ${uid}`,
          department: userDoc?.departmentName || null,
        } as HrApprover;
      } catch {
        return { userId: uid, name: `User ${uid}`, department: null } as HrApprover;
      }
    }),
  );

  users.sort((a, b) => a.name.localeCompare(b.name));
  return users;
}

export async function uploadTravelAttachment(
  file: LocalAttachment,
  requestId: string,
  uploadedByUserId: string,
): Promise<UploadedAttachment> {
  // Ensure the file exists (DocumentPicker may return content:// on Android; expo-file-system can still read it)
  const info = await withTimeout(
    FileSystem.getInfoAsync(file.uri),
    15_000,
    `Checking file failed/timed out: ${file.name}. Please re-pick the file and try again.`,
  );
  if (!info.exists) throw new Error(`File not found: ${file.name}`);

  let created: any;
  try {
    created = await withTimeout(
      hrStorage.createFile({
        bucketId: HR_BUCKETS.TRAVEL_ATTACHMENTS,
        fileId: ID.unique(),
        file: {
          uri: file.uri,
          name: file.name,
          type: file.mimeType,
          size: file.size,
        },
      }),
      90_000,
      `Attachment upload timed out (${file.name}). Please retry on a stronger network.`,
    );
  } catch (e: any) {
    throw new Error(`Attachment upload failed (${file.name}): ${e?.message || 'Network request failed'}`);
  }

  const fileId = (created as any)?.$id as string;
  const fileUrl = hrStorage.getFileViewURL(HR_BUCKETS.TRAVEL_ATTACHMENTS, fileId).toString();

  let attachmentDoc: any;
  try {
    attachmentDoc = await withTimeout(
      hrDatabases.createDocument(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUEST_ATTACHMENTS, ID.unique(), {
        requestId,
        fileUrl,
        fileName: file.name,
        fileId,
        fileSize: file.size,
        mimeType: file.mimeType,
        uploadDate: new Date().toISOString(),
        uploadedBy: uploadedByUserId,
      }),
      30_000,
      `Saving attachment record timed out (${file.name}). Please retry.`,
    );
  } catch (e: any) {
    throw new Error(`Attachment record save failed (${file.name}): ${e?.message || 'Network request failed'}`);
  }

  return {
    fileId,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.mimeType,
    documentId: (attachmentDoc as any).$id,
    fileUrl,
  };
}

export async function createTravelRequest(params: {
  userId: string;
  userName: string;
  paymentType: 'advance' | 'reimbursement';
  activityName: string;
  projectName: string;
  projectId: string;
  l1ApproverId: string;
  travelType: string;
  origin: string;
  destination: string;
  dateTimeFrom: string;
  dateTimeTo: string;
  currency: string;
  expenseBreakdown: {
    id: string;
    purpose: string;
    description?: string;
    quantity: number;
    unitCost: number;
    subtotal: number;
  }[];
  totalAmount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'mobile_money' | 'cheque';
  hasBankDetailsOnFile: boolean;
  bankDetails: null | { accountNumber: string; bankName: string; branch: string; swiftCode?: string };
  mobileNumber: string;
  comments: string;
  attachments: LocalAttachment[];
}) {
  let requestId: string;
  try {
    requestId = await generateUniqueCode('TR-', 6);
  } catch (e: any) {
    throw new Error(e?.message || 'Failed at request ID generation');
  }

  const uploads: UploadedAttachment[] = [];
  try {
    for (const file of params.attachments) {
      uploads.push(await uploadTravelAttachment(file, requestId, params.userId));
    }
  } catch (e: any) {
    // bubble up with stage info
    throw new Error(e?.message || 'Failed while uploading attachments');
  }

  const documentData = {
    requestId,
    userId: params.userId,
    userName: params.userName,
    status: 'pending',
    paymentType: params.paymentType,
    activityName: params.activityName,
    projectName: params.projectName || null,
    projectId: params.projectId || null,
    l1ApproverId: params.l1ApproverId,
    travelType: params.travelType,
    origin: params.origin,
    destination: params.destination,
    dateTimeFrom: params.dateTimeFrom,
    dateTimeTo: params.dateTimeTo,
    currency: params.currency,
    totalAmount: params.totalAmount,
    expenseBreakdown: JSON.stringify(params.expenseBreakdown || []),
    paymentMethod: params.paymentMethod,
    bankDetails: params.bankDetails ? JSON.stringify(params.bankDetails) : null,
    mobileNumber: params.mobileNumber || null,
    hasBankDetailsOnFile: params.hasBankDetailsOnFile || false,
    attachments: uploads.length > 0 ? JSON.stringify(uploads) : null,
    comments: params.comments || null,
    submissionDate: new Date().toISOString(),
  };

  let createdDoc: any;
  try {
    createdDoc = await hrDatabases.createDocument(
      HR_DB_ID,
      HR_COLLECTIONS.TRAVEL_REQUESTS,
      ID.unique(),
      documentData,
    );
  } catch (e: any) {
    throw new Error(`Request submission failed: ${e?.message || 'Network request failed'}`);
  }

  // Email notifications (best-effort) — mirror web behavior.
  // If email service is unavailable, request submission should still succeed.
  try {
    await notifyOnCreate({
      requestId,
      requesterUserId: params.userId,
      l1ApproverUserId: params.l1ApproverId,
    });
  } catch (e) {
    console.warn('Email notification failed:', e);
  }

  return { requestId, document: createdDoc, uploads };
}

function generateLocalCode(prefix: string, length: number) {
  const max = Math.pow(10, length);
  const n = (Date.now() % max) + Math.floor(Math.random() * 1000);
  const digits = String(n % max).padStart(length, '0');
  return `${prefix}${digits}`;
}

function normalizeTravelRequest(doc: any): TravelRequestDoc {
  return {
    ...doc,
    expenseBreakdown: safeJsonParse(doc.expenseBreakdown, []),
    bankDetails: safeJsonParse(doc.bankDetails, null),
    attachments: safeJsonParse(doc.attachments, []),
  };
}

function safeJsonParse(v: any, fallback: any) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return fallback;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

async function getUserEmailByUserId(userId: string) {
  const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.USERS, [
    Query.equal('userId', userId),
    Query.limit(1),
  ]);
  const doc = (res as any)?.documents?.[0];
  if (!doc?.email) return null;
  return {
    name: doc?.name || 'User',
    email: doc.email as string,
    otherEmail: (doc.otherEmail as string) || null,
  };
}

async function sendEmail(payload: { subject: string; text: string; email: string; cc?: string | null }) {
  const res = await fetchWithTimeout(
    'https://alx.derrickml.com/api/general/send-email',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    8000,
  );
  if (!res.ok) {
    throw new Error(`Email API failed (${res.status})`);
  }
}

async function notifyOnCreate(params: { requestId: string; requesterUserId: string; l1ApproverUserId: string }) {
  const [approver, requester] = await Promise.all([
    params.l1ApproverUserId ? getUserEmailByUserId(params.l1ApproverUserId) : Promise.resolve(null),
    getUserEmailByUserId(params.requesterUserId),
  ]);

  if (approver?.email) {
    await sendEmail({
      subject: 'New Travel Request Pending Approval',
      text:
        `Dear ${approver.name},\n\n` +
        `A new travel request has been submitted and is pending your approval.\n\n` +
        `Request ID: ${params.requestId}\n\n` +
        `Regards,\nHR Travel Management System`,
      email: approver.email,
      cc: approver.otherEmail,
    });
  }

  if (requester?.email) {
    await sendEmail({
      subject: 'Travel Request Submitted',
      text:
        `Dear ${requester.name},\n\n` +
        `Your travel request has been submitted successfully and is pending Level 1 approval.\n\n` +
        `Request ID: ${params.requestId}\n\n` +
        `Regards,\nHR Travel Management System`,
      email: requester.email,
      cc: requester.otherEmail,
    });
  }
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // @ts-ignore - RN fetch supports signal in modern runtimes
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

function withTimeout<T>(p: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let t: any;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const runners = new Array(Math.max(1, Math.min(concurrency, items.length))).fill(null).map(async () => {
    while (true) {
      const idx = nextIndex++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}
