import { useEffect } from 'react';
import { useRouter } from 'expo-router';

// Web parity note:
// In this HR system, "Positions" are represented by the Roles collection and are selected in Staff as "Position".
// To avoid duplicating data sources, this screen routes to the Roles manager.
export default function HrPositionsScreen() {
  const router = useRouter();

  // Web parity: Positions are managed inside Departments module tabs.
  useEffect(() => {
    router.replace('/hr/departments?tab=positions' as any);
  }, [router]);

  return null;
}
