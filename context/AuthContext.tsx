import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

import { pmsAccount, pmsDatabases, pmsTeams, PMS_DB_ID, PMS_COLLECTIONS, Query } from '@/lib/appwrite';

type PmsSession = {
  authUser: any;
  profile: any;
  organization: any;
  organizationId: string;
  organizationName: string;
  labels: string[];
  isAdmin: boolean;
  isStaff: boolean;
  isClient: boolean;
  isSupervisor: boolean;
  isFinance: boolean;
} | null;

type AuthContextValue = {
  user: PmsSession;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PmsSession>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      // --- mirror logic from NREP-PROJECT-MGT/lib/auth.js:getUserSession ---
      const authUser = await pmsAccount.get();
      if (!authUser) {
        setUser(null);
        return;
      }

      // Get user's teams to find organization
      const userTeams = await pmsTeams.list();
      const orgTeam = userTeams.teams.find((t: any) => t.$id.startsWith('org_'));

      if (!orgTeam) {
        setUser(null);
        return;
      }

      // Fetch user profile from PMS users collection
      const userProfiles = await pmsDatabases.listDocuments(
        PMS_DB_ID,
        PMS_COLLECTIONS.USERS,
        [Query.equal('accountId', authUser.$id), Query.limit(1)],
      );

      if (userProfiles.documents.length === 0) {
        setUser(null);
        return;
      }

      const userProfile = userProfiles.documents[0];

      // Populate supervisorName like the web app does, if a supervisorId exists
      if ((userProfile as any).supervisorId) {
        try {
          const supervisorRes = await pmsDatabases.listDocuments(
            PMS_DB_ID,
            PMS_COLLECTIONS.USERS,
            [Query.equal('accountId', (userProfile as any).supervisorId), Query.limit(1)],
          );

          if (supervisorRes.documents.length > 0) {
            const supervisor: any = supervisorRes.documents[0];
            const first = supervisor.firstName || '';
            const last = supervisor.lastName || '';
            (userProfile as any).supervisorName = `${first} ${last}`.trim();
          }
        } catch (supErr) {
          console.error('Failed to fetch supervisor details for profile', supErr);
        }
      }

      // Role labels
      const userLabels: string[] = (authUser.labels as string[]) || [];
      const isAdmin = userLabels.includes('admin');
      const isStaff = userLabels.includes('staff') || userLabels.includes('admin');
      const isClient = userLabels.includes('client');
      const isFinance = userLabels.includes('finance');

      // Supervisor check
      const supervisedStaff = await pmsDatabases.listDocuments(
        PMS_DB_ID,
        PMS_COLLECTIONS.USERS,
        [Query.equal('supervisedBy', authUser.$id), Query.limit(1)],
      );
      const isSupervisor = userLabels.includes('supervisor') || supervisedStaff.documents.length > 0;

      // Organization document
      const orgDocs = await pmsDatabases.listDocuments(
        PMS_DB_ID,
        PMS_COLLECTIONS.ORGANIZATIONS,
        [Query.equal('$id', orgTeam.$id), Query.limit(1)],
      );
      const organization = orgDocs.documents.length > 0 ? orgDocs.documents[0] : null;

      const sessionData: PmsSession = {
        authUser,
        profile: userProfile,
        organization,
        organizationId: orgTeam.$id,
        organizationName: orgTeam.name,
        labels: userLabels,
        isAdmin,
        isStaff,
        isClient,
        isSupervisor,
        isFinance,
      };

      setUser(sessionData);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      // Clear any existing sessions, then create a new one
      try {
        await pmsAccount.deleteSessions();
      } catch {
        // ignore
      }
      await pmsAccount.createEmailPasswordSession(email, password);
      await loadUser();
    },
    [loadUser]
  );

  const logout = useCallback(async () => {
    try {
      await pmsAccount.deleteSession('current');
    } finally {
      setUser(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    await loadUser();
  }, [loadUser]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

