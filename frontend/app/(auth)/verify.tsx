import { useEffect } from 'react';
import { useRouter } from 'expo-router';

/** Legacy route — phone SMS OTP removed; email sign-in is used instead. */
export default function VerifyScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/(auth)/login');
  }, [router]);
  return null;
}
