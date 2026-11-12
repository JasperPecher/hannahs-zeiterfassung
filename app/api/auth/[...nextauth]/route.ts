import { handlers, isAuthConfigured } from '../../../../auth';

export const dynamic = 'force-dynamic';

function unavailable() {
  return Response.json({ error: 'Anmeldung ist momentan nicht verfügbar.' }, {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function GET(request: Parameters<typeof handlers.GET>[0]) {
  return isAuthConfigured() ? handlers.GET(request) : unavailable();
}

export function POST(request: Parameters<typeof handlers.POST>[0]) {
  return isAuthConfigured() ? handlers.POST(request) : unavailable();
}
