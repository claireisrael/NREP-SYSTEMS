import { Client, Account, Databases, Teams, Query, ID, Permission, Role } from 'react-native-appwrite';

// Appwrite endpoint (same for both systems)
const ENDPOINT = 'https://appwrite.nrep.ug/v1';

// HR system project + database (from NREP-HR-project/lib/appwrite/config.js)
const HR_PROJECT_ID = '66bcc8450005201fa1af';
export const HR_DB_ID = '66bcc8760033a24883f6';

// PMS system project + database (from your message / PMS config)
const PMS_PROJECT_ID = '68fb4ea70020a38ffa68';
export const PMS_DB_ID = '68fb5845001d32f31656';

// Separate clients so HR and PMS can use different Appwrite projects
const hrClient = new Client().setEndpoint(ENDPOINT).setProject(HR_PROJECT_ID);
const pmsClient = new Client().setEndpoint(ENDPOINT).setProject(PMS_PROJECT_ID);

export const hrAccount = new Account(hrClient);
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

