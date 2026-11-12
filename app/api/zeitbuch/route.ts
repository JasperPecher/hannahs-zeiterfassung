import { auth, authOrigin, isAllowedUser, isAuthConfigured } from '../../../auth';
import { database } from '../../../lib/database';
import { readDay, saveChange } from '../../../lib/zeitbuch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function protectedRequest(request: Request, action: typeof readDay) {
  if (!isAuthConfigured()) return errorResponse('Anmeldung ist momentan nicht verfügbar.', 503);

  const session = await auth();
  if (!session?.user) return errorResponse('Bitte melde dich an.', 401);
  if (!isAllowedUser(session.user.name)) return errorResponse('Kein Zugriff auf die Zeiterfassung.', 403);

  const origin = request.headers.get('origin');
  if (request.method === 'POST' && origin && origin !== authOrigin()) {
    return errorResponse('Ungültige Anfrage.', 403);
  }

  try {
    return await action(request, database());
  } catch {
    console.error('[zeitbuch] Datenbankoperation fehlgeschlagen.');
    return errorResponse('Die Zeiterfassung ist momentan nicht verfügbar.', 503);
  }
}

export function GET(request: Request) {
  return protectedRequest(request, readDay);
}

export function POST(request: Request) {
  return protectedRequest(request, saveChange);
}
