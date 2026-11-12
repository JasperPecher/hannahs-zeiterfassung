export function siteTitle() {
  return process.env.ZEITBUCH_TITLE?.trim() || 'Zeiterfassung';
}
