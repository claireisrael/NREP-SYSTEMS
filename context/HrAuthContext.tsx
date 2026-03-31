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
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
};

const HrAuthContext = createContext<HrAuthContextValue | undefined>(undefined);

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 10;
const PROFILE_CACHE_VERSION = 1;
const PROFILE_LOAD_TIMEOUT_MS = 8000;
// If "Remember me" is OFF, expire mobile session after this window to match web-like behavior.
// (Web sessions typically expire on browser close or shorter TTL; mobile otherwise can feel "forever".)
const NON_REMEMBER_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

type HrAuthProviderProps = {
  children: ReactNode;
};

type HrAuthMeta = {
  version: 1;
  rememberMe: boolean;
  loginAt: number; // epoch ms
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

  const authMetaPath = useMemo(() => {
    const base = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
    return `${base}hr_auth_meta_v1.json`;
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

  const readAuthMeta = async (): Promise<HrAuthMeta | null> => {
    try {
      const info = await FileSystem.getInfoAsync(authMetaPath);
      if (!info.exists) return null;
      const raw = await FileSystem.readAsStringAsync(authMetaPath);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.version !== 1) return null;
      if (typeof parsed.rememberMe !== 'boolean') return null;
      if (typeof parsed.loginAt !== 'number') return null;
      return parsed as HrAuthMeta;
    } catch {
      return null;
    }
  };

  const writeAuthMeta = async (meta: HrAuthMeta) => {
    try {
      await FileSystem.writeAsStringAsync(authMetaPath, JSON.stringify(meta));
    } catch {
      // ignore
    }
  };

  const clearAuthMeta = async () => {
    try {
      await FileSystem.deleteAsync(authMetaPath, { idempotent: true });
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

        // Enforce web-like expiry when "Remember me" is OFF.
        const meta = await readAuthMeta();
        if (meta && !meta.rememberMe) {
          const age = Date.now() - meta.loginAt;
          if (age > NON_REMEMBER_MAX_AGE_MS) {
            try {
              await hrAccount.deleteSession('current');
            } catch {
              // ignore
            }
            await clearCachedProfile();
            await clearAuthMeta();
            if (isMounted) setUser(null);
            return;
          }
        }

        // If Appwrite session itself is expired/invalid, account.get() will throw.
        const session = await hrAccount.get();
        if (!isMounted) return;

        // Best-effort: if SDK supports session expiry, validate it.
        try {
          // @ts-ignore - not all SDK typings include getSession
          const currentSession = await (hrAccount as any).getSession?.('current');
          const expiresAt = currentSession?.expire || currentSession?.expiresAt || null;
          if (expiresAt) {
            const expMs = new Date(String(expiresAt)).getTime();
            if (Number.isFinite(expMs) && expMs > 0 && expMs <= Date.now()) {
              try {
                await hrAccount.deleteSession('current');
              } catch {
                // ignore
              }
              await clearCachedProfile();
              await clearAuthMeta();
              if (isMounted) setUser(null);
              return;
            }
          }
        } catch {
          // ignore session-expiry probing
        }

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

  const loginWithRemember = async (email: string, password: string, rememberMeFlag?: boolean) => {
    const remember = !!rememberMeFlag;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      throw new Error(
        `Account is locked due to too many failed attempts. Try again in ${getRemainingLockoutTime()} minutes.`,
      );
    }
    setIsLoading(true);
    try {
      await hrAccount.createEmailPasswordSession(email, password);
      const currentUser = await hrAccount.get();
      const profile = await withTimeout(
        loadUserProfile(currentUser.$id, currentUser.email || email),
        PROFILE_LOAD_TIMEOUT_MS,
      );
      setUser(profile);
      writeCachedProfile(profile);
      await writeAuthMeta({ version: 1, rememberMe: remember, loginAt: Date.now() });
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
    // Make logout immediate and deterministic for the UI:
    // clear local user state first so screens stop rendering/probing authenticated data.
    setUser(null);
    clearCachedProfile();
    clearAuthMeta();

    // Best-effort server session cleanup. This can fail if already expired.
    try {
      await hrAccount.deleteSession('current');
    } catch {
      // ignore
    }
  };

  const isLocked = lockedUntil !== null && lockedUntil.getTime() > Date.now();

  const value: HrAuthContextValue = {
    user,
    isLoading,
    isLocked,
    loginAttempts,
    getRemainingLockoutTime,
    refreshProfile,
    login: loginWithRemember,
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

