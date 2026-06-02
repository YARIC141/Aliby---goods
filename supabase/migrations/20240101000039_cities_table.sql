-- Cities directory: popular Russian cities + admin-managed entries
create table if not exists public.cities (
  id    serial  primary key,
  name  text    not null unique,
  lat   float8  not null,
  lng   float8  not null,
  zoom  integer not null default 12,
  tz    text    not null default 'Europe/Moscow'
);

alter table public.cities enable row level security;

create policy "cities_read_all"   on public.cities for select using (true);
create policy "cities_admin_write" on public.cities for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Popular Russian cities ordered by population
insert into public.cities (name, lat, lng, zoom, tz) values
  ('Москва',              55.7522, 37.6156, 11, 'Europe/Moscow'),
  ('Санкт-Петербург',     59.9386, 30.3141, 11, 'Europe/Moscow'),
  ('Новосибирск',         54.9884, 82.8979, 11, 'Asia/Novosibirsk'),
  ('Екатеринбург',        56.8519, 60.6122, 11, 'Asia/Yekaterinburg'),
  ('Казань',              55.7887, 49.1221, 11, 'Europe/Moscow'),
  ('Нижний Новгород',     56.3269, 44.0060, 11, 'Europe/Moscow'),
  ('Самара',              53.1959, 50.1608, 12, 'Europe/Samara'),
  ('Уфа',                 54.7351, 55.9587, 11, 'Asia/Yekaterinburg'),
  ('Красноярск',          56.0153, 92.8932, 11, 'Asia/Krasnoyarsk'),
  ('Ростов-на-Дону',      47.2357, 39.7015, 11, 'Europe/Moscow'),
  ('Пермь',               58.0105, 56.2502, 11, 'Asia/Yekaterinburg'),
  ('Воронеж',             51.6616, 39.2003, 11, 'Europe/Moscow'),
  ('Волгоград',           48.7080, 44.5133, 11, 'Europe/Moscow'),
  ('Краснодар',           45.0355, 38.9753, 11, 'Europe/Moscow'),
  ('Саратов',             51.5336, 46.0344, 11, 'Europe/Moscow'),
  ('Тюмень',              57.1527, 68.9799, 11, 'Asia/Yekaterinburg'),
  ('Тольятти',            53.5116, 49.4302, 11, 'Europe/Samara'),
  ('Ижевск',              56.8519, 53.2115, 11, 'Europe/Samara'),
  ('Барнаул',             53.3480, 83.7798, 11, 'Asia/Barnaul'),
  ('Ульяновск',           54.3282, 48.3866, 11, 'Europe/Ulyanovsk'),
  ('Владивосток',         43.1332, 131.9113, 11, 'Asia/Vladivostok'),
  ('Ярославль',           57.6261, 39.8845, 11, 'Europe/Moscow'),
  ('Иркутск',             52.2978, 104.2964, 11, 'Asia/Irkutsk'),
  ('Хабаровск',           48.4802, 135.0719, 11, 'Asia/Vladivostok'),
  ('Махачкала',           42.9849, 47.5047, 11, 'Europe/Moscow'),
  ('Томск',               56.5011, 84.9744, 11, 'Asia/Tomsk'),
  ('Оренбург',            51.7683, 55.0969, 11, 'Asia/Yekaterinburg'),
  ('Кемерово',            55.3548, 86.0882, 11, 'Asia/Novosibirsk'),
  ('Новокузнецк',         53.7596, 87.1174, 11, 'Asia/Novosibirsk'),
  ('Рязань',              54.6299, 39.7418, 11, 'Europe/Moscow'),
  ('Астрахань',           46.3497, 48.0408, 11, 'Europe/Astrakhan'),
  ('Набережные Челны',    55.7423, 52.4153, 11, 'Europe/Moscow'),
  ('Пенза',               53.1954, 45.0183, 11, 'Europe/Moscow'),
  ('Киров',               58.5971, 49.6615, 11, 'Europe/Moscow'),
  ('Липецк',              52.6088, 39.5993, 11, 'Europe/Moscow'),
  ('Чебоксары',           56.1439, 47.2489, 11, 'Europe/Moscow'),
  ('Калининград',         54.7065, 20.5110, 12, 'Europe/Kaliningrad'),
  ('Тула',                54.1961, 37.6182, 11, 'Europe/Moscow'),
  ('Курск',               51.7304, 36.1927, 11, 'Europe/Moscow'),
  ('Ставрополь',          45.0428, 41.9690, 11, 'Europe/Moscow'),
  ('Сочи',                43.5853, 39.7203, 11, 'Europe/Moscow'),
  ('Улан-Удэ',            51.8272, 107.6063, 11, 'Asia/Irkutsk'),
  ('Тверь',               56.8587, 35.9176, 11, 'Europe/Moscow'),
  ('Брянск',              53.2434, 34.3649, 11, 'Europe/Moscow'),
  ('Иваново',             57.0003, 40.9738, 11, 'Europe/Moscow'),
  ('Белгород',            50.5977, 36.5858, 11, 'Europe/Moscow'),
  ('Магнитогорск',        53.4072, 59.0614, 11, 'Asia/Yekaterinburg'),
  ('Владимир',            56.1291, 40.4067, 11, 'Europe/Moscow'),
  ('Архангельск',         64.5401, 40.5433, 11, 'Europe/Moscow'),
  ('Чита',                52.0336, 113.4994, 11, 'Asia/Chita'),
  ('Смоленск',            54.7818, 32.0401, 11, 'Europe/Moscow'),
  ('Мурманск',            68.9733, 33.0856, 11, 'Europe/Moscow'),
  ('Сургут',              61.2543, 73.3964, 11, 'Asia/Yekaterinburg'),
  ('Владикавказ',         43.0367, 44.6689, 11, 'Europe/Moscow'),
  ('Нижний Тагил',        57.9181, 59.9720, 11, 'Asia/Yekaterinburg'),
  ('Чебоксары',           56.1439, 47.2489, 11, 'Europe/Moscow'),
  ('Грозный',             43.3174, 45.6984, 11, 'Europe/Moscow')
on conflict (name) do nothing;
