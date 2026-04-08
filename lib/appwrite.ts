import { Client, Account, Databases, Teams, Storage, Query, ID, Permission, Role } from 'react-native-appwrite';

const env = (key: string) => (process.env as any)?.[key] as string | undefined;

// Appwrite endpoint (shared default)
const ENDPOINT = env('EXPO_PUBLIC_APPWRITE_ENDPOINT') || env('NEXT_PUBLIC_APPWRITE_ENDPOINT') || 'https://appwrite.nrep.ug/v1';

// HR system project + database (from NREP-HR-project/lib/appwrite/config.js)
const HR_PROJECT_ID = '66bcc8450005201fa1af';
export const HR_DB_ID = '66bcc8760033a24883f6';
export const HR_PROJECTS_DB_ID = '66c1c3fd0009bf44dfd9';

// PMS system project + database (from your message / PMS config)
const PMS_ENDPOINT = env('EXPO_PUBLIC_PMS_APPWRITE_ENDPOINT') || ENDPOINT;
const PMS_PROJECT_ID = env('EXPO_PUBLIC_PMS_APPWRITE_PROJECT_ID') || '68fb4ea70020a38ffa68';
export const PMS_DB_ID = env('EXPO_PUBLIC_PMS_APPWRITE_DATABASE_ID') || '68fb5845001d32f31656';

// Separate clients so HR and PMS can use different Appwrite projects
const hrClient = new Client().setEndpoint(ENDPOINT).setProject(HR_PROJECT_ID);
const pmsClient = new Client().setEndpoint(PMS_ENDPOINT).setProject(PMS_PROJECT_ID);

export const hrAccount = new Account(hrClient);
export const hrDatabases = new Databases(hrClient);
export const hrStorage = new Storage(hrClient);
export const pmsAccount = new Account(pmsClient);

export const pmsDatabases = new Databases(pmsClient);
export const pmsTeams = new Teams(pmsClient);

export { Query, ID, Permission, Role };

// PMS collections – mirrored from NREP-PROJECT-MGT/lib/appwriteClient.js
export const PMS_COLLECTIONS = {
  ORGANIZATIONS: 'pms_organizations',
  USERS: 'pms_users',
  CLIENTS: 'pms_clients',
  PROJECTS: 'pms_projects',
  MILESTONES: 'pms_milestones',
  TASKS: 'pms_tasks',
  TASK_ASSIGNMENTS: 'pms_task_assignments',
  TASK_COMMENTS: 'pms_task_comments',
  TIMESHEETS: 'pms_timesheets',
  TIMESHEET_ENTRIES: 'pms_timesheet_entries',
  DOCUMENTS: 'pms_documents',
  DOCUMENT_VERSIONS: 'pms_document_versions',
  EMBEDS: 'pms_embeds',
  FX_RATES: 'pms_fx_rates',
  PROJECT_COMPONENTS: 'pms_project_components',
} as const;

// HR collections – mirrored from NREP-HR-project/lib/appwrite/config.js
export const HR_COLLECTIONS = {
  USERS: '67d49f580038214148e6',
  ROLES: '67d4a44d000cbcb17cf2',
  DEPARTMENTS: '67d4a1a3002e61b2cc1a',
  TRAVEL_REQUESTS: '68512598003a84bdd4ef',
  TRAVEL_REQUEST_ATTACHMENTS: '6843fd2e00035fd47aa6',
  TRAVEL_REQUEST_APPROVERS: '6849e567002ae9dd7cbb',
  GENERAL_REQUESTS: '68b1e6780035a206618f',
  // NOTE: these IDs are provided via .env in the web repo; on mobile we read them from env too.
  // Prefer EXPO_PUBLIC_* in future, but keep NEXT_PUBLIC_* for compatibility with existing env files.
  GENERAL_REQUEST_APPROVERS:
    (process.env as any)?.EXPO_PUBLIC_GENERAL_REQUEST_APPROVERS_COLLECTION_ID ||
    (process.env as any)?.NEXT_PUBLIC_GENERAL_REQUEST_APPROVERS_COLLECTION_ID ||
    '',
  GENERAL_REQUEST_CATEGORIES:
    (process.env as any)?.EXPO_PUBLIC_GENERAL_REQUEST_CATEGORIES_COLLECTION_ID ||
    (process.env as any)?.NEXT_PUBLIC_GENERAL_REQUEST_CATEGORIES_COLLECTION_ID ||
    '',
  GENERAL_REQUEST_TYPES:
    (process.env as any)?.EXPO_PUBLIC_GENERAL_REQUEST_TYPES_COLLECTION_ID ||
    (process.env as any)?.NEXT_PUBLIC_GENERAL_REQUEST_TYPES_COLLECTION_ID ||
    '',
  GENERAL_REQUEST_AUDIT_LOGS:
    (process.env as any)?.EXPO_PUBLIC_GENERAL_REQUEST_AUDIT_LOGS_COLLECTION_ID ||
    (process.env as any)?.NEXT_PUBLIC_GENERAL_REQUEST_AUDIT_LOGS_COLLECTION_ID ||
    '',
  TIMESHEETS: '68d3e76d003e6111eeaa',
} as const;

export const HR_PROJECTS_COLLECTIONS = {
  PROJECTS: '66c1c53a000f8ef8ac71',
} as const;

export const HR_BUCKETS = {
  TRAVEL_ATTACHMENTS: '67e0415e002bfc51380a',
  GENERAL_REQUEST_ATTACHMENTS:
    (process.env as any)?.EXPO_PUBLIC_GENERAL_REQUEST_ATTACHMENTS_BUCKET_ID ||
    (process.env as any)?.NEXT_PUBLIC_GENERAL_REQUEST_ATTACHMENTS_BUCKET_ID ||
    '',
} as const;