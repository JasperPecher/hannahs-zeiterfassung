'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { logout } from './auth-actions';
import type { Entry, Matter, Snapshot } from '../lib/model';
import { billingHours, billingSteps, bounds, dayOf, duration, localTime, moveDay, parseLocal, weekStart } from '../lib/time';

type Dialog =
  | { type: 'assign'; slot: number; matter?: Matter }
  | { type: 'rename'; matter: Matter }
  | { type: 'entry'; matter: Matter; entry?: Entry }
  | { type: 'switch'; matter: Matter; entry: Entry }
  | { type: 'delete'; entry: Entry };

const weekdayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const dayLabel = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDay = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekDays = Array.from({ length: 7 }, (_, index) => index);
const slots = Array.from({ length: 5 }, (_, index) => index);

function Symbol({ children }: { children: ReactNode }) {
  return <span className="symbol" aria-hidden="true">{children}</span>;
}

function dateLabel(day: string, format: Intl.DateTimeFormat) {
  return format.format(new Date(day + 'T00:00:00Z'));
}

function csvCell(value: string) {
  const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export default function Zeitbuch({ appTitle }: { appTitle: string }) {
  const [today, setToday] = useState('');
  const [selected, setSelected] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadedDay, setLoadedDay] = useState('');
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [differentEndDate, setDifferentEndDate] = useState(false);
  const dayRef = useRef('');
  const requestId = useRef(0);
  const offset = useRef(0);
  const pending = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);

  const refresh = useCallback(async (day: string) => {
    const current = ++requestId.current;
    try {
      const response = await fetch('/api/zeitbuch?day=' + day, { cache: 'no-store' });
      if (response.status === 401 || response.status === 403) {
        setSnapshot(null);
        window.location.replace('/anmelden');
        return;
      }
      if (!response.ok) throw new Error('Die Daten konnten nicht geladen werden.');
      const data: Snapshot = await response.json();
      if (current !== requestId.current || day !== dayRef.current) return;
      offset.current = data.now - Date.now();
      setNow(data.now);
      setToday(dayOf(data.now));
      setSnapshot(data);
      setLoadedDay(day);
      setError('');
    } catch {
      if (current === requestId.current) setError('Die Verbindung zur Zeiterfassung ist unterbrochen.');
    }
  }, []);

  const selectDay = useCallback((day: string) => {
    dayRef.current = day;
    setSelected(day);
    void refresh(day);
  }, [refresh]);

  useEffect(() => {
    const day = dayOf(Date.now());
    setToday(day);
    selectDay(day);
    const clock = window.setInterval(() => {
      const time = Date.now() + offset.current;
      setNow(time);
      setToday(dayOf(time));
    }, 250);
    const reload = () => {
      if (!pending.current && document.visibilityState === 'visible') void refresh(dayRef.current);
    };
    const poll = window.setInterval(reload, 8000);
    channel.current = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('zeitbuch') : null;
    channel.current?.addEventListener('message', reload);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
      channel.current?.close();
      channel.current = null;
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [refresh, selectDay]);

  useEffect(() => {
    const element = dialogRef.current;
    if (dialog && element && !element.open) element.showModal();
    if (!dialog && element?.open) element.close();
  }, [dialog]);

  function open(next: Dialog) {
    const entry = next.type === 'entry' ? next.entry : undefined;
    setDifferentEndDate(Boolean(entry?.stopped && dayOf(entry.started) !== dayOf(entry.stopped)));
    setDialogError('');
    setDialog(next);
  }

  async function mutate(payload: object) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setDialogError('');
    setError('');
    try {
      const response = await fetch('/api/zeitbuch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.status === 401 || response.status === 403) {
        setSnapshot(null);
        window.location.replace('/anmelden');
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? 'Die Änderung konnte nicht gespeichert werden.');
      }
      setDialog(null);
      channel.current?.postMessage('changed');
      await refresh(dayRef.current);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Die Änderung konnte nicht gespeichert werden.';
      await refresh(dayRef.current);
      if (dialog) setDialogError(message);
      else setError(message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const active = snapshot?.active;
  const activeMatter = snapshot?.matters.find(matter => matter.id === active?.matter_id);
  const visible = loadedDay === selected;
  const historical = selected !== today;
  const week = selected ? weekStart(selected) : '';
  const [from, until] = selected ? bounds(selected) : [0, 0];
  const entries = visible ? (snapshot?.entries ?? []).filter(entry => entry.stopped !== null) : [];
  const byMatter = new Map<string, Entry[]>();
  for (const entry of entries) {
    const group = byMatter.get(entry.matter_id) ?? [];
    group.push(entry);
    byMatter.set(entry.matter_id, group);
  }
  const entryTime = (entry: Entry) => Math.max(0, Math.min(entry.stopped ?? now, until) - Math.max(entry.started, from));
  const totals = new Map([...byMatter].map(([id, group]) => [id, group.reduce((sum, entry) => sum + entryTime(entry), 0)]));
  const exact = [...totals.values()].reduce((sum, ms) => sum + ms, 0);
  const steps = [...totals.values()].reduce((sum, ms) => sum + billingSteps(ms), 0);
  const matters = snapshot?.matters ?? [];
  const archived = matters.filter(matter => matter.slot === null && byMatter.has(matter.id));

  function toggle(matter: Matter) {
    if (active?.matter_id === matter.id) void mutate({ action: 'stop', id: active.id });
    else if (active) open({ type: 'switch', entry: active, matter });
    else void mutate({ action: 'start', id: crypto.randomUUID(), matter: matter.id });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) return;
    const form = new FormData(event.currentTarget);
    switch (dialog.type) {
      case 'assign':
        void mutate({ action: 'assign', id: crypto.randomUUID(), name: form.get('name'), slot: dialog.slot, expected: dialog.matter?.id });
        break;
      case 'rename':
        void mutate({ action: 'rename', id: dialog.matter.id, name: form.get('name') });
        break;
      case 'entry': {
        const original = dialog.entry;
        const startDate = form.get('startDate');
        const endDate = form.get('endDate') ?? startDate;
        const started = parseLocal(`${startDate}T${form.get('startTime')}`, original?.started);
        const stopped = parseLocal(`${endDate}T${form.get('endTime')}`, original?.stopped ?? undefined);
        if (!Number.isFinite(started) || !Number.isFinite(stopped)) {
          setDialogError('Bitte prüfe Beginn und Ende. Bei der Zeitumstellung kann eine Uhrzeit ungültig sein.');
          return;
        }
        if (stopped <= started) {
          setDialogError('Das Ende muss nach dem Beginn liegen. Bei einem Eintrag über Mitternacht wähle beim Ende den Folgetag.');
          return;
        }
        void mutate({
          action: 'entry', id: original?.id ?? crypto.randomUUID(),
          matter: dialog.matter.id, started, stopped, note: form.get('note'), edit: Boolean(original),
        });
        break;
      }
      case 'switch':
        void mutate({ action: 'start', id: crypto.randomUUID(), matter: dialog.matter.id, expected: dialog.entry.id });
        break;
      case 'delete':
        void mutate({ action: 'delete', id: dialog.entry.id });
        break;
    }
  }

  function exportDay() {
    const lines = [['Datum', 'Mandant', 'Beginn', 'Ende', 'Erfasste Dauer', 'Abrechenbare Stunden', 'Tätigkeit']];
    for (const matter of matters) {
      const group = byMatter.get(matter.id);
      if (!group) continue;
      for (const entry of [...group].reverse()) {
        lines.push([selected, matter.name, localTime(Math.max(entry.started, from)), localTime(Math.min(entry.stopped!, until)), duration(entryTime(entry)), '', entry.note]);
      }
      const ms = totals.get(matter.id) ?? 0;
      lines.push([selected, matter.name + ' · Summe', '', '', duration(ms), billingHours(billingSteps(ms)), '']);
    }
    lines.push([selected, 'Tagessumme', '', '', duration(exact), billingHours(steps), '']);
    const blob = new Blob(['\uFEFF' + lines.map(line => line.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'zeitbuch-' + selected + '.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderMatter(matter: Matter, index: number) {
    const running = active?.matter_id === matter.id;
    const group = byMatter.get(matter.id) ?? [];
    const ms = totals.get(matter.id) ?? 0;
    return (
      <article className={'matter ' + (running ? 'running' : '')} key={matter.id}>
        <div className="matter-main">
          <div className={'matter-icon tone-' + index % 5} aria-hidden="true"><span className="folder" /></div>
          <div className="matter-name"><h3>{matter.name}</h3><span>{running ? 'Erfassung läuft' : matter.slot === null ? 'Archivierter Mandant' : group.length ? group.length + (group.length === 1 ? ' Zeitabschnitt' : ' Zeitabschnitte') : 'Bereit zur Erfassung'}</span></div>
          <div className="matter-values">
            <div><span>Erfasst</span><strong>{duration(ms)}</strong></div>
            <div><span>Abrechenbar</span><strong>{billingHours(billingSteps(ms))} <small>h</small></strong></div>
          </div>
          <div className="matter-controls">
            {matter.slot !== null && (!historical || running) && (
              <button className={'button timer ' + (running ? 'timer-stop' : '')} aria-label={running ? 'Timer stoppen' : 'Timer starten'} disabled={busy} onClick={() => toggle(matter)}>
                <Symbol>{running ? '■' : '▶'}</Symbol>{running ? duration(now - active.started) : 'Starten'}
              </button>
            )}
            <button className="text-button add-time" onClick={() => open({ type: 'entry', matter })}><Symbol>+</Symbol> Zeit nachtragen</button>
          </div>
        </div>
        <details className="details" open={group.length > 0 || undefined}>
          <summary><span>Einzelzeiten</span><span className="detail-count">{group.length}</span></summary>
          <div className="detail-content">
            {group.length ? <div className="table-scroll"><table>
              <thead><tr><th>Zeitfenster</th><th>Dauer</th><th>Tätigkeit</th><th><span className="sr-only">Aktionen</span></th></tr></thead>
              <tbody>{group.map(entry => <tr key={entry.id}>
                <td>{localTime(Math.max(entry.started, from)).slice(11)} – {entry.stopped! >= until ? '24:00:00' : localTime(entry.stopped!).slice(11)}</td>
                <td>{duration(entryTime(entry))}</td><td>{entry.note || '—'}</td>
                <td className="actions">
                  <button type="button" className="text-button" onClick={() => open({ type: 'entry', matter, entry })}>Bearbeiten</button>
                  <button type="button" className="text-button danger-text" onClick={() => open({ type: 'delete', entry })}>Löschen</button>
                </td>
              </tr>)}</tbody>
            </table></div> : <p>Für diesen Tag sind noch keine gestoppten Zeiten erfasst.</p>}
            <div className="detail-actions">
              <button className="text-button" onClick={() => open({ type: 'rename', matter })}>Umbenennen</button>
              {matter.slot !== null && !running && <button className="text-button" onClick={() => open({ type: 'assign', slot: matter.slot!, matter })}>Platz neu belegen</button>}
            </div>
          </div>
        </details>
      </article>
    );
  }

  const title = dialog && { assign: dialog.type === 'assign' && dialog.matter ? 'Platz neu belegen' : 'Mandanten hinzufügen', rename: 'Mandanten umbenennen', entry: dialog.type === 'entry' && dialog.entry ? 'Zeit bearbeiten' : 'Zeit nachtragen', switch: 'Mandanten wechseln?', delete: 'Zeiteintrag löschen?' }[dialog.type];

  const editedEntry = dialog?.type === 'entry' ? dialog.entry : undefined;
  const editStart = editedEntry ? localTime(editedEntry.started) : selected + 'T';
  const editEnd = editedEntry?.stopped ? localTime(editedEntry.stopped) : selected + 'T';

  return (
    <>
      <header className="topbar"><div className="top-inner">
        <div className="brand"><span className="brand-icon" aria-hidden="true"><span className="clock-icon" /></span><h1>{appTitle}</h1></div>
        <div className="header-actions">
          <div className="header-status"><span className={'status-dot ' + (active ? 'live' : '')} />{activeMatter ? activeMatter.name + ' läuft' : snapshot ? 'Kein Timer läuft' : 'Timerstatus wird geladen'}</div>
          <form action={logout}><button className="button small">Abmelden</button></form>
        </div>
      </div></header>
      <main className="shell">
        {error && <div className="notice error" role="alert">{error} <button className="text-button" onClick={() => void refresh(dayRef.current)}>Neu laden</button></div>}
        {active && now - active.started >= 4 * 3600_000 && <div className="notice" role="status">Der Timer für {activeMatter?.name} läuft seit über vier Stunden. Prüfe, ob er weiterlaufen soll.</div>}
        <section className="day-panel" aria-labelledby="day-title">
          <div className="panel-heading">
            <div>
              <h2 id="day-title">Tagesübersicht</h2>
              {selected && <p>{dateLabel(selected, dayLabel)}</p>}
            </div>
            <button className="button export" onClick={exportDay} disabled={!entries.length}><Symbol>↓</Symbol> CSV exportieren</button>
          </div>
          {selected && <nav className="calendar" aria-label="Kalenderwoche">
            <div className="calendar-top">
              <span className="week-label">{dateLabel(week, shortDay)} – {dateLabel(moveDay(week, 6), shortDay)}</span>
              <div className="week-actions">
                <button className="button small" onClick={() => selectDay(today)}>Heute</button>
                <button className="button arrow" aria-label="Vorherige Woche" onClick={() => selectDay(moveDay(selected, -7))}>‹</button>
                <button className="button arrow" aria-label="Nächste Woche" onClick={() => selectDay(moveDay(selected, 7))}>›</button>
              </div>
            </div>
            <div className="week">
              {weekDays.map(index => {
                const day = moveDay(week, index);
                return <button key={day} className={'day ' + (selected === day ? 'selected' : '')} aria-pressed={selected === day} aria-label={dateLabel(day, dayLabel)} onClick={() => selectDay(day)}>
                  <span>{weekdayNames[index]}</span><strong>{Number(day.slice(-2))}</strong>{day === today && <i aria-label="Heute" />}
                </button>;
              })}
            </div>
          </nav>}

          <section className="overview" aria-label="Tagessummen">
            <div><span>Erfasste Tageszeit</span><strong>{visible ? duration(exact) : '—'}</strong></div>
            <div><span>Abrechenbar</span><strong>{visible ? billingHours(steps) : '—'} <small>h</small></strong></div>
            <p className="rounding">Auf 3 Minuten gerundet, je Mandant und Tag.</p>
          </section>
        </section>
        <section className="mandates" aria-labelledby="mandates-title">
          <div className="section-title"><h2 id="mandates-title">Mandanten</h2><span>{snapshot ? matters.filter(matter => matter.slot !== null).length + ' von 5 belegt' : ''}</span></div>
          {snapshot ? <div className="matter-list">
            {slots.map(index => {
              const matter = matters.find(item => item.slot === index);
              return matter ? renderMatter(matter, index) : <article className="empty-slot" key={'slot-' + index}>
                <span className="empty-icon" aria-hidden="true">+</span>
                <div><strong>Freier Platz {index + 1}</strong></div>
                <button className="button small" onClick={() => open({ type: 'assign', slot: index })}>Mandanten hinzufügen</button>
              </article>;
            })}
          </div> : <p className="loading" role="status">{error ? 'Keine Daten geladen.' : 'Zeiten werden geladen …'}</p>}
          {archived.length > 0 && <><h2 className="archive-title">Archivierte Mandanten</h2><div className="matter-list">{archived.map((matter, index) => renderMatter(matter, index))}</div></>}
        </section>
      </main>
      <dialog aria-labelledby="dialog-title" ref={dialogRef} onCancel={event => { event.preventDefault(); if (!busy) setDialog(null); }}>
        {dialog && <form key={dialog.type} onSubmit={submit}>
          <h2 id="dialog-title">{title}</h2>
          {dialog.type === 'assign' && dialog.matter && <p>Die Zeiten von {dialog.matter.name} bleiben in der Tageshistorie erhalten.</p>}
          {(dialog.type === 'assign' || dialog.type === 'rename') && <label>Aktenzeichen oder Kürzel<input name="name" required maxLength={80} defaultValue={dialog.type === 'rename' ? dialog.matter.name : ''} autoFocus /></label>}
          {dialog.type === 'entry' && <>
            <p>{dialog.matter.name} · Berliner Ortszeit</p>
            <label>Datum<input name="startDate" type="date" required defaultValue={editStart.slice(0, 10)} /></label>
            <div className="time-fields">
              <label>Startzeit<input name="startTime" type="time" step="1" required defaultValue={editStart.slice(11)} /></label>
              <label>Endzeit<input name="endTime" type="time" step="1" required defaultValue={editEnd.slice(11)} /></label>
            </div>
            <label className="end-date-toggle">
              <input type="checkbox" checked={differentEndDate} onChange={event => setDifferentEndDate(event.currentTarget.checked)} />
              Ende an einem anderen Tag
            </label>
            {differentEndDate && <label>Enddatum<input name="endDate" type="date" required defaultValue={editedEntry ? editEnd.slice(0, 10) : undefined} /></label>}
            <label>Tätigkeit (optional)<textarea name="note" maxLength={250} rows={3} defaultValue={dialog.entry?.note} /></label>
          </>}
          {dialog.type === 'switch' && <p><strong>{matters.find(matter => matter.id === dialog.entry.matter_id)?.name}</strong> läuft. Möchtest du diesen Timer stoppen und <strong>{dialog.matter.name}</strong> starten?</p>}
          {dialog.type === 'delete' && <p>Der Zeitabschnitt wird gelöscht und die Tagessumme neu berechnet.</p>}
          {dialogError && <p className="danger-text" role="alert">{dialogError}</p>}
          <div className="dialog-actions"><button type="button" className="button" disabled={busy} onClick={() => setDialog(null)}>Abbrechen</button><button className={'button primary ' + (dialog.type === 'delete' ? 'destructive' : '')} disabled={busy}>{dialog.type === 'switch' ? 'Stoppen und wechseln' : dialog.type === 'delete' ? 'Löschen' : 'Speichern'}</button></div>
        </form>}
      </dialog>
    </>
  );
}
