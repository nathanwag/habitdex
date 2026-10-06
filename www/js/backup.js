/* Backup dos dados do aparelho num arquivo: o IndexedDB e preso ao endereco
 * do app, entao mudar de endereco (ou de aparelho) so leva os dados assim.
 * Puro; quem le e grava o banco e o db.js. */

const APP = 'habitdex';
// Ajustes que valem levar. O token e o segredo do Worker: fica de fora.
const KEEP = ['dayStart', 'goal'];

export function makeBackup({
  habits, checks, events, settings,
}, now) {
  const kept = Object.fromEntries(KEEP.filter((k) => k in settings).map((k) => [k, settings[k]]));
  return JSON.stringify({
    app: APP, version: 1, exportedAt: now.toISOString(), habits, checks, events, settings: kept,
  });
}

const invalid = () => new Error('Esse arquivo não é um backup do HabitDex.');
const every = (list, ok) => Array.isArray(list) && list.every((x) => x && typeof x === 'object' && ok(x));

/** Le o arquivo de `makeBackup`; arquivo estranho vira erro com mensagem. */
export function parseBackup(text) {
  let file;
  try { file = JSON.parse(text); } catch { throw invalid(); }
  if (file?.app !== APP) throw invalid();
  const ok = every(file.habits, (h) => Number.isInteger(h.id) && typeof h.name === 'string' && h.schedule)
    && every(file.checks, (c) => Number.isInteger(c.habitId) && typeof c.day === 'string')
    && every(file.events, (e) => typeof e.type === 'string' && typeof e.day === 'string');
  if (!ok) throw invalid();
  const settings = Object.fromEntries(KEEP.filter((k) => k in (file.settings ?? {})).map((k) => [k, file.settings[k]]));
  return {
    habits: file.habits, checks: file.checks, events: file.events, settings,
  };
}
