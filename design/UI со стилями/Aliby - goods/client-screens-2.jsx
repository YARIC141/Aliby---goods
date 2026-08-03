// Aliby Client app — Menu, Cart, Orders, Subscriptions, Profile (mobile)
// Plus desktop versions of key screens.

function ClientMenu() {
  const cats = ['Все', 'Кофе', 'Завтраки', 'Сэндвичи', 'Сладкое', 'Сезон'];
  const items = [
    { p: FOOD_PHOTOS.coffee, n: 'Флэт уайт', d: 'эфиопия наталия', pr: 280, sub: '−25%' },
    { p: FOOD_PHOTOS.croissant, n: 'Миндальный круассан', d: 'свежая выпечка', pr: 320 },
    { p: FOOD_PHOTOS.salad, n: 'Сезонный салат', d: 'инжир, козий сыр', pr: 540 },
    { p: FOOD_PHOTOS.poke, n: 'Поке с лососем', d: 'киноа, авокадо', pr: 680 },
    { p: FOOD_PHOTOS.pasta, n: 'Паста аррабьята', d: 'острый томат', pr: 620 },
    { p: FOOD_PHOTOS.pizza, n: 'Маргарита', d: 'буррата, базилик', pr: 720 },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PhoneHeader title="Buna Coffee" back right={<button className="btn btn-ghost btn-icon btn-sm"><Icon name="search" size={18}/></button>} />
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', borderBottom: '1px solid var(--line-soft)' }}>
        {cats.map((c, i) => (
          <button key={c} className="chip" data-active={i === 1 ? 'true' : 'false'}>{c}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 100px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {items.map((it, i) => (
            <div key={i} className="card fade-up" style={{ padding: 0, overflow: 'hidden', animationDelay: `${i*40}ms` }}>
              <div style={{ position: 'relative', height: 92 }}>
                <img src={it.p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                {it.sub && <span className="badge badge-ember" style={{ position: 'absolute', top: 8, left: 8 }}>{it.sub}</span>}
              </div>
              <div style={{ padding: 10 }}>
                <div style={{ font: '600 13px/1.2 var(--font-sans)' }}>{it.n}</div>
                <div className="t-sm" style={{ marginBottom: 6, fontSize: 11 }}>{it.d}</div>
                <div className="hstack" style={{ justifyContent: 'space-between' }}>
                  <span style={{ font: '600 14px/1 var(--font-sans)' }}>{it.pr} ₽</span>
                  <button className="btn btn-icon btn-sm btn-primary"><Icon name="plus" size={14} stroke={2.2}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <MobileBottomNav active="menu" />
    </div>
  );
}

function ClientCart() {
  const items = [
    { n: 'Флэт уайт', q: 2, p: 280, sub: true },
    { n: 'Миндальный круассан', q: 1, p: 320 },
    { n: 'Поке с лососем', q: 1, p: 680 },
  ];
  const sub = items.reduce((s, i) => s + i.q * i.p, 0);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PhoneHeader title="Корзина" />
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 240px' }}>
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="hstack" style={{ marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'oklch(0.40 0.10 35)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 14px/1 var(--font-sans)', color: '#fff' }}>B</div>
            <div style={{ flex: 1 }}>
              <div style={{ font: '600 14px/1.2 var(--font-sans)' }}>Buna Coffee</div>
              <div className="t-sm">забрать в 13:20 · ≈ 6 мин</div>
            </div>
          </div>
          <div className="vstack" style={{ gap: 0 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--line-soft)' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '500 13px/1.2 var(--font-sans)' }}>{it.n} {it.sub && <span className="badge badge-ember" style={{ marginLeft: 4, height: 18, fontSize: 10 }}>−25%</span>}</div>
                  <div className="mono t-sm" style={{ fontSize: 11 }}>{it.p} ₽</div>
                </div>
                <div className="hstack" style={{ background: 'var(--bg-2)', borderRadius: 999, padding: 2, gap: 0 }}>
                  <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 26, height: 26 }}><Icon name="close" size={12} stroke={2}/></button>
                  <span className="mono" style={{ font: '500 12px/1 var(--font-mono)', minWidth: 18, textAlign: 'center' }}>{it.q}</span>
                  <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 26, height: 26 }}><Icon name="plus" size={12} stroke={2}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'oklch(from var(--accent) l c h / .2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="ticket" size={16} color="var(--accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ font: '600 13px/1.2 var(--font-sans)' }}>Применён абонемент «Кофе на месяц»</div>
            <div className="t-sm">скидка 25% на напитки · 7 из 30</div>
          </div>
        </div>
      </div>
      <div className="glass" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, borderRadius: 22, padding: 14, boxShadow: 'var(--shadow-2)' }}>
        <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="t-sm">Итого со скидкой</span>
          <span style={{ font: '400 28px/1 var(--font-display)' }}>{sub - 140} ₽</span>
        </div>
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }}>
          Оплатить · Apple Pay <Icon name="arrowR" size={16}/>
        </button>
      </div>
    </div>
  );
}

function ClientOrders() {
  const orders = [
    { n: 'A2-0481', s: 'Готовится', sb: 'badge-warn', t: '13:42 · сегодня', items: '3 позиции · 1 320 ₽', store: 'Buna Coffee', live: true },
    { n: 'A2-0470', s: 'Готов', sb: 'badge-info', t: 'вчера, 09:12', items: '2 позиции · 600 ₽', store: 'Tartine' },
    { n: 'A2-0467', s: 'Выдан', sb: '', t: '24 апр, 18:30', items: '5 позиций · 2 480 ₽', store: 'Yoko Ramen' },
    { n: 'A2-0461', s: 'Отменён', sb: 'badge-err', t: '22 апр, 12:10', items: '1 позиция · 320 ₽', store: 'Olive&Lemon' },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PhoneHeader title="Мои заказы" />
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 100px' }}>
        {orders.map((o, i) => (
          <div key={i} className="card fade-up" style={{ padding: 14, marginBottom: 10, animationDelay: `${i*60}ms`, position: 'relative' }}>
            {o.live && <div style={{ position: 'absolute', top: 14, right: 14, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} className="pulse-ember" />}
            <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="mono" style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg-3)' }}>#{o.n}</span>
              <span className={`badge ${o.sb}`}>{o.s}</span>
            </div>
            <div style={{ font: '600 15px/1.2 var(--font-sans)', marginBottom: 4 }}>{o.store}</div>
            <div className="t-sm">{o.items} · {o.t}</div>
            {o.live && (
              <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '60%', background: 'var(--accent)', borderRadius: 2 }} />
              </div>
            )}
          </div>
        ))}
      </div>
      <MobileBottomNav active="profile" />
    </div>
  );
}

function ClientSubs() {
  const subs = [
    { n: 'Кофе на месяц', s: 'Buna Coffee', use: '7 / 30', d: '−25%', exp: '20 мая', active: true },
    { n: 'Бизнес-ланч', s: 'Olive & Lemon', use: '4 / 10', d: '−20%', exp: '12 мая' },
    { n: 'Завтраки', s: 'Tartine', use: '2 / 12', d: '−15%', exp: '02 июня' },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PhoneHeader title="Абонементы" />
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 100px' }}>
        {subs.map((s, i) => {
          const pct = parseInt(s.use) / parseInt(s.use.split(' / ')[1]) * 100;
          return (
            <div key={i} className="fade-up" style={{
              position: 'relative', overflow: 'hidden',
              padding: 16, marginBottom: 12, borderRadius: 18,
              background: s.active
                ? 'linear-gradient(135deg, oklch(from var(--accent) l c h / .25), oklch(from var(--accent-2) l c h / .15))'
                : 'var(--bg-1)',
              border: '1px solid ' + (s.active ? 'oklch(from var(--accent) l c h / .4)' : 'var(--line-soft)'),
              animationDelay: `${i*70}ms`,
            }}>
              <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                <span className="mono" style={{ font: '500 10px/1 var(--font-mono)', color: 'var(--fg-3)', letterSpacing: '.12em' }}>SUBSCRIPTION</span>
                <span style={{ font: '400 22px/1 var(--font-display)', color: 'var(--accent)' }}>{s.d}</span>
              </div>
              <div style={{ font: '600 18px/1.2 var(--font-sans)', marginBottom: 2 }}>{s.n}</div>
              <div className="t-sm" style={{ marginBottom: 14 }}>{s.s} · до {s.exp}</div>
              <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="mono t-sm">{s.use}</span>
                <span className="t-sm">осталось {parseInt(s.use.split(' / ')[1]) - parseInt(s.use)}</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'oklch(0 0 0 / .2)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 999, transition: 'width 600ms ease' }} />
              </div>
            </div>
          );
        })}
      </div>
      <MobileBottomNav active="profile" />
    </div>
  );
}

function ClientProfile() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PhoneHeader title="Профиль" />
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px 100px' }}>
        <div className="card" style={{ padding: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 22px/1 var(--font-sans)', color: 'oklch(0.16 0.012 60)' }}>М</div>
          <div style={{ flex: 1 }}>
            <div style={{ font: '600 16px/1.2 var(--font-sans)' }}>Михаил Лебедев</div>
            <div className="t-sm">aliby.app/m.lebedev</div>
          </div>
          <Icon name="edit" size={18} color="var(--fg-3)" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          {[
            { k: 'Заказов', v: '47' },
            { k: 'Любимых', v: '8' },
            { k: 'Накоплено', v: '4 280' },
          ].map(s => (
            <div key={s.k} className="card" style={{ padding: 12, textAlign: 'center' }}>
              <div style={{ font: '400 26px/1 var(--font-display)', color: 'var(--accent)' }}>{s.v}</div>
              <div className="mono t-sm" style={{ fontSize: 10, marginTop: 4, letterSpacing: '.1em', textTransform: 'uppercase' }}>{s.k}</div>
            </div>
          ))}
        </div>

        <div className="label">Настройки</div>
        <div className="card" style={{ padding: 0 }}>
          {[
            { i: 'moon', l: 'Тёмная тема', sw: true },
            { i: 'bell', l: 'Уведомления', sw: false },
            { i: 'card', l: 'Способы оплаты', a: 'Apple Pay' },
            { i: 'geo', l: 'Город', a: 'Москва' },
            { i: 'info', l: 'О сервисе' },
          ].map((it, i, a) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: i < a.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={it.i} size={15} color="var(--fg-2)" />
              </div>
              <div style={{ flex: 1, font: '500 14px/1.2 var(--font-sans)' }}>{it.l}</div>
              {it.sw !== undefined ? <span className="switch" data-on={it.sw ? 'true' : 'false'} /> : (it.a ? <span className="t-sm">{it.a}</span> : <Icon name="chevR" size={14} color="var(--fg-3)" />)}
            </div>
          ))}
        </div>
      </div>
      <MobileBottomNav active="profile" />
    </div>
  );
}

window.ClientMenu = ClientMenu;
window.ClientCart = ClientCart;
window.ClientOrders = ClientOrders;
window.ClientSubs = ClientSubs;
window.ClientProfile = ClientProfile;
