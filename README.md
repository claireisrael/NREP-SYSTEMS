## NREP Mobile App – System Documentation

This document describes the **NREP Mobile App** implementation in the `mobile` folder of this repository.  
The app provides mobile access to:

- The **Projects Management System (PMS)** – projects, tasks, timesheets, approvals.  
- The **HR System** – travel/general requests, approvals, staff directory, profile.

It reuses the same **Appwrite backend, collections, and auth** as the existing NREP web systems.

---

## Table of Contents

1. System Overview  
2. Architecture  
3. User Roles & Permissions  
4. Features  
5. Setup & Configuration  
6. API & Data Access  
7. User Guides  
8. Database Schema (Key Collections)  
9. Technical Specifications  
10. Troubleshooting  

---

## 1. System Overview

The **NREP Mobile App** is a unified mobile client for NREP’s existing HR and PMS web systems.  
It focuses on the **daily workflows that make sense on mobile**:

- Checking and browsing projects
- Viewing and managing tasks
- Viewing timesheets and approvals
- Submitting and tracking HR requests
- Reviewing approvals (for managers)

Heavy admin/configuration features remain on the web systems.

### Key Capabilities (Mobile)

- **Single mobile entry point** for both HR and PMS.
- **Role‑aware UI** for Staff, Supervisors/Managers, and Admins.
- **Projects dashboard**:
  - My/Team projects list.
  - Project detail pages showing code, status, budget, timeline, and tasks.
- **Tasks module**:
  - My Tasks / All Tasks (for managers/admins).
  - Filters by status, quick search, and per‑project task views.
- **Timesheets & Approvals (PMS)**:
  - Staff see their own timesheets.
  - Managers/Admins see approvals.
- **HR flows**:
  - Travel & general requests, approvals, directory, profile (summarised).

---

## 2. Architecture

### Technology Stack

- **Framework**: React Native (Expo)
- **Routing**: `expo-router` (file‑based routing)
- **Backend**: Appwrite (same instance as web HR/PMS)
- **Database**: Appwrite Database (NoSQL collections)
- **Auth**: Appwrite Email/Password + labels and team relationships
- **Language**: TypeScript
- **State / Context**: `AuthContext` for PMS user + roles

### Project Structure (mobile)

```text
mobile/
├── app/
│   ├── _layout.tsx              # Root stack: wraps tabs, modals, AuthProvider
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tabs layout
│   │   └── index.tsx            # Landing: choose HR vs PMS
│   ├── pms/
│   │   ├── index.tsx            # PMS login
│   │   ├── home.tsx             # PMS home dashboard (projects + upcoming tasks)
│   │   ├── tasks.tsx            # Global tasks list (My Tasks / All Tasks)
│   │   ├── timesheets.tsx       # Timesheets (summary)
│   │   ├── approvals.tsx        # Timesheet approvals (managers/admins)
│   │   ├── profile.tsx          # PMS profile view
│   │   ├── projects.tsx         # (Optional) Projects list screen
│   │   └── projects/[id].tsx    # Project detail + Tasks tab
│   ├── hr/
│   │   ├── index.tsx            # HR login
│   │   ├── home.tsx             # HR home dashboard
│   │   ├── requests/*           # Travel / general requests
│   │   ├── approvals/*          # HR approvals
│   │   ├── directory.tsx        # Staff directory
│   │   └── profile.tsx          # HR profile
│   └── modal.tsx                # Optional modal route
│
├── components/
│   ├── PmsBottomNav.tsx         # PMS bottom navigation
│   ├── themed-view.tsx          # Themed View wrapper
│   └── themed-text.tsx          # Themed Text wrapper
│
├── context/
│   └── AuthContext.tsx          # PMS auth + roles + organization
│
├── lib/
│   └── appwrite.ts              # Appwrite clients, DB IDs, PMS_COLLECTIONS
│
├── app.json                     # Expo config
└── .env                         # Environment (Appwrite endpoints, IDs)
```

### Navigation Flow

- `app/_layout.tsx`:
  - Wraps the app in:
    - React Navigation theme provider
    - `AuthProvider`
    - `Stack` routes: `(tabs)`, `modal`, `pms` (header hidden)
- Landing screen (`(tabs)/index.tsx`):
  - Animated welcome.
  - Cards for **HR** and **Projects (PMS)**.
- PMS:
  - After login: `/pms/home`.
  - Bottom nav via `PmsBottomNav`:
    - `Home`, `Tasks`, `Timesheets`, `Approvals` (managers/admins), `Profile`.
- HR:
  - After login: `/hr/home` and HR‑specific navigation.

---

## 3. User Roles & Permissions

Roles are loaded from Appwrite user labels and user relationships in `AuthContext`.

### PMS Roles

**Administrator**
- Sees **Team Projects** on PMS Home.
- Can toggle **My Tasks / All Tasks**.
- Has access to **Timesheets** and **Approvals**.

**Supervisor / Manager**
- Similar to Admin for PMS scope but limited to their organization/team.
- Sees **Team Projects**.
- Sees **My Tasks / All Tasks**.
- Can approve team timesheets.

**Regular Staff**
- Sees **My Projects** on PMS Home.
- Sees only **My Tasks** in the Tasks module.
- Sees own **Timesheets**.
- Does **not** see Approvals.

### HR Roles (Summary)

**HR Admin / HR Approver**
- Access to HR home, all HR requests, approvals and staff directory.

**Manager / Supervisor**
- HR home shows **My Approvals**.
- Can approve HR requests for their staff.

**Staff**
- Can submit HR requests and view their request history.
- Can browse directory and view/edit limited profile data.

---

## 4. Features

### 4.1 PMS – Home (`/pms/home`)

- Greeting card:
  - `Good Morning, {Name}!`
  - Role label (Administrator / Supervisor / Regular Staff)
  - Current date.

- **Projects section**:
  - Title: **My Projects** (staff) or **Team Projects** (managers/admins).
  - Search input: filter by project and client.
  - Status chips: **All**, **Planned**, **Active**, **On Hold**, **Completed**, **Cancelled**.
  - Each card shows:
    - Code badge (e.g. `PRJ/25/001`)
    - Status pill
    - Project name
    - Client block (label + client name)
    - Timeline: `startDate - endDate`
    - Budget: `budgetAmount` formatted in `budgetCurrency`
  - Tap a card → open `/pms/projects/[id]` (Project Detail).

- **Upcoming Tasks** (staff only):
  - “Upcoming Tasks” header.
  - List of tasks assigned to current user, not done yet.
  - Shows task title, project name, and due date.

---

### 4.2 PMS – Tasks Module (`/pms/tasks`)

- Scope toggle:
  - **My Tasks** – tasks where current user is in `assignedTo` (using `Query.contains`).
  - **All Tasks** – only for supervisors/admins; shows all tasks.
- Filters:
  - Search by task title + project name.
  - Status chips: All / To Do / In Progress / Blocked / Done.
- Status summary:
  - Four mini cards showing counts of To Do, In Progress, Blocked, Done (respecting filters).
- Task cards:
  - Title, status pill.
  - Project name row.
  - Meta: due date, priority, estimated hours.
  - Tap → navigate to `/pms/projects/[id]` (Tasks tab).

---

### 4.3 PMS – Project Detail (`/pms/projects/[id]`)

- Header card:
  - Code badge.
  - Status pill (planned/active/on_hold/completed/cancelled).
  - Project name.
  - Budget tile:
    - Icon + label “Budget”.
    - Currency‑formatted amount.
  - Timeline tile:
    - Icon + label “Timeline”.
    - Start and end dates.

- Tabs (mobile v1):
  - **Overview** – shows summary text (client + description).
  - **Team** – present as a tab; explains that full team management is on web.
  - **Tasks** – fully implemented (see below).
  - **Activity Schedule** – placeholder (view/manage via web for now).
  - **Components** – placeholder (web only for now).

- Tasks tab:
  - Header: “Tasks” + count badge; view toggle (kanban/list icons).
  - Controls:
    - Search input.
    - “All Priorities” pill (visual, filter simplified).
    - “New Task” button (UI only; task creation done on web).
  - Summary row:
    - Status cards: To Do / In Progress / Blocked / Done (counts).
  - Task list:
    - Title, status pill, due date, hours.

---

### 4.4 PMS – Timesheets & Approvals

- **Timesheets tab**
  - Staff: view and manage own timesheets.
  - Managers/Admins: view own and have extra context (aligned with web).

- **Approvals tab**
  - Only for supervisors/admins.
  - View and handle pending timesheet approvals.

---

### 4.5 HR Module (Summary)

- HR Home:
  - Cards for Travel Requests, General Requests, My Approvals (for managers), Directory, Profile.
- Requests:
  - Staff can submit and track travel/general requests.
- Approvals:
  - Managers/HR approvers can review and act on incoming requests.
- Directory & Profile:
  - Browse staff directory; view profiles.
  - Staff can view and edit their own limited profile fields.

---

## 5. Setup & Configuration

### Prerequisites

- Node.js 18+ and npm
- Expo CLI
- Appwrite instance configured with:
  - HR and PMS projects
  - Corresponding databases and collections

### Environment Variables

In `mobile/.env`:

```env
APPWRITE_ENDPOINT=https://your-appwrite-endpoint

HR_PROJECT_ID=your-hr-project-id
HR_DB_ID=your-hr-database-id

PMS_PROJECT_ID=your-pms-project-id
PMS_DB_ID=your-pms-database-id
```

These must match the IDs used by the existing web HR and PMS repos.

### Running the App

```bash
cd mobile
npm install
npx expo start
```

Open in Expo Go or an emulator from the CLI prompt.

---

## 6. API & Data Access

The mobile app uses the **Appwrite JS SDK** directly – there is no separate REST API layer.

Examples:

- Projects list:
  - `pmsDatabases.listDocuments(PMS_DB_ID, PMS_COLLECTIONS.PROJECTS, [...queries])`
- Single project:
  - `pmsDatabases.getDocument(PMS_DB_ID, PMS_COLLECTIONS.PROJECTS, projectId)`
- Project tasks:
  - `pmsDatabases.listDocuments(PMS_DB_ID, PMS_COLLECTIONS.TASKS, [Query.equal('projectId', projectId)])`
- Global tasks (My Tasks):
  - `Query.contains('assignedTo', accountId)` on `pms_tasks`.

Auth:

- `pmsAccount.createEmailPasswordSession(email, password)`
- `pmsAccount.get()` to load current PMS user.

Roles and org info are resolved in `AuthContext.tsx`.

---

## 7. User Guides (Brief)

### PMS Staff

- Choose **Projects (PMS)** on landing.
- Log in.
- Use **Home** to see My Projects and Upcoming Tasks.
- Use **Tasks** tab for all your tasks; tap to open project details.
- Use **Timesheets** to manage your own timesheets.

### PMS Managers / Admins

- Same as staff, but:
  - Home shows **Team Projects**.
  - **Tasks** tab has **My Tasks / All Tasks** toggle.
  - **Approvals** tab is available for timesheet approvals.

### HR Users

- Choose **HR System** on landing.
- HR Home shows cards for:
  - Requests (travel/general)
  - Approvals (for managers)
  - Directory
  - Profile
- Follow each flow similar to the web HR system.

---

## 8. Database Schema (Key Collections)

The mobile app uses the same Appwrite collections as web PMS/HR. Key ones:

- `pms_projects` – project code, name, client, status, dates, budget, progress.
- `pms_tasks` – projectId, title, description, priority, status, dueDate, estimatedHours, assignedTo[].
- `pms_timesheets` and `pms_timesheet_entries` – timesheet headers and entries.
- HR collections – HR requests, approvals, profiles, and directory data.

See the web repos (and `NREP-PROJECT-MGT/lib/collectionsDefinition.js`) for full field definitions.

---

## 9. Technical Specifications

- **Performance**:
  - Queries limited (e.g. 100–300 items).
  - Client‑side filtering for search and status.
- **Security**:
  - Appwrite sessions; no custom auth.
  - Collection permissions match web PMS/HR.
- **UX**:
  - Safe area handling.
  - Bottom nav for PMS.
  - Project/task screens visually modelled on web UI while respecting mobile constraints.

---

## 10. Troubleshooting

**Login fails**  
- Check `.env` Appwrite endpoint and project IDs.
- Confirm user exists and has correct labels in Appwrite.

**Tasks screen error mentioning `assignedTo`**  
- Must use `Query.contains('assignedTo', accountId)` (already implemented).

**No route named `hr`/`pms`**  
- Ensure `app/_layout.tsx` stack includes correct routes or relies on folder structure properly; headers should be hidden where custom headers exist.

**Projects/Tasks appear empty**  
- Confirm collections in Appwrite have data and correct permissions.
- Check that `PMS_DB_ID` and `PMS_COLLECTIONS` constants match the backend configuration.

If behaviour differs from the web systems, verify configuration in Appwrite and cross‑check with the corresponding HR/PMS web repositories.
