// Aliby Client app — all screens (mobile + desktop)
// Self-contained: each screen is a function returning JSX of fixed size.

const FOOD_PHOTOS = {
  burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&q=70',
  ramen: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&q=70',
  salad: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=70',
  pasta: 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=600&q=70',
  coffee: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=70',
  pizza: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=70',
  croissant: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&q=70',
  poke: 'https://images.unsplash.com/photo-1546069901-d5bfd2cbfb1f?w=600&q=70',
  cafeHero: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=900&q=70',
  cafeHero2: 'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=900&q=70',
};

// ── Mobile chrome shell (inside iOS frame body) ──────────────────────────
function MobileBottomNav({ active, dark = true }) {
  const items = [
    { id: 'map', label: 'Карта', icon: 'map' },
    { id: 'store', label: 'Заведение', icon: 'store' },
    { id: 'menu', label: 'Меню', icon: 'menu' },
    { id: 'cart', label: 'Корзина', icon: 'cart', badge: 3 },
    { id: 'profile', label: 'Профиль', icon: 'user' },
  ];
  return (
    <div className="glass" style={{
      position: 'absolute', left: 12, right: 12, bottom: 12,
      borderRadius: 22, padding: '8px 6px',
      display: 'flex', justifyContent: 'space-around',
      boxShadow: 'var(--shadow-2)',
    }}>
      {items.map(it => {
        const on = active === it.id;
        return (
          <div key={it.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, padding: '6px 8px', borderRadius: 14,
            background: on ? 'oklch(from var(--accent) l c h / .14)' : 'transparent',
            color: on ? 'var(--accent)' : 'var(--fg-3)',
            position: 'relative', minWidth: 44,
          }}>
            <div style={{ position: 'relative' }}>
              <Icon name={it.icon} size={20} stroke={1.7} />
              {it.badge && (
                <span style={{
                  position: 'absolute', top: -4, right: -7, minWidth: 14, height: 14,
                  background: 'var(--accent)', color: 'oklch(0.16 0.012 60)',
                  borderRadius: 7, font: '600 9px/14px var(--font-sans)', textAlign: 'center', padding: '0 3px',
                }}>{it.badge}</span>
              )}
            </div>
            <span style={{ font: '500 10px/1 var(--font-sans)' }}>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function PhoneHeader({ title, back, right }) {
  return (
    <div style={{
      padding: '8px 16px 12px', display: 'flex', alignItems: 'center', gap: 10,
      borderBottom: '1px solid var(--line-soft)',
    }}>
      {back ? (
        <button className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: -8 }}><Icon name="back" size={18} /></button>
      ) : null}
      <div style={{ flex: 1, font: '600 17px/1.2 var(--font-sans)', letterSpacing: '-0.01em' }}>{title}</div>
      {right}
    </div>
  );
}

// ── 1. Splash ──
function ClientSplash() {
  return (
    <div style={{
      flex: 1, position: 'relative',
      background: 'radial-gradient(80% 50% at 50% 30%, oklch(from var(--accent) l c h / .25), transparent 70%), var(--bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      overflow: 'hidden',
    }}>
      <div className="aliby-grid-bg" style={{ position: 'absolute', inset: 0, opacity: 0.4 }} />
      <div style={{ position: 'relative', textAlign: 'center', padding: '0 24px' }}>
        <p style={{ font: '400 17px/1.5 var(--font-display)', fontStyle: 'italic', color: 'var(--fg-2)', margin: 0 }}>Если возникнут подозрения,</p>
        <p style={{ font: '400 17px/1.5 var(--font-display)', fontStyle: 'italic', color: 'var(--fg-2)', margin: 0 }}>то у тебя есть</p>
        <h1 style={{ font: '400 88px/1 var(--font-display)', letterSpacing: '-0.02em', margin: '8px 0 18px' }}>
          Aliby<span style={{ color: 'var(--accent)' }}>.</span>
        </h1>
        <div style={{ display: 'inline-block', position: 'relative' }}>
          <div className="pulse-ember" style={{
            width: 110, height: 110, borderRadius: 26,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--glow-ember)',
          }}>
            <AlibyMark size={64} color="oklch(0.16 0.012 60)" />
          </div>
        </div>
      </div>
      <div className="mono" style={{ position: 'absolute', bottom: 24, font: '500 10px/1 var(--font-mono)', color: 'var(--fg-4)', letterSpacing: '.16em' }}>
        FOOD · WITH · PROOF
      </div>
    </div>
  );
}

// ── 2. Auth (sign-in) ──
function ClientAuth() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 22px' }}>
      <AlibyMark size={36} color="var(--accent)" />
      <div style={{ marginTop: 'auto' }}>
        <h2 style={{ font: '400 40px/1.05 var(--font-display)', letterSpacing: '-0.01em', margin: '0 0 6px' }}>
          С возвращением<span style={{ color: 'var(--accent)' }}>.</span>
        </h2>
        <p className="t" style={{ marginBottom: 22 }}>Войдите по e-mail. Мы пришлём код — без паролей.</p>
        <label className="label">E-mail</label>
        <input className="input" placeholder="you@aliby.app" defaultValue="hello@aliby.app" style={{ marginBottom: 14 }} />
        <button className="btn btn-primary btn-lg" style={{ width: '100%', marginBottom: 12 }}>
          Получить код <Icon name="arrowR" size={18} />
        </button>
        <button className="btn btn-ghost" style={{ width: '100%' }}>
          <Icon name="qr" size={16} /> Войти по QR
        </button>
      </div>
      <div className="t-sm" style={{ marginTop: 'auto', paddingTop: 24, color: 'var(--fg-4)', textAlign: 'center' }}>
        Продолжая, вы принимаете условия сервиса.
      </div>
    </div>
  );
}

// ── 3. Map (mobile) ──
function ClientMap() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <PhoneHeader title="Рядом" right={<button className="btn btn-ghost btn-icon btn-sm"><Icon name="filter" size={18}/></button>} />
      {/* Map mock */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg, oklch(0.22 0.014 60) 0%, oklch(0.18 0.012 60) 100%)',
      }}>
        {/* fake roads */}
        <svg viewBox="0 0 360 600" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: .35 }}>
          <path d="M-20 120 Q 120 100 200 200 T 400 280" fill="none" stroke="var(--fg-3)" strokeWidth="1" />
          <path d="M-20 320 Q 100 290 220 360 T 400 420" fill="none" stroke="var(--fg-3)" strokeWidth="1" />
          <path d="M80 -20 Q 90 200 180 280 T 260 620" fill="none" stroke="var(--fg-3)" strokeWidth="1" />
          <path d="M260 -20 Q 240 200 200 360 T 320 620" fill="none" stroke="var(--fg-3)" strokeWidth="1" />
        </svg>
        {/* park blob */}
        <div style={{ position: 'absolute', left: 30, top: 200, width: 140, height: 110, borderRadius: '60% 40% 65% 35%', background: 'oklch(0.30 0.06 150 / .35)' }} />
        {/* water */}
        <div style={{ position: 'absolute', right: -40, bottom: 120, width: 200, height: 200, borderRadius: '40% 60% 50% 50%', background: 'oklch(0.30 0.06 220 / .3)' }} />

        {/* pins */}
        {[
          { x: 40, y: 30, name: 'Tartine', tag: '12 мин' },
          { x: 62, y: 50, name: 'Buna Coffee', tag: '6 мин', active: true },
          { x: 28, y: 64, name: 'Yoko Ramen', tag: '18 мин' },
          { x: 70, y: 78, name: 'Olive&Lemon', tag: '22 мин' },
        ].map((p, i) => (
          <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -100%)' }}>
            <div className="glass" style={{
              padding: '4px 10px 4px 6px', borderRadius: 999,
              display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: 'var(--shadow-1)',
              transform: p.active ? 'scale(1.05)' : '',
              border: p.active ? '1px solid var(--accent)' : undefined,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: p.active ? 'var(--accent)' : 'var(--bg-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name="store" size={12} color={p.active ? 'oklch(0.16 0.012 60)' : 'var(--fg)'} stroke={2} />
              </div>
              <div style={{ font: '600 11px/1 var(--font-sans)' }}>{p.name}</div>
              <div className="mono" style={{ font: '500 10px/1 var(--font-mono)', color: 'var(--fg-3)' }}>· {p.tag}</div>
            </div>
            <div style={{ width: 1, height: 14, background: p.active ? 'var(--accent)' : 'var(--fg-4)', margin: '0 auto' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.active ? 'var(--accent)' : 'var(--fg-4)', margin: '0 auto' }} />
          </div>
        ))}

        {/* search top */}
        <div className="glass" style={{
          position: 'absolute', top: 12, left: 12, right: 12, height: 44,
          borderRadius: 14, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: 'var(--shadow-1)',
        }}>
          <Icon name="search" size={16} color="var(--fg-3)" />
          <span className="t" style={{ color: 'var(--fg-3)' }}>Найти кофейню, кухню или блюдо…</span>
        </div>

        {/* fab geo */}
        <button className="btn btn-icon" style={{
          position: 'absolute', right: 14, bottom: 200, width: 44, height: 44,
          borderRadius: '50%', background: 'var(--bg-2)', boxShadow: 'var(--shadow-1)',
        }}><Icon name="geo" size={18} /></button>

        {/* card peek */}
        <div className="glass" style={{
          position: 'absolute', left: 12, right: 12, bottom: 80,
          borderRadius: 18, padding: 12, display: 'flex', gap: 12,
          boxShadow: 'var(--shadow-2)',
        }}>
          <img src={FOOD_PHOTOS.coffee} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: '600 15px/1.1 var(--font-sans)' }}>Buna Coffee</div>
            <div className="t-sm" style={{ marginBottom: 4 }}>Кофейня · 0.4 км · до 22:00</div>
            <div className="hstack" style={{ gap: 6 }}>
              <span className="badge badge-ember">−15% по абонементу</span>
              <span className="t-sm">★ 4.9</span>
            </div>
          </div>
          <Icon name="chevR" size={18} color="var(--fg-3)" />
        </div>
      </div>
      <MobileBottomNav active="map" />
    </div>
  );
}

// ── 4. Store ──
function ClientStore() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
        <img src={FOOD_PHOTOS.cafeHero} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.4) 0%, transparent 30%, var(--bg) 100%)' }} />
        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-icon btn-sm glass" style={{ borderRadius: 12 }}><Icon name="back" size={16}/></button>
          <button className="btn btn-icon btn-sm glass" style={{ borderRadius: 12 }}><Icon name="heart" size={16}/></button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 18px 100px', marginTop: -34, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 14 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'oklch(0.40 0.10 35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-2)', flexShrink: 0,
          }}>
            <span style={{ font: '700 24px/1 var(--font-sans)', color: '#fff' }}>B</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ font: '400 28px/1.05 var(--font-display)', letterSpacing: '-0.01em', margin: 0 }}>Buna Coffee</h2>
            <div className="t-sm">Кофейня · сезонное меню</div>
          </div>
          <span className="badge badge-ok"><Icon name="check" size={11} stroke={2.4} /> Открыто</span>
        </div>

        <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-soft)', marginBottom: 14 }}>
          <div><div className="mono" style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg-4)' }}>★ RATING</div><div style={{ font: '600 17px/1.2 var(--font-sans)', marginTop: 4 }}>4.9</div></div>
          <div style={{ width: 1, background: 'var(--line-soft)' }} />
          <div><div className="mono" style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg-4)' }}>WAIT</div><div style={{ font: '600 17px/1.2 var(--font-sans)', marginTop: 4 }}>≈ 6 мин</div></div>
          <div style={{ width: 1, background: 'var(--line-soft)' }} />
          <div><div className="mono" style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg-4)' }}>DISTANCE</div><div style={{ font: '600 17px/1.2 var(--font-sans)', marginTop: 4 }}>0.4 км</div></div>
        </div>

        <div className="label">Абонементы</div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, marginBottom: 14, marginLeft: -18, paddingLeft: 18 }}>
          {[
            { t: 'Кофе на месяц', d: '−25%', c: 'var(--accent)' },
            { t: 'Завтраки 10×', d: '−15%' },
            { t: 'Сладкое 5×', d: '−20%' },
          ].map((s, i) => (
            <div key={i} className="card" style={{ minWidth: 160, padding: 12, background: i === 0 ? 'oklch(from var(--accent) l c h / .12)' : undefined, borderColor: i === 0 ? 'oklch(from var(--accent) l c h / .4)' : undefined }}>
              <div className="mono" style={{ font: '500 10px/1 var(--font-mono)', color: 'var(--fg-3)', marginBottom: 6 }}>SUBSCRIPTION</div>
              <div style={{ font: '600 14px/1.2 var(--font-sans)', marginBottom: 6 }}>{s.t}</div>
              <div style={{ font: '400 28px/1 var(--font-display)', color: i === 0 ? 'var(--accent)' : 'var(--fg)' }}>{s.d}</div>
            </div>
          ))}
        </div>

        <div className="label">Хиты</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { p: FOOD_PHOTOS.coffee, n: 'Лавандовый раф', pr: '320' },
            { p: FOOD_PHOTOS.croissant, n: 'Круассан с миндалём', pr: '280' },
          ].map((it, i) => (
            <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <img src={it.p} alt="" style={{ width: '100%', height: 100, objectFit: 'cover' }} />
              <div style={{ padding: 10 }}>
                <div style={{ font: '600 13px/1.2 var(--font-sans)' }}>{it.n}</div>
                <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ font: '600 14px/1 var(--font-sans)' }}>{it.pr} ₽</span>
                  <button className="btn btn-icon btn-sm btn-primary"><Icon name="plus" size={14} stroke={2.2}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <MobileBottomNav active="store" />
    </div>
  );
}

window.ClientSplash = ClientSplash;
window.ClientAuth = ClientAuth;
window.ClientMap = ClientMap;
window.ClientStore = ClientStore;
window.MobileBottomNav = MobileBottomNav;
window.PhoneHeader = PhoneHeader;
window.FOOD_PHOTOS = FOOD_PHOTOS;
