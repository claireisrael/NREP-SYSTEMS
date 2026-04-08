import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function HrRolesScreen() {
  const router = useRouter();
  useEffect(() => {
    // Web parity: Roles are managed under Departments → Roles tab on mobile.
    router.replace('/hr/departments?tab=roles' as any);
  }, [router]);
  return null;
}

