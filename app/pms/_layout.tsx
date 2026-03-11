import React from 'react';
import { Stack } from 'expo-router';

export default function PmsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}

