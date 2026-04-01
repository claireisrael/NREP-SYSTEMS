import React, { useLayoutEffect, useRef } from 'react';
import { Stack, router } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

export default function PmsLayout() {
  const { user, loading } = useAuth();
  const prevHadUserRef = useRef(false);

  // After PMS logout, clear nested stack history so Android "back" cannot reopen
  // authenticated screens (projects, detail, etc.) with a stale stack.
  useLayoutEffect(() => {
    if (loading) return;

    const hadUser = prevHadUserRef.current;
    const hasUser = !!user;

    if (hadUser && !hasUser) {
      if (router.canDismiss()) {
        router.dismissAll();
      }
      router.replace('/pms');
    }

    prevHadUserRef.current = hasUser;
  }, [user, loading]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}

