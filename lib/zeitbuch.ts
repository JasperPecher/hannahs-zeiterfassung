import type { PrismaClient } from '@prisma/client';
import { prisma } from './database';
import { bounds, dayOf } from './time';
import type { Entry, Matter } from './model';

const reply = (error: string, status = 400) => Response.json({ error }, { status });

export async function readDay(request: Request, db: PrismaClient = prisma) {
  const day = new URL(request.url).searchParams.get('day') ?? dayOf(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day))) {
    return reply('Ungültiges Datum.');
  }
  const [from, until] = bounds(day);
  if (!Number.isFinite(from) || !Number.isFinite(until)) return reply('Ungültiges Datum.');

  const [mattersRaw, entriesRaw, activeRaw] = await Promise.all([
    db.matter.findMany({
      orderBy: [
        { slot: { sort: 'asc', nulls: 'last' } },
        { name: 'asc' },
      ],
    }),
    db.entry.findMany({
      where: {
        started: { lt: BigInt(until) },
        OR: [
          { stopped: { gt: BigInt(from) } },
          { stopped: null },
        ],
      },
      orderBy: { started: 'desc' },
    }),
    db.entry.findFirst({
      where: { stopped: null },
    }),
  ]);

  const matters: Matter[] = mattersRaw.map(m => ({
    id: m.id,
    name: m.name,
    slot: m.slot,
  }));

  const entries: Entry[] = entriesRaw.map(e => ({
    id: e.id,
    matter_id: e.matter_id,
    started: Number(e.started),
    stopped: e.stopped !== null ? Number(e.stopped) : null,
    note: e.note,
  }));

  const active: Entry | null = activeRaw ? {
    id: activeRaw.id,
    matter_id: activeRaw.matter_id,
    started: Number(activeRaw.started),
    stopped: activeRaw.stopped !== null ? Number(activeRaw.stopped) : null,
    note: activeRaw.note,
  } : null;

  return Response.json({
    matters,
    entries,
    active,
    now: Date.now(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function saveChange(request: Request, db: PrismaClient = prisma) {
  if (request.headers.get('sec-fetch-site') === 'cross-site' ||
      !request.headers.get('content-type')?.startsWith('application/json')) {
    return reply('Ungültige Anfrage.', 403);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return reply('Ungültige Anfrage.');
  const now = Date.now();
  const { action, id, matter, expected } = body;
  const newId = typeof id === 'string' && /^[\da-f-]{36}$/i.test(id) ? id : null;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const conflict = 'Der Stand hat sich geändert oder die Zeit überschneidet sich. Bitte prüfe die Einträge.';
  let changed = 0;

  switch (action) {
    case 'assign': {
      const slot = body.slot;
      if (!newId || !Number.isInteger(slot) || slot < 0 || slot > 4 || !name || name.length > 80) {
        return reply('Bitte gib ein Aktenzeichen oder einen Namen ein.');
      }
      if (expected !== undefined && typeof expected !== 'string') return reply('Ungültiger Mandant.');

      const success = await db.$transaction(async (tx) => {
        if (expected) {
          const hasOpen = await tx.entry.findFirst({
            where: { matter_id: expected, stopped: null },
            select: { id: true },
          });
          if (hasOpen) return false;

          await tx.matter.updateMany({
            where: { slot, id: expected },
            data: { slot: null },
          });
        }

        const slotOccupied = await tx.matter.findFirst({
          where: { slot },
          select: { id: true },
        });
        if (slotOccupied) return false;

        const existingId = await tx.matter.findUnique({
          where: { id: newId },
          select: { id: true },
        });
        if (existingId) return false;

        await tx.matter.create({
          data: { id: newId, name, slot },
        });
        return true;
      });

      changed = success ? 1 : 0;
      break;
    }
    case 'rename': {
      if (!newId || !name || name.length > 80) return reply('Bitte gib einen gültigen Namen ein.');
      const res = await db.matter.updateMany({
        where: { id: newId },
        data: { name },
      });
      changed = res.count;
      break;
    }
    case 'stop': {
      if (!newId) return reply('Ungültiger Zeiteintrag.');
      const res = await db.entry.updateMany({
        where: {
          id: newId,
          stopped: null,
          started: { lte: BigInt(now) },
        },
        data: { stopped: BigInt(now) },
      });
      changed = res.count;
      break;
    }
    case 'start': {
      if (!newId || typeof matter !== 'string' || (expected !== undefined && typeof expected !== 'string')) {
        return reply('Ungültiger Mandant.');
      }

      const success = await db.$transaction(async (tx) => {
        const targetMatter = await tx.matter.findFirst({
          where: { id: matter, slot: { not: null } },
          select: { id: true },
        });
        if (!targetMatter) return false;

        if (typeof expected === 'string' && expected) {
          const stopped = await tx.entry.updateMany({
            where: {
              id: expected,
              stopped: null,
              started: { lte: BigInt(now) },
              matter_id: { not: matter },
            },
            data: { stopped: BigInt(now) },
          });
          if (stopped.count === 0) return false;
        }

        const openEntry = await tx.entry.findFirst({
          where: { stopped: null },
          select: { id: true },
        });
        if (openEntry) return false;

        const existingEntry = await tx.entry.findUnique({
          where: { id: newId },
          select: { id: true },
        });
        if (existingEntry) return false;

        await tx.entry.create({
          data: {
            id: newId,
            matter_id: matter,
            started: BigInt(now),
          },
        });
        return true;
      });

      changed = success ? 1 : 0;
      break;
    }
    case 'entry': {
      const { started, stopped } = body;
      if (!newId || typeof matter !== 'string') return reply('Ungültiger Zeiteintrag.');
      if (!Number.isSafeInteger(started) || !Number.isSafeInteger(stopped)) {
        return reply('Bitte gib ein gültiges Datum und eine gültige Uhrzeit für Beginn und Ende ein.');
      }
      if (started >= stopped) return reply('Das Ende muss nach dem Beginn liegen.');
      if (stopped > now) return reply('Die Endzeit liegt in der Zukunft. Bitte prüfe Datum und Uhrzeit.');
      if (note.length > 250) return reply('Die Tätigkeitsbeschreibung darf höchstens 250 Zeichen lang sein.');

      const success = await db.$transaction(async (tx) => {
        const targetMatter = await tx.matter.findUnique({
          where: { id: matter },
          select: { id: true },
        });
        if (!targetMatter) return false;

        const overlapping = await tx.entry.findFirst({
          where: {
            id: { not: newId },
            started: { lt: BigInt(stopped) },
            OR: [
              { stopped: null },
              { stopped: { gt: BigInt(started) } },
            ],
          },
          select: { id: true },
        });
        if (overlapping) return false;

        if (body.edit) {
          const res = await tx.entry.updateMany({
            where: {
              id: newId,
              matter_id: matter,
              stopped: { not: null },
            },
            data: {
              started: BigInt(started),
              stopped: BigInt(stopped),
              note,
            },
          });
          return res.count > 0;
        } else {
          const existingEntry = await tx.entry.findUnique({
            where: { id: newId },
            select: { id: true },
          });
          if (existingEntry) return false;

          await tx.entry.create({
            data: {
              id: newId,
              matter_id: matter,
              started: BigInt(started),
              stopped: BigInt(stopped),
              note,
            },
          });
          return true;
        }
      });

      changed = success ? 1 : 0;
      break;
    }
    case 'delete': {
      if (!newId) return reply('Ungültiger Zeiteintrag.');
      const res = await db.entry.deleteMany({
        where: {
          id: newId,
          stopped: { not: null },
        },
      });
      changed = res.count;
      break;
    }
    default:
      return reply('Unbekannte Aktion.');
  }

  return changed ? Response.json({ ok: true }) : reply(conflict, 409);
}
