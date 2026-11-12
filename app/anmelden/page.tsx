import { redirect } from 'next/navigation';
import { auth, isAllowedUser, isAuthConfigured } from '../../auth';
import { siteTitle } from '../../site-title';
import { login } from '../auth-actions';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const configured = isAuthConfigured();
  const { error, code } = await searchParams;
  if (configured && !error && isAllowedUser((await auth())?.user?.name)) redirect('/');

  return (
    <>
      <header className="topbar">
        <div className="top-inner brand">
          <span className="brand-icon" aria-hidden="true"><span className="clock-icon" /></span>
          <h1>{siteTitle()}</h1>
        </div>
      </header>
      <main className="shell">
        <section className="sign-in" aria-labelledby="sign-in-title">
          <h2 id="sign-in-title">Anmelden</h2>
          {configured ? (
            <>
              {error && <p className="danger-text" role="alert">
                {error === 'RateLimited' || code === 'rate_limited'
                  ? 'Zu viele Anmeldeversuche. Bitte warte bis zu zehn Minuten.'
                  : 'Die Anmeldung ist fehlgeschlagen. Bitte prüfe deine Zugangsdaten.'}
              </p>}
              <form action={login}>
                <label>Benutzername<input name="username" autoComplete="username" required maxLength={80} /></label>
                <label>Passwort<input name="password" type="password" autoComplete="current-password" required maxLength={1024} /></label>
                <button className="button primary">Anmelden</button>
              </form>
            </>
          ) : <p>Die Anmeldung ist momentan nicht verfügbar.</p>}
        </section>
      </main>
    </>
  );
}
