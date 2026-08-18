import { redirect } from 'next/navigation';
import { readSession } from '@/lib/session';

export default function Index() {
  const { accessToken } = readSession();
  redirect(accessToken ? '/dashboard' : '/login');
}
