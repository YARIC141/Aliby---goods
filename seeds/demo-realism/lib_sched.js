// Расписание работы заведения на год вперёд.
// store_schedules: одна строка на (store_id, date), slots = [{start,end}].
const L = require('./lib');
const { sql, q } = L;

const START = '2026-09-10';
const DAYS = 400; // ~13 месяцев, чтобы «год вперёд» оставался годом ещё месяц

// Дни, когда почти вся сфера услуг закрыта или работает сокращённо.
const HOLIDAYS_CLOSED = ['2027-01-01', '2027-01-02'];
const HOLIDAYS_SHORT = ['2026-12-31', '2027-01-07', '2027-05-09', '2027-03-08', '2027-02-23'];

const iso = d => d.toISOString().slice(0, 10);
// q() трактует массив как text[]; slots — это jsonb-массив объектов.
const jsonb = v => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

// byDow: { 0..6: [[from,to], ...] | null }  (0 = воскресенье, как в JS getDay())
// short: во сколько закрываться в предпраздничный/праздничный день.
function storeYear(storeId, byDow, o = {}) {
  const rows = [];
  const d0 = new Date(START + 'T00:00:00Z');
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(d0.getTime() + i * 86400000);
    const date = iso(d);
    let slots = byDow[d.getUTCDay()];
    if (!slots) continue;                                   // выходной — строки нет
    if (HOLIDAYS_CLOSED.includes(date) && o.closeOnHolidays !== false) continue;
    if (HOLIDAYS_SHORT.includes(date) && o.shortEnd) {
      slots = slots.map(([f, t]) => [f, t > o.shortEnd ? o.shortEnd : t]);
    }
    rows.push(`(${q(storeId)}, ${q(date)}, ${jsonb(slots.map(([start, end]) => ({ start, end })))})`);
  }
  sql(`DELETE FROM store_schedules WHERE store_id=${q(storeId)} AND date >= ${q(START)};`);
  for (let i = 0; i < rows.length; i += 120) {
    sql(`INSERT INTO store_schedules (store_id, date, slots) VALUES\n${rows.slice(i, i + 120).join(',\n')};`);
  }
}

// Частые шаблоны недели.
const week = (weekday, sat, sun) => ({ 1: weekday, 2: weekday, 3: weekday, 4: weekday, 5: weekday, 6: sat, 0: sun });

module.exports = { storeYear, week, START, DAYS };
