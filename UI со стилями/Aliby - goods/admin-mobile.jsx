// Aliby Admin app — mobile + desktop screens

function AdminMobileBottomNav({ active }) {
  const items = [
    { id: 'dash', label: 'Сводка', icon: 'trend' },
    { id: 'orders', label: 'Заказы', icon: 'box', badge: 5 },
    { id: 'menu', label: 'Меню', icon: 'menu' },
    { id: 'subs', label: 'Абонем.', icon: 'ticket' },
    { id: 'profile', label: 'Профиль', icon: 'user' },
  ];
  return (
    <div className="glass" style={{
      position: 'absolute', left: 12, right: 12, bottom: 12,
      borderRadius: 22, padding: '8px 6px', display: 'flex',
      justifyContent: 'space-around', boxShadow: 'var(--shadow-2)',
    }}>
      {items.map(it => {
        const on = active === it.id;
        return (
          <div key={it.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            padding: '6px 8px', borderRadius: 14, minWidth: 44,
            background: on ? 'oklch(from var(--accent) l c h / .14)' : 'transparent',
            color: on ? 'var(--accent)' : 'var(--fg-3)', position: 'relative',
          }}>
            <div style={{ position: 'relative' }}>
              <Icon name={it.icon} size={20} stroke={1.7} />
              {it.badge && <span style={{ position: 'absolute', top: -4, right: -7, minWidth: 14, height: 14, background: 'var(--err)', color: '#fff', borderRadius: 7, font: '600 9px/14px var(--font-sans)', textAlign: 'center', padding: '0 3px' }}>{it.badge}</span>}
            </div>
            <span style={{ font: '500 10px/1 var(--font-sans)' }}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AdminDashboard() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px 12px' }}>
        <div className="t-sm">Доброе утро,</div>
        <h1 style={{ font: '400 32px/1.05 var(--font-display)', margin: '2px 0 4px', letterSpacing: '-0.01em' }}>Buna Coffee</h1>
        <div className="hstack" style={{ gap: 8 }}>
          <span className="badge badge-ok"><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', display: 'inline-block' }} /> Открыто</span>
          <span className="mono t-sm">5 мая · 09:24</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 18px 100px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            { l: 'Выручка', v: '48 240', u: '₽', d: '+12%', c: 'var(--accent)' },
            { l: 'Заказов', v: '127', d: '+8' },
            { l: 'Средний чек', v: '380', u: '₽', d: '−2%', neg: true },
            { l: 'Активных абонем.', v: '342', d: '+15' },
          ].map((s, i) => (
            <div key={i} className="card fade-up" style={{ padding: 14, animationDelay: `${i*40}ms` }}>
              <div className="mono t-sm" style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>{s.l}</div>
              <div className="hstack" style={{ alignItems: 'baseline', gap: 4, marginTop: 6 }}>
                <span style={{ font: '400 26px/1 var(--font-display)' }}>{s.v}</span>
                {s.u && <span className="t-sm">{s.u}</span>}
              </div>
              <div className="t-sm" style={{ color: s.neg ? 'var(--err)' : 'var(--ok)', marginTop: 4, fontSize: 11 }}>{s.d} к вчера</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="h4">Заказы за сегодня</span>
            <span className="mono t-sm">по часам</span>
          </div>
          <svg viewBox="0 0 320 90" style={{ width: '100%', height: 90 }}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="oklch(0.74 0.17 55)" stopOpacity=".5"/>
                <stop offset="1" stopColor="oklch(0.74 0.17 55)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0 70 L30 60 L60 64 L90 50 L120 40 L150 32 L180 26 L210 18 L240 22 L270 14 L300 20 L320 16 L320 90 L0 90 Z" fill="url(#g)" />
            <path d="M0 70 L30 60 L60 64 L90 50 L120 40 L150 32 L180 26 L210 18 L240 22 L270 14 L300 20 L320 16" fill="none" stroke="oklch(0.74 0.17 55)" strokeWidth="2" />
          </svg>
          <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 6 }}>
            {['08','10','12','14','16','18','20'].map(h => (
              <span key={h} className="mono t-sm" style={{ fontSize: 10 }}>{h}</span>
            ))}
          </div>
        </div>

        <div className="label">Очередь готовки</div>
        <div className="vstack" style={{ gap: 8 }}>
          {[
            { n: 'A2-0481', t: 'сейчас', it: '2 × Флэт уайт, круассан', s: 'badge-warn', sl: 'Готовится' },
            { n: 'A2-0479', t: '2 мин', it: 'Поке с лососем', s: 'badge-warn', sl: 'Готовится' },
            { n: 'A2-0478', t: '4 мин', it: 'Маргарита', s: 'badge-info', sl: 'Готов' },
          ].map((o, i) => (
            <div key={i} className="card" style={{ padding: 12 }}>
              <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="mono" style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg-3)' }}>#{o.n}</span>
                <span className={`badge ${o.s}`}>{o.sl}</span>
              </div>
              <div style={{ font: '500 13px/1.3 var(--font-sans)' }}>{o.it}</div>
              <div className="t-sm" style={{ marginTop: 2 }}>в работе {o.t}</div>
            </div>
          ))}
        </div>
      </div>
      <AdminMobileBottomNav active="dash" />
    </div>
  );
}

function AdminOrders() {
  const orders = [
    { n: 'A2-0481', s: 'Готовится', sb: 'badge-warn', t: '13:42', items: '3 поз. · 1 320 ₽', c: 'Михаил Л.', live: true },
    { n: 'A2-0480', s: 'Готов', sb: 'badge-info', t: '13:38', items: '2 поз. · 600 ₽', c: 'Анна К.' },
    { n: 'A2-0479', s: 'Готовится', sb: 'badge-warn', t: '13:35', items: '1 поз. · 680 ₽', c: 'Денис П.', live: true },
    { n: 'A2-0478', s: 'Готов', sb: 'badge-info', t: '13:30', items: '1 поз. · 720 ₽', c: 'Ольга С.' },
    { n: 'A2-0477', s: 'Выдан', sb: '', t: '13:22', items: '4 поз. · 2 080 ₽', c: 'Артём И.' },
    { n: 'A2-0476', s: 'Отменён', sb: 'badge-err', t: '13:15', items: '1 поз. · 320 ₽', c: 'Елена Б.' },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line-soft)' }}>
        <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ font: '400 24px/1 var(--font-display)', margin: 0, letterSpacing: '-0.01em' }}>Заказы</h2>
          <button className="btn btn-icon btn-sm"><Icon name="filter" size={16}/></button>
        </div>
        <div className="hstack" style={{ gap: 6, overflowX: 'auto' }}>
          <button className="chip" data-active="true">Все · 127</button>
          <button className="chip">Готовится · 5</button>
          <button className="chip">Готов · 3</button>
          <button className="chip">Выдан · 112</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 100px' }}>
        {orders.map((o, i) => (
          <div key={i} className="card fade-up" style={{ padding: 12, marginBottom: 8, position: 'relative', animationDelay: `${i*40}ms` }}>
            {o.live && <div style={{ position: 'absolute', top: 14, right: 14, width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} className="pulse-ember" />}
            <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="mono" style={{ font: '600 12px/1 var(--font-mono)' }}>#{o.n}</span>
              <span className={`badge ${o.sb}`}>{o.s}</span>
            </div>
            <div style={{ font: '500 14px/1.3 var(--font-sans)' }}>{o.c}</div>
            <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <span className="t-sm">{o.items}</span>
              <span className="mono t-sm">{o.t}</span>
            </div>
          </div>
        ))}
      </div>
      <AdminMobileBottomNav active="orders" />
    </div>
  );
}

window.AdminMobileBottomNav = AdminMobileBottomNav;
window.AdminDashboard = AdminDashboard;
window.AdminOrders = AdminOrders;
