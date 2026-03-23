import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHrAuth } from '@/context/HrAuthContext';

export default function HrEditTravelRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isLoading } = useHrAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/hr');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!isLoading && user && id) {
      // Reuse the same wizard screen in "edit" mode (matches web: prefilled wizard + reset approvals)
      router.replace(`/hr/travel/new?edit=${encodeURIComponent(String(id))}` as any);
    }
  }, [id, isLoading, user, router]);

  return null;
}

