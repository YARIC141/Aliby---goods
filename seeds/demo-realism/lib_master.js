// Мастера/тренеры и расписания. Мастер — это profiles с role='employee',
// employee_store_id и is_master. Привязка к услуге — master_services,
// рабочие часы — master_schedules (day_of_week в конвенции JS getDay(): 0=Вс).
const L = require('./lib');
const { sql, q, uid, img } = L;

// Идемпотентно: ищем по (employee_store_id, full_name) — у уже заведённых
// вручную мастеров id чужой, пересоздавать его нельзя (на нём висят записи).
function master(storeId, o) {
  const id = uid(`master:${storeId}:${o.name}`);
  const sel = `(SELECT id FROM profiles WHERE employee_store_id=${q(storeId)} AND full_name=${q(o.name)} LIMIT 1)`;
  sql(`INSERT INTO profiles (id, role, full_name, employee_store_id, employee_login, employee_password,
       is_master, master_bio, master_photo_url, city, phone)
SELECT ${q(id)}, 'employee', ${q(o.name)}, ${q(storeId)}, ${q(o.login)}, ${q(o.pass ?? '1234')},
       true, ${q(o.bio)}, ${q(img(o.photo))}, ${q(o.city ?? 'Самара')}, ${q(o.phone ?? null)}
WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE employee_store_id=${q(storeId)} AND full_name=${q(o.name)});
UPDATE profiles SET role='employee', is_master=true, master_bio=${q(o.bio)},
       master_photo_url=${q(img(o.photo))}, city=${q(o.city ?? 'Самара')},
       employee_login=COALESCE(NULLIF(employee_login,''), ${q(o.login)}),
       employee_password=COALESCE(NULLIF(employee_password,''), ${q(o.pass ?? '1234')})
WHERE employee_store_id=${q(storeId)} AND full_name=${q(o.name)};`);
  return { storeId, name: o.name, sel };
}

// Недельный график. shifts: [[dow, 'HH:MM', 'HH:MM'], ...]
function schedule(m, shifts) {
  sql(`DELETE FROM master_schedules WHERE master_id=${m.sel};`);
  shifts.forEach(([dow, from, to]) => {
    sql(`INSERT INTO master_schedules (id, master_id, day_of_week, start_time, end_time)
VALUES (${q(uid(`ms:${m.storeId}:${m.name}:${dow}:${from}`))}, ${m.sel}, ${q(dow)}, ${q(from)}, ${q(to)});`);
  });
}

// Услуги мастера с личной ценой: [[itemName, price], ...]
function services(m, list) {
  sql(`DELETE FROM master_services WHERE master_id=${m.sel};`);
  list.forEach(([name, price]) => {
    const svc = `(SELECT id FROM menu_items WHERE store_id=${q(m.storeId)} AND name=${q(name)} LIMIT 1)`;
    sql(`INSERT INTO master_services (id, master_id, service_id, price)
SELECT ${q(uid(`msv:${m.storeId}:${m.name}:${name}`))}, ${m.sel}, ${svc}, ${q(price)}
WHERE ${svc} IS NOT NULL;`);
  });
}

module.exports = { master, schedule, services };
