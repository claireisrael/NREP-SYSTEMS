import React from 'react';
import { Stack } from 'expo-router';

import { HrAuthProvider } from '@/context/HrAuthContext';

export default function HrLayout() {
  return (
    <HrAuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </HrAuthProvider>
  );
}

