import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function HrRequestEditRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    router.replace(`/hr/requests/new?edit=${encodeURIComponent(String(id))}` as any);
  }, [id, router]);

  return null;
}

