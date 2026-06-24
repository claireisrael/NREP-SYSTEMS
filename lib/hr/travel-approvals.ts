import { HR_COLLECTIONS, HR_DB_ID, hrDatabases, Query } from '@/lib/appwrite';
import {
  getPrimaryWorkflowUserId,
  getWorkflowUserIds,
  normalizeUserId,
  userMatchesRecord,
} from '@/lib/general-request-approvals';

export type TravelApproverRoles = {
  isL1: boolean;
  isL2: boolean;
  isFinanceDept: boolean;
  canShowApprovalsTab: boolean;
  canShowFinanceQueue: boolean;
};

export function getFinanceDeptId(): string {
  return String(
    (process.env as any)?.EXPO_PUBLIC_FINANCE_DEPARTMENT_ID ||
      (process.env as any)?.NEXT_PUBLIC_FINANCE_DEPARTMENT_ID ||
      '',
  );
}

/** Web parity: finance tab is finance department only (not senior manager by role). */
export function isFinanceDeptUser(user: any): boolean {
  const financeDeptId = getFinanceDeptId();
  return !!financeDeptId && String(user?.departmentId || '') === financeDeptId;
}

/** Web travel-requests/page.js checkUserRoles */
export async function loadTravelApproverRoles(user: any): Promise<TravelApproverRoles> {
  const workflowIds = new Set(getWorkflowUserIds(user).map(normalizeUserId));
  let isL1 = false;
  let isL2 = false;

  try {
    const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUEST_APPROVERS, [
      Query.equal('isActive', true),
      Query.limit(200),
    ]);
    const docs = ((res as any)?.documents ?? []) as any[];
    const matchLevel = (level: string) =>
      docs.some(
        (a) =>
          workflowIds.has(normalizeUserId(a.userId)) &&
          String(a.level || '').toUpperCase() === level &&
          a.isActive !== false,
      );
    isL1 = matchLevel('L1');
    isL2 = matchLevel('L2');
  } catch {
    // ignore — user simply has no approver roles
  }

  const isFinanceDept = isFinanceDeptUser(user);
  return {
    isL1,
    isL2,
    isFinanceDept,
    canShowApprovalsTab: isL1 || isL2,
    canShowFinanceQueue: isFinanceDept,
  };
}

async function listTravelByField(
  field: string,
  user: any,
  extraQueries: any[] = [],
  limit = 50,
): Promise<any[]> {
  const ids = getWorkflowUserIds(user);
  if (!ids.length) return [];

  const responses = await Promise.all(
    ids.map((id) =>
      hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
        Query.equal(field, id),
        ...extraQueries,
        Query.orderDesc('submissionDate'),
        Query.limit(limit),
      ]),
    ),
  );

  const merged = new Map<string, any>();
  for (const res of responses) {
    for (const doc of ((res as any)?.documents ?? []) as any[]) {
      merged.set(String(doc.$id), doc);
    }
  }
  return Array.from(merged.values());
}

/** Web getPendingApprovalsForUserPaged L1 */
export async function loadPendingTravelL1(user: any): Promise<any[]> {
  const docs = await listTravelByField('l1ApproverId', user, [Query.equal('status', 'pending')]);
  return docs.map((d) => ({ ...d, __approvalStage: 'l1' as const }));
}

/** Web getPendingApprovalsForUserPaged L2 */
export async function loadPendingTravelL2(user: any): Promise<any[]> {
  const docs = await listTravelByField('l2ApproverId', user, [Query.equal('status', 'l1_approved')]);
  return docs.map((d) => ({ ...d, __approvalStage: 'l2' as const }));
}

/** Web getFinanceApprovedRequestsPaged — status l2_approved */
export async function loadPendingTravelFinance(): Promise<any[]> {
  const res = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.TRAVEL_REQUESTS, [
    Query.equal('status', 'l2_approved'),
    Query.orderDesc('l2ApprovalDate'),
    Query.limit(100),
  ]);
  return (((res as any)?.documents ?? []) as any[]).map((d) => ({
    ...d,
    __approvalStage: 'finance' as const,
  }));
}

export function travelStatusMatchesStage(
  travelRequest: any,
  stage: 'l1' | 'l2' | 'finance',
): boolean {
  const status = String(travelRequest?.status || '').toLowerCase();
  if (stage === 'l1') return status === 'pending';
  if (stage === 'l2') return status === 'l1_approved';
  return status === 'l2_approved';
}

/**
 * Web ApprovalList submits without re-checking canUserApproveRequest.
 * If the item is already in the user's pending queue, allow submit.
 */
export function canSubmitTravelApproval(
  user: any,
  travelRequest: any,
  stage: 'l1' | 'l2' | 'finance',
): boolean {
  if (!user || !travelRequest) return false;
  if (!travelStatusMatchesStage(travelRequest, stage)) return false;

  const queuedStage = String(travelRequest?.__approvalStage || '').toLowerCase();
  if (queuedStage && queuedStage === stage) return true;

  const level = stage === 'l1' ? 'L1' : stage === 'l2' ? 'L2' : 'finance';
  return canUserApproveTravelRequest(user, travelRequest, level);
}

export async function loadMyTravelRequests(user: any, limit = 50): Promise<any[]> {
  return listTravelByField('userId', user, [], limit);
}

/**
 * Web travel-requests.js canUserApproveRequest.
 * ApprovalList always shows Approve/Reject for items already in the pending queue.
 */
export function canUserApproveTravelRequest(
  user: any,
  travelRequest: any,
  level: 'L1' | 'L2' | 'finance',
): boolean {
  if (!user || !travelRequest) return false;

  const status = String(travelRequest.status || '').toLowerCase();
  if (level === 'L1') {
    if (userMatchesRecord(user, travelRequest.userId)) return false;
    return userMatchesRecord(user, travelRequest.l1ApproverId) && status === 'pending';
  }
  if (level === 'L2') {
    // Web pending list allows assigned L2 even on own request (ApprovalList has no self block).
    return userMatchesRecord(user, travelRequest.l2ApproverId) && status === 'l1_approved';
  }
  return isFinanceDeptUser(user) && status === 'l2_approved';
}
