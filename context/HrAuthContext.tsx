import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

import { HR_COLLECTIONS, HR_DB_ID, hrAccount, hrDatabases, Query } from '@/lib/appwrite';

type HrUserProfile = {
  $id: string;
  email: string;
  name?: string | null;
  staffCategory?: string | null;
  systemRole?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  profilePicture?: string | null;
} | null;

type HrAuthContextValue = {
  user: HrUserProfile;
  isLoading: boolean;
  isLocked: boolean;
  loginAttempts: number;
  getRemainingLockoutTime: () => number;
  refreshProfile: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const HrAuthContext = createContext<HrAuthContextValue | undefined>(undefined);

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 10;
const PROFILE_CACHE_VERSION = 1;
const PROFILE_LOAD_TIMEOUT_MS = 8000;

type HrAuthProviderProps = {
  children: ReactNode;
};

export function HrAuthProvider({ children }: HrAuthProviderProps) {
  const [user, setUser] = useState<HrUserProfile>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);

  const profileCachePath = useMemo(() => {
    const base = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    return `${base}hr_profile_cache_v${PROFILE_CACHE_VERSION}.json`;
  }, []);

  const readCachedProfile = async (): Promise<HrUserProfile> => {
    try {
      const info = await FileSystem.getInfoAsync(profileCachePath);
      if (!info.exists) return null;
      const raw = await FileSystem.readAsStringAsync(profileCachePath);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.$id || !parsed.email) return null;
      return parsed as HrUserProfile;
    } catch {
      return null;
    }
  };

  const writeCachedProfile = async (profile: HrUserProfile) => {
    try {
      if (!profile) return;
      await FileSystem.writeAsStringAsync(profileCachePath, JSON.stringify(profile));
    } catch {
      // ignore cache write errors
    }
  };

  const clearCachedProfile = async () => {
    try {
      await FileSystem.deleteAsync(profileCachePath, { idempotent: true });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      try {
        // Show last-known profile immediately (seamless UI), then refresh from Appwrite.
        const cached = await readCachedProfile();
        if (isMounted && cached) setUser(cached);

        const session = await hrAccount.get();
        if (!isMounted) return;

        const profile = await withTimeout(
          loadUserProfile(session.$id, session.email),
          PROFILE_LOAD_TIMEOUT_MS,
        );
        setUser(profile);
        writeCachedProfile(profile);
      } catch {
        if (!isMounted) return;
        setUser(null);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const loadUserProfile = async (authUserId: string, fallbackEmail?: string): Promise<HrUserProfile> => {
    try {
      const users = await hrDatabases.listDocuments(HR_DB_ID, HR_COLLECTIONS.USERS, [
        Query.equal('userId', authUserId),
      ]);

      if (!users.documents.length) {
        return {
          $id: authUserId,
          email: fallbackEmail || '',
        };
      }

      const userDoc: any = users.documents[0];

      let departmentName: string | null = userDoc.departmentName ?? null;
      if (!departmentName && userDoc.departmentId) {
        try {
          const departments = await hrDatabases.listDocuments(
            HR_DB_ID,
            HR_COLLECTIONS.DEPARTMENTS,
            [Query.equal('$id', userDoc.departmentId)],
          );
          if (departments.documents.length) {
            departmentName = (departments.documents[0] as any).name ?? null;
          }
        } catch {
          departmentName = null;
        }
      }

      return {
        $id: authUserId,
        email: userDoc.email || fallbackEmail || '',
        name: userDoc.name,
        staffCategory: userDoc.staffCategory,
        systemRole: userDoc.systemRole,
        departmentId: userDoc.departmentId ?? null,
        departmentName,
        profilePicture: userDoc.profilePicture ?? null,
      };
    } catch {
      return {
        $id: authUserId,
        email: fallbackEmail || '',
      };
    }
  };

  const getRemainingLockoutTime = () => {
    if (!lockedUntil) return 0;
    const diffMs = lockedUntil.getTime() - Date.now();
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (60 * 1000));
  };

  const refreshProfile = async () => {
    try {
      const currentUser = await hrAccount.get();
      const profile = await withTimeout(
        loadUserProfile(currentUser.$id, currentUser.email || undefined),
        PROFILE_LOAD_TIMEOUT_MS,
      );
      setUser(profile);
      writeCachedProfile(profile);
    } catch {
      // keep current user state on refresh failure
    }
  };

  const login = async (email: string, password: string) => {
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new Error(
        `Account is locked due to too many failed attempts. Try again in ${getRemainingLockoutTime()} minutes.`,
      );
    }

    setIsLoading(true);

    try {
      // createEmailPasswordSession returns a Session ($id is session id),
      // so we must call account.get() to obtain the authenticated user id.
      await hrAccount.createEmailPasswordSession(email, password);
      const currentUser = await hrAccount.get();
      const profile = await withTimeout(
        loadUserProfile(currentUser.$id, currentUser.email || email),
        PROFILE_LOAD_TIMEOUT_MS,
      );
      setUser(profile);
      writeCachedProfile(profile);
      setLoginAttempts(0);
      setLockedUntil(null);
    } catch (err: any) {
      const nextAttempts = loginAttempts + 1;
      setLoginAttempts(nextAttempts);

      if (nextAttempts >= MAX_ATTEMPTS) {
        const until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        setLockedUntil(until);
      }

      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await hrAccount.deleteSession('current');
    } catch {
      // ignore
    }
    setUser(null);
    clearCachedProfile();
  };

  const isLocked = lockedUntil !== null && lockedUntil.getTime() > Date.now();

  const value: HrAuthContextValue = {
    user,
    isLoading,
    isLocked,
    loginAttempts,
    getRemainingLockoutTime,
    refreshProfile,
    login,
    logout,
  };

  return <HrAuthContext.Provider value={value}>{children}</HrAuthContext.Provider>;
}

export function useHrAuth() {
  const ctx = useContext(HrAuthContext);
  if (!ctx) {
    throw new Error('useHrAuth must be used within an HrAuthProvider');
  }
  return ctx;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Profile load timed out. Please try again.')), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

