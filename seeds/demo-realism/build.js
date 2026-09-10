// Собирает один SQL-файл из всех витрин. Порядок важен: сначала ассортимент
// (на него ссылаются абонементы по именам позиций), потом всё остальное.
const fs = require('fs');
const L = require('./lib');

require('./v_food');
require('./v_goods');
require('./v_services');
require('./v_sport_ent');
require('./extras');

const sql = ['BEGIN;', '', ...L.out, '', 'COMMIT;', ''].join('\n');
const outFile = process.argv[2] || 'seed_all.sql';
fs.writeFileSync(outFile, sql, 'utf8');
console.log('statements:', L.out.length, 'bytes:', sql.length);
