import { HR_COLLECTIONS, HR_DB_ID, hrDatabases, Query } from '@/lib/appwrite';

export function getFinanceDeptId(): string {
  return String(
    (process.env as any)?.EXPO_PUBLIC_FINANCE_DEPARTMENT_ID ||
      (process.env as any)?.NEXT_PUBLIC_FINANCE_DEPARTMENT_ID ||
      '',
  );
}

export function normalizeUserId(id: unknown): string {
  return String(id || '').trim().toLowerCase();
}

export function getUserAuthId(user: any): string {
  return normalizeUserId(user?.userId || user?.$id);
}

/** Web uses user.userId (auth id) first — same order as simplified-approval-workflow.js */
export function getWorkflowUserIds(user: any): string[] {
  const raw = [user?.userId, user?.$id, user?.staffDocId]
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of raw) {
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export function getPrimaryWorkflowUserId(user: any): string {
  return getWorkflowUserIds(user)[0] || '';
}

/**
 * Appwrite allows only one Query.or per request. Never combine queryForUserIdField
 * with another Query.or — use listGeneralRequestsByField instead.
 */
export function queryForUserIdField(field: string, user: any) {
  const id = getPrimaryWorkflowUserId(user);
  return Query.equal(field, id || '');
}

/** Match auth id and any alternate ids stored on the user profile. */
export function userMatchesRecord(user: any, recordUserId: unknown): boolean {
  const target = normalizeUserId(recordUserId);
  if (!target || !user) return false;

  const candidates = [user?.$id, user?.userId, user?.staffDocId]
    .map(normalizeUserId)
    .filter(Boolean);

  return candidates.includes(target);
}

export function isSeniorManager(user: any): boolean {
  return String(user?.systemRole || '').toLowerCase() === 'senior manager';
}

export function isFinanceDeptUser(user: any, financeDeptId = getFinanceDeptId()): boolean {
  return !!financeDeptId && String(user?.departmentId || '') === financeDeptId;
}

/** Finance completion queue — web getPendingApprovalsForUser includes Senior Managers. */
export function isFinanceQueueUser(user: any, financeDeptId = getFinanceDeptId()): boolean {
  return isFinanceDeptUser(user, financeDeptId) || isSeniorManager(user);
}

export function isFinanceUser(user: any, financeDeptId = getFinanceDeptId()): boolean {
  return (
    isFinanceDeptUser(user, financeDeptId) ||
    String(user?.departmentName || '').toLowerCase().includes('finance') ||
    String(user?.systemRole || '').toLowerCase().includes('finance') ||
    isSeniorManager(user)
  );
}

export type ApprovalQueue = 'department' | 'l1' | 'l2' | 'finance';

export type UserApprovalRoles = {
  isDeptManager: boolean;
  isL1: boolean;
  isL2: boolean;
  isFinanceDept: boolean;
  isFinanceQueue: boolean;
  canShowApprovalsTab: boolean;
  canLoadApprovals: boolean;
};

/** Mirrors web general-requests/page.js role checks after approvers are loaded. */
export function getUserApprovalRoles(
  user: any,
  approvers: any[] = [],
  isHeadofDepartment = false,
): UserApprovalRoles {
  const workflowId = getPrimaryWorkflowUserId(user);
  const matchApprover = (level: string) =>
    !!workflowId &&
    approvers.some(
      (a) =>
        normalizeUserId(a.userId) === normalizeUserId(workflowId) &&
        String(a.level || '').toUpperCase() === level,
    );

  const isDeptManager = isHeadofDepartment === true;
  const isL1 = matchApprover('L1');
  const isL2 = matchApprover('L2');
  const isFinanceDept = isFinanceDeptUser(user);
  const isFinanceQueue = isFinanceQueueUser(user);

  const canShowApprovalsTab = isDeptManager || isL1 || isL2 || isFinanceDept;
  const canLoadApprovals = canShowApprovalsTab || isFinanceQueue;

  return {
    isDeptManager,
    isL1,
    isL2,
    isFinanceDept,
    isFinanceQueue,
    canShowApprovalsTab,
    canLoadApprovals,
  };
}

async function listGeneralRequestsByField(
  field: string,
  user: any,
  extraQueries: any[] = [],
  limit = 100,
): Promise<any[]> {
  const ids = getWorkflowUserIds(user);
  if (!ids.length) return [];

  const responses = await Promise.all(
    ids.map((id) =>
      hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
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

function filterActiveFinanceDocs(docs: any[]): any[] {
  return docs.filter((d) => {
    const status = String(d?.status || '').toUpperCase();
    const stage = String(d?.approvalStage || d?.currentStage || '').toUpperCase();
    const financeRequired = d?.financeRequired === true;
    const isFinanceStage = stage === 'FINANCE_COMPLETION' || (stage === 'PROCESSING' && financeRequired);
    const isDone =
      status === 'APPROVED' ||
      status === 'COMPLETED' ||
      stage === 'COMPLETED' ||
      stage === 'COMPLETION';
    return isFinanceStage && !isDone;
  });
}

/** Web parity: simplified-approval-workflow.js getPendingApprovalsForUser */
export async function loadPendingGeneralRequestApprovals(
  user: any,
  roles: UserApprovalRoles,
): Promise<any[]> {
  const [dept, l1, l2, financePrimary, financeLegacy] = await Promise.all([
    roles.isDeptManager
      ? listGeneralRequestsByField('departmentReviewerId', user, [
          Query.equal('approvalStage', 'DEPARTMENT_REVIEW'),
        ])
      : Promise.resolve([]),
    roles.isL1
      ? listGeneralRequestsByField('l1ApproverId', user, [
          Query.equal('approvalStage', 'L1_APPROVAL'),
        ])
      : Promise.resolve([]),
    roles.isL2
      ? listGeneralRequestsByField('l2ApproverId', user, [
          Query.or([
            Query.equal('approvalStage', 'L2_APPROVAL'),
            Query.equal('status', 'L1_APPROVED'),
          ]),
        ])
      : Promise.resolve([]),
    roles.isFinanceQueue
      ? hrDatabases
          .listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
            Query.equal('approvalStage', 'FINANCE_COMPLETION'),
            Query.orderDesc('submissionDate'),
            Query.limit(200),
          ])
          .then((res) => ((res as any)?.documents ?? []) as any[])
      : Promise.resolve([]),
    roles.isFinanceQueue
      ? hrDatabases
          .listDocuments(HR_DB_ID, HR_COLLECTIONS.GENERAL_REQUESTS, [
            Query.or([
              Query.equal('currentStage', 'PROCESSING'),
              Query.equal('financeRequired', true),
            ]),
            Query.orderDesc('submissionDate'),
            Query.limit(200),
          ])
          .then((res) => ((res as any)?.documents ?? []) as any[])
      : Promise.resolve([]),
  ]);

  const financeDocsRaw = filterActiveFinanceDocs([...financePrimary, ...financeLegacy]);
  const financeMap = new Map<string, any>();
  financeDocsRaw.forEach((d) => financeMap.set(String(d.$id), d));

  return [
    ...dept.map((d) => ({ ...d, __queue: 'department' as const })),
    ...l1.map((d) => ({ ...d, __queue: 'l1' as const })),
    ...l2.map((d) => ({ ...d, __queue: 'l2' as const })),
    ...Array.from(financeMap.values()).map((d) => ({ ...d, __queue: 'finance' as const })),
  ].sort((a, b) => {
    const ad = new Date(a.submissionDate || a.$createdAt || 0).getTime();
    const bd = new Date(b.submissionDate || b.$createdAt || 0).getTime();
    return bd - ad;
  });
}

export async function loadGlobalApprovers(): Promise<any[]> {
  if (!HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS) return [];
  try {
    const res = await hrDatabases.listDocuments(
      HR_DB_ID,
      HR_COLLECTIONS.GENERAL_REQUEST_APPROVERS as any,
      [Query.equal('isActive', true), Query.orderAsc('approverName'), Query.limit(200)],
    );
    return ((res as any)?.documents ?? []) as any[];
  } catch {
    return [];
  }
}

/**
 * Web parity: general-requests/approvals/page.js canApproveRequest.
 * SimplifiedApprovalCard always shows Approve/Reject for queued items — no extra UI gate.
 */
export function canApproveRequestWeb(request: any, user: any): boolean {
  if (!request || !user) return false;

  const me = normalizeUserId(getPrimaryWorkflowUserId(user));
  if (!me) return false;

  const requesterId = normalizeUserId(request.userId);
  const stage = String(request.approvalStage || request.currentStage || '').toUpperCase();

  if (stage === 'DEPARTMENT_REVIEW') {
    return normalizeUserId(request.departmentReviewerId) === me && requesterId !== me;
  }
  if (stage === 'L1_APPROVAL') {
    return normalizeUserId(request.l1ApproverId) === me && requesterId !== me;
  }
  if (stage === 'L2_APPROVAL') {
    return normalizeUserId(request.l2ApproverId) === me;
  }
  if (stage === 'FINANCE_COMPLETION' || (stage === 'PROCESSING' && request.financeRequired === true)) {
    return isFinanceQueueUser(user);
  }
  if (String(request.status || '').toUpperCase() === 'L1_APPROVED' && request.l2ApproverId) {
    return normalizeUserId(request.l2ApproverId) === me;
  }
  return false;
}

/** @deprecated use canApproveRequestWeb */
export function canApproveGeneralRequest(request: any, user: any): boolean {
  return canApproveRequestWeb(request, user);
}

/** Queued items from role-specific queries — always show actions (web card behaviour). */
export function shouldShowQueuedApprovalActions(request: any): boolean {
  return !!String(request?.__queue || '').trim();
}

/** Validate before submit — uses web rules. */
export function canActOnQueuedApproval(
  request: any,
  user: any,
  queue: ApprovalQueue | string,
): boolean {
  if (!request || !user) return false;
  const q = String(queue || request?.__queue || '').toLowerCase() as ApprovalQueue;
  if (!q) return canApproveRequestWeb(request, user);

  if (q === 'department' || q === 'l1' || q === 'l2' || q === 'finance') {
    return canApproveRequestWeb({ ...request, approvalStage: queueToStage(q) }, user);
  }
  return canApproveRequestWeb(request, user);
}

function queueToStage(queue: ApprovalQueue): string {
  if (queue === 'department') return 'DEPARTMENT_REVIEW';
  if (queue === 'l1') return 'L1_APPROVAL';
  if (queue === 'l2') return 'L2_APPROVAL';
  return 'FINANCE_COMPLETION';
}
