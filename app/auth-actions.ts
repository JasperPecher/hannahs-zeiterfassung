'use server';

import { AuthError, CredentialsSignin } from 'next-auth';
import { redirect } from 'next/navigation';
import { isAuthConfigured, signIn, signOut } from '../auth';

export async function login(form: FormData) {
  if (!isAuthConfigured()) redirect('/anmelden');
  try {
    await signIn('credentials', {
      username: form.get('username'),
      password: form.get('password'),
      redirectTo: '/',
    });
  } catch (error) {
    if (error instanceof CredentialsSignin && error.code === 'rate_limited') redirect('/anmelden?error=RateLimited');
    if (error instanceof AuthError) redirect('/anmelden?error=SignIn');
    throw error;
  }
}

export async function logout() {
  if (!isAuthConfigured()) redirect('/anmelden');
  await signOut({ redirectTo: '/anmelden' });
}
