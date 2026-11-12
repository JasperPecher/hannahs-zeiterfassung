import { redirect } from 'next/navigation';
import { auth, isAllowedUser, isAuthConfigured } from '../auth';
import { siteTitle } from '../site-title';
import Zeitbuch from './zeitbuch';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (!isAuthConfigured()) redirect('/anmelden');
  const session = await auth();
  if (!isAllowedUser(session?.user?.name)) redirect('/anmelden');
  return <Zeitbuch appTitle={siteTitle()} />;
}
