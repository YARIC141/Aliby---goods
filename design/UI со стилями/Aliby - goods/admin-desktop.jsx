// Aliby Admin desktop dashboard
function AdminDesktop() {
  return (
    <div style={{ width: 1280, height: 820, display: 'flex', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside style={{ width: 240, borderRight: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', padding: '20px 14px' }}>
        <div className="hstack" style={{ padding: '0 8px 16px', borderBottom: '1px solid var(--line-soft)', marginBottom: 14 }}>
          <AlibyMark size={28} color="var(--accent)" />
          <div style={{ flex: 1 }}>
            <div style={{ font: '600 13px/1.1 var(--font-sans)' }}>Aliby Studio</div>
            <div className="t-sm" style={{ fontSize: 10 }}>Buna Coffee · admin</div>
          </div>
        </div>
        <div className="vstack" style={{ gap: 2 }}>
          {[
            { i: 'trend', l: 'Сводка', a: true },
            { i: 'box', l: 'Заказы', n: 5 },
            { i: 'store', l: 'Заведения' },
            { i: 'menu', l: 'Меню' },
            { i: 'ticket', l: 'Абонементы' },
            { i: 'layers', l: 'Категории' },
            { i: 'map', l: 'Карта' },
            { i: 'user', l: 'Профиль' },
          ].map((it, i) => (
            <button key={i} className="btn btn-ghost" style={{
              justifyContent: 'flex-start', width: '100%', height: 36, padding: '0 10px',
              background: it.a ? 'var(--bg-2)' : 'transparent',
              color: it.a ? 'var(--fg)' : 'var(--fg-2)',
            }}>
              <Icon name={it.i} size={16} /><span style={{ flex: 1, textAlign: 'left' }}>{it.l}</span>
              {it.n && <span className="badge badge-err" style={{ height: 18, fontSize: 10 }}>{it.n}</span>}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div className="card" style={{ padding: 12 }}>
          <div className="hstack" style={{ marginBottom: 8 }}>
            <Icon name="zap" size={14} color="var(--accent)" />
            <span style={{ font: '600 12px/1 var(--font-sans)' }}>Pro · до 20 мая</span>
          </div>
          <div className="t-sm" style={{ fontSize: 11, marginBottom: 8 }}>Безлимит абонементов и аналитика.</div>
          <button className="btn btn-sm btn-primary" style={{ width: '100%' }}>Продлить</button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="hstack" style={{ height: 64, padding: '0 28px', borderBottom: '1px solid var(--line-soft)' }}>
          <h1 style={{ font: '400 28px/1 var(--font-display)', margin: 0, letterSpacing: '-0.01em' }}>Сводка</h1>
          <span className="mono t-sm" style={{ marginLeft: 12 }}>5 мая · 09:24</span>
          <div style={{ flex: 1 }} />
          <div className="hstack" style={{ height: 36, padding: '0 12px', borderRadius: 'var(--r-2)', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', width: 280 }}>
            <Icon name="search" size={14} color="var(--fg-3)" />
            <span className="t-sm" style={{ flex: 1, marginLeft: 8 }}>Поиск заказов, товаров…</span>
            <span className="mono" style={{ font: '500 9px/1 var(--font-mono)', color: 'var(--fg-4)', padding: '2px 5px', border: '1px solid var(--line-soft)', borderRadius: 4 }}>⌘K</span>
          </div>
          <button className="btn btn-icon btn-sm" style={{ marginLeft: 8 }}><Icon name="bell" size={15}/></button>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 8 }}><Icon name="plus" size={14}/> Создать</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { l: 'Выручка сегодня', v: '48 240 ₽', d: '+12% к вчера', up: true },
              { l: 'Заказов', v: '127', d: '+8 заказов', up: true },
              { l: 'Средний чек', v: '380 ₽', d: '−2%', up: false },
              { l: 'Активных абонем.', v: '342', d: '+15', up: true },
            ].map((s, i) => (
              <div key={i} className="card fade-up" style={{ padding: 18, animationDelay: `${i*50}ms` }}>
                <div className="mono" style={{ font: '500 10px/1 var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--fg-4)' }}>{s.l}</div>
                <div style={{ font: '400 36px/1 var(--font-display)', marginTop: 8, letterSpacing: '-0.01em' }}>{s.v}</div>
                <div className="t-sm" style={{ color: s.up ? 'var(--ok)' : 'var(--err)', marginTop: 6, fontSize: 12 }}>
                  <Icon name="trend" size={12} stroke={2} style={{ display: 'inline-block', verticalAlign: 'middle', transform: s.up ? '' : 'scaleY(-1)' }}/> {s.d}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 20 }}>
            <div className="card" style={{ padding: 20 }}>
              <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <h3 style={{ font: '600 15px/1.2 var(--font-sans)', margin: 0 }}>Заказы и выручка</h3>
                  <div className="t-sm" style={{ marginTop: 2 }}>За последние 7 дней</div>
                </div>
                <div className="hstack" style={{ gap: 4 }}>
                  <button className="btn btn-sm" style={{ background: 'var(--bg-2)' }}>День</button>
                  <button className="btn btn-sm btn-ghost">Неделя</button>
                  <button className="btn btn-sm btn-ghost">Месяц</button>
                </div>
              </div>
              <svg viewBox="0 0 720 240" style={{ width: '100%', height: 220 }}>
                <defs>
                  <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="oklch(0.78 0.10 220)" stopOpacity=".5"/>
                    <stop offset="1" stopColor="oklch(0.78 0.10 220)" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="oklch(0.74 0.17 55)" stopOpacity=".4"/>
                    <stop offset="1" stopColor="oklch(0.74 0.17 55)" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                {[40,80,120,160,200].map(y => <line key={y} x1="0" x2="720" y1={y} y2={y} stroke="var(--line-soft)" strokeDasharray="2 4" />)}
                <path d="M0 180 L100 160 L200 165 L300 130 L400 110 L500 90 L600 70 L720 80 L720 240 L0 240 Z" fill="url(#ag1)" />
                <path d="M0 180 L100 160 L200 165 L300 130 L400 110 L500 90 L600 70 L720 80" fill="none" stroke="oklch(0.78 0.10 220)" strokeWidth="2.5" />
                <path d="M0 200 L100 190 L200 175 L300 165 L400 140 L500 130 L600 105 L720 100 L720 240 L0 240 Z" fill="url(#ag2)" />
                <path d="M0 200 L100 190 L200 175 L300 165 L400 140 L500 130 L600 105 L720 100" fill="none" stroke="oklch(0.74 0.17 55)" strokeWidth="2.5" strokeDasharray="4 3" />
                <circle cx="600" cy="70" r="5" fill="var(--bg)" stroke="oklch(0.78 0.10 220)" strokeWidth="2.5" />
              </svg>
              <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d => <span key={d} className="mono t-sm" style={{ fontSize: 10 }}>{d}</span>)}
              </div>
              <div className="hstack" style={{ gap: 16, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
                <div className="hstack" style={{ gap: 6 }}><span style={{ width: 10, height: 2, background: 'oklch(0.78 0.10 220)' }}/><span className="t-sm">Заказы</span></div>
                <div className="hstack" style={{ gap: 6 }}><span style={{ width: 10, height: 2, background: 'oklch(0.74 0.17 55)' }}/><span className="t-sm">Выручка</span></div>
              </div>
            </div>

            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ font: '600 15px/1.2 var(--font-sans)', margin: '0 0 16px' }}>Топ позиций</h3>
              <div className="vstack" style={{ gap: 12 }}>
                {[
                  { n: 'Флэт уайт', q: 84, p: 70 },
                  { n: 'Капучино', q: 62, p: 52 },
                  { n: 'Круассан', q: 48, p: 40 },
                  { n: 'Поке', q: 31, p: 26 },
                  { n: 'Раф', q: 24, p: 20 },
                ].map((it, i) => (
                  <div key={i}>
                    <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ font: '500 13px/1.2 var(--font-sans)' }}>{it.n}</span>
                      <span className="mono t-sm">{it.q}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${it.p}%`, background: 'var(--accent)', borderRadius: 2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="hstack" style={{ justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--line-soft)' }}>
              <h3 style={{ font: '600 15px/1.2 var(--font-sans)', margin: 0 }}>Очередь заказов</h3>
              <button className="btn btn-sm btn-ghost">Все заказы <Icon name="arrowR" size={12}/></button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  {['#','Клиент','Состав','Сумма','Время','Статус',''].map(h => (
                    <th key={h} style={{ font: '500 10px/1 var(--font-mono)', fontFamily: 'var(--font-mono)', color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '.1em', textAlign: 'left', padding: '10px 20px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { n: 'A2-0481', c: 'Михаил Л.', it: '2× флэт уайт, круассан', p: '1 320 ₽', t: '13:42', s: 'Готовится', sb: 'badge-warn' },
                  { n: 'A2-0480', c: 'Анна К.', it: 'Капучино, маффин', p: '600 ₽', t: '13:38', s: 'Готов', sb: 'badge-info' },
                  { n: 'A2-0479', c: 'Денис П.', it: 'Поке с лососем', p: '680 ₽', t: '13:35', s: 'Готовится', sb: 'badge-warn' },
                  { n: 'A2-0478', c: 'Ольга С.', it: 'Маргарита', p: '720 ₽', t: '13:30', s: 'Готов', sb: 'badge-info' },
                ].map((o, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--line-soft)' }}>
                    <td style={{ padding: '12px 20px', font: '500 12px/1 var(--font-mono)', fontFamily: 'var(--font-mono)' }}>#{o.n}</td>
                    <td style={{ padding: '12px 20px', font: '500 13px/1 var(--font-sans)' }}>{o.c}</td>
                    <td style={{ padding: '12px 20px', font: '400 13px/1 var(--font-sans)', color: 'var(--fg-2)' }}>{o.it}</td>
                    <td style={{ padding: '12px 20px', font: '500 13px/1 var(--font-sans)' }}>{o.p}</td>
                    <td style={{ padding: '12px 20px', font: '400 12px/1 var(--font-mono)', fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>{o.t}</td>
                    <td style={{ padding: '12px 20px' }}><span className={`badge ${o.sb}`}>{o.s}</span></td>
                    <td style={{ padding: '12px 20px' }}><Icon name="chevR" size={14} color="var(--fg-3)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

window.AdminDesktop = AdminDesktop;
