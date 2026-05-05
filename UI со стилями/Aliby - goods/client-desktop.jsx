// Aliby Client app — Desktop versions of key screens
// Sized for browser-window inner content (1280×820)

function ClientDesktopMap() {
  return (
    <div style={{ width: 1280, height: 820, display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      {/* Top bar */}
      <div className="hstack" style={{ height: 64, padding: '0 24px', borderBottom: '1px solid var(--line-soft)', gap: 24 }}>
        <AlibyLockup size={28} tagline="" />
        <div style={{ width: 1, height: 24, background: 'var(--line-soft)' }} />
        <nav className="hstack" style={{ gap: 4 }}>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--fg)' }}>Карта</button>
          <button className="btn btn-ghost btn-sm">Заведения</button>
          <button className="btn btn-ghost btn-sm">Абонементы</button>
          <button className="btn btn-ghost btn-sm">Заказы</button>
        </nav>
        <div style={{ flex: 1 }}>
          <div className="hstack" style={{ height: 40, padding: '0 14px', borderRadius: 'var(--r-2)', background: 'var(--bg-1)', border: '1px solid var(--line-soft)', maxWidth: 480, margin: '0 auto' }}>
            <Icon name="search" size={16} color="var(--fg-3)" />
            <span className="t" style={{ color: 'var(--fg-3)', flex: 1, marginLeft: 8 }}>Найти кофейню, кухню или блюдо…</span>
            <span className="mono" style={{ font: '500 10px/1 var(--font-mono)', color: 'var(--fg-4)', padding: '2px 6px', border: '1px solid var(--line-soft)', borderRadius: 4 }}>⌘K</span>
          </div>
        </div>
        <button className="btn btn-icon btn-sm"><Icon name="bell" size={16} /></button>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 13px/1 var(--font-sans)', color: 'oklch(0.16 0.012 60)' }}>М</div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* List sidebar */}
        <aside style={{ width: 360, borderRight: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px 12px' }}>
            <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <h2 style={{ font: '400 28px/1 var(--font-display)', margin: 0, letterSpacing: '-0.01em' }}>Рядом</h2>
              <span className="mono t-sm">12 мест</span>
            </div>
            <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="chip" data-active="true">Все</button>
              <button className="chip">Открыто</button>
              <button className="chip">С абонементом</button>
              <button className="chip">Кофе</button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {[
              { n: 'Buna Coffee', k: 'Кофейня · 0.4 км · до 22:00', s: 4.9, sub: '−25%', sel: true, p: FOOD_PHOTOS.coffee },
              { n: 'Tartine', k: 'Бистро · 0.7 км · до 23:00', s: 4.7, sub: '−15%', p: FOOD_PHOTOS.croissant },
              { n: 'Yoko Ramen', k: 'Японская · 1.2 км · до 22:30', s: 4.8, p: FOOD_PHOTOS.ramen },
              { n: 'Olive & Lemon', k: 'Средиземноморье · 1.5 км', s: 4.6, sub: '−20%', p: FOOD_PHOTOS.salad },
              { n: 'Forno', k: 'Пиццерия · 1.8 км · до 00:00', s: 4.9, p: FOOD_PHOTOS.pizza },
              { n: 'Pacifica', k: 'Поке-бар · 2.1 км', s: 4.5, p: FOOD_PHOTOS.poke },
            ].map((s, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '14px 20px',
                background: s.sel ? 'oklch(from var(--accent) l c h / .08)' : 'transparent',
                borderLeft: s.sel ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer',
              }}>
                <img src={s.p} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="hstack" style={{ justifyContent: 'space-between' }}>
                    <span style={{ font: '600 14px/1.2 var(--font-sans)' }}>{s.n}</span>
                    <span className="mono t-sm">★ {s.s}</span>
                  </div>
                  <div className="t-sm" style={{ marginTop: 2, fontSize: 12 }}>{s.k}</div>
                  {s.sub && <span className="badge badge-ember" style={{ marginTop: 6 }}>{s.sub}</span>}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Map */}
        <div style={{ flex: 1, position: 'relative', background: 'linear-gradient(135deg, oklch(0.20 0.013 60), oklch(0.16 0.012 60))', overflow: 'hidden' }}>
          <svg viewBox="0 0 920 760" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: .35 }}>
            <path d="M-20 200 Q 220 160 400 320 T 940 480" fill="none" stroke="var(--fg-3)" strokeWidth="1.4" />
            <path d="M-20 460 Q 200 420 420 520 T 940 640" fill="none" stroke="var(--fg-3)" strokeWidth="1.4" />
            <path d="M180 -20 Q 220 240 360 380 T 460 800" fill="none" stroke="var(--fg-3)" strokeWidth="1.4" />
            <path d="M620 -20 Q 580 240 540 460 T 700 800" fill="none" stroke="var(--fg-3)" strokeWidth="1.4" />
          </svg>
          <div style={{ position: 'absolute', left: 80, top: 280, width: 240, height: 180, borderRadius: '60% 40% 65% 35%', background: 'oklch(0.30 0.06 150 / .35)' }} />
          <div style={{ position: 'absolute', right: -80, bottom: 100, width: 360, height: 360, borderRadius: '40% 60% 50% 50%', background: 'oklch(0.30 0.06 220 / .3)' }} />

          {[
            { x: 28, y: 36, n: 'Tartine', t: '12 мин' },
            { x: 48, y: 52, n: 'Buna Coffee', t: '6 мин', a: true },
            { x: 22, y: 64, n: 'Yoko Ramen', t: '18 мин' },
            { x: 64, y: 70, n: 'Olive & Lemon', t: '22 мин' },
            { x: 80, y: 38, n: 'Forno', t: '28 мин' },
            { x: 72, y: 22, n: 'Pacifica', t: '32 мин' },
          ].map((p, i) => (
            <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -100%)' }}>
              <div className="glass" style={{
                padding: '5px 12px 5px 7px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: 'var(--shadow-1)',
                border: p.a ? '1px solid var(--accent)' : undefined,
                transform: p.a ? 'scale(1.08)' : '',
              }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: p.a ? 'var(--accent)' : 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="store" size={13} color={p.a ? 'oklch(0.16 0.012 60)' : 'var(--fg)'} stroke={2} />
                </div>
                <div style={{ font: '600 12px/1 var(--font-sans)' }}>{p.n}</div>
                <div className="mono" style={{ font: '500 10px/1 var(--font-mono)', color: 'var(--fg-3)' }}>{p.t}</div>
              </div>
              <div style={{ width: 1, height: 16, background: p.a ? 'var(--accent)' : 'var(--fg-4)', margin: '0 auto' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.a ? 'var(--accent)' : 'var(--fg-4)', margin: '0 auto' }} />
            </div>
          ))}

          {/* Selected store popover */}
          <div className="glass" style={{
            position: 'absolute', left: 24, bottom: 24, width: 380,
            borderRadius: 18, padding: 18, boxShadow: 'var(--shadow-2)',
          }}>
            <div className="hstack" style={{ marginBottom: 12 }}>
              <img src={FOOD_PHOTOS.coffee} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
              <div style={{ flex: 1 }}>
                <div style={{ font: '600 16px/1.2 var(--font-sans)' }}>Buna Coffee</div>
                <div className="t-sm">Кофейня · 0.4 км · до 22:00</div>
              </div>
              <span className="badge badge-ok"><Icon name="check" size={11} stroke={2.4} /> Открыто</span>
            </div>
            <div className="hstack" style={{ gap: 18, padding: '10px 0', borderTop: '1px solid var(--line-soft)', borderBottom: '1px solid var(--line-soft)', marginBottom: 12 }}>
              <div><div className="mono t-sm" style={{ fontSize: 10 }}>RATING</div><div style={{ font: '600 16px/1.2 var(--font-sans)' }}>★ 4.9</div></div>
              <div><div className="mono t-sm" style={{ fontSize: 10 }}>WAIT</div><div style={{ font: '600 16px/1.2 var(--font-sans)' }}>≈ 6 мин</div></div>
              <div><div className="mono t-sm" style={{ fontSize: 10 }}>SUB</div><div style={{ font: '600 16px/1.2 var(--font-sans)', color: 'var(--accent)' }}>−25%</div></div>
            </div>
            <button className="btn btn-primary" style={{ width: '100%' }}>Открыть меню <Icon name="arrowR" size={14}/></button>
          </div>

          <div className="hstack" style={{ position: 'absolute', right: 24, bottom: 24, gap: 6 }}>
            <button className="btn btn-icon glass" style={{ width: 44, height: 44, borderRadius: 12 }}><Icon name="plus" size={16}/></button>
            <button className="btn btn-icon glass" style={{ width: 44, height: 44, borderRadius: 12 }}><span style={{ font: '500 16px/1 var(--font-sans)' }}>−</span></button>
            <button className="btn btn-icon glass" style={{ width: 44, height: 44, borderRadius: 12 }}><Icon name="geo" size={16}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientDesktopMenu() {
  const items = [
    { p: FOOD_PHOTOS.coffee, n: 'Флэт уайт', d: 'Эфиопия Наталия · фильтр', pr: 280, sub: '−25%' },
    { p: FOOD_PHOTOS.croissant, n: 'Миндальный круассан', d: 'Слоёное тесто, миндальный крем', pr: 320 },
    { p: FOOD_PHOTOS.salad, n: 'Сезонный салат', d: 'Инжир, козий сыр, мёд', pr: 540 },
    { p: FOOD_PHOTOS.poke, n: 'Поке с лососем', d: 'Киноа, авокадо, эдамаме', pr: 680 },
    { p: FOOD_PHOTOS.pasta, n: 'Аррабьята', d: 'Острый томат, пеперончино', pr: 620 },
    { p: FOOD_PHOTOS.pizza, n: 'Маргарита', d: 'Буррата, базилик, томаты', pr: 720 },
    { p: FOOD_PHOTOS.burger, n: 'Бургер «Aliby»', d: 'Говядина, чеддер, бекон', pr: 780 },
    { p: FOOD_PHOTOS.ramen, n: 'Шою рамен', d: 'Куриный бульон, чашю', pr: 840 },
  ];
  return (
    <div style={{ width: 1280, height: 820, display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>
      <div className="hstack" style={{ height: 64, padding: '0 24px', borderBottom: '1px solid var(--line-soft)', gap: 24 }}>
        <AlibyLockup size={28} tagline="" />
        <div style={{ width: 1, height: 24, background: 'var(--line-soft)' }} />
        <span className="t" style={{ color: 'var(--fg-3)' }}>Карта / <span style={{ color: 'var(--fg)' }}>Buna Coffee</span></span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm"><Icon name="heart" size={16}/> В избранное</button>
        <button className="btn btn-icon btn-sm"><Icon name="bell" size={16}/></button>
      </div>

      {/* Hero */}
      <div style={{ position: 'relative', height: 240, overflow: 'hidden' }}>
        <img src={FOOD_PHOTOS.cafeHero} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.2) 0%, transparent 40%, var(--bg) 100%)' }} />
        <div style={{ position: 'absolute', left: 32, bottom: 32, right: 32, display: 'flex', alignItems: 'flex-end', gap: 20 }}>
          <div style={{ width: 88, height: 88, borderRadius: 20, background: 'oklch(0.40 0.10 35)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 36px/1 var(--font-sans)', color: '#fff', boxShadow: 'var(--shadow-2)' }}>B</div>
          <div style={{ flex: 1 }}>
            <h1 style={{ font: '400 56px/1 var(--font-display)', margin: 0, letterSpacing: '-0.02em' }}>Buna Coffee</h1>
            <div className="hstack" style={{ marginTop: 8, gap: 16, color: 'var(--fg-2)' }}>
              <span className="t-sm">★ 4.9 · 1240 отзывов</span>
              <span className="t-sm">Кофейня · сезонное меню</span>
              <span className="badge badge-ok">Открыто до 22:00</span>
              <span className="badge badge-ember">−25% по абонементу</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Categories rail */}
        <aside style={{ width: 220, padding: '24px 20px', borderRight: '1px solid var(--line-soft)' }}>
          <div className="label">Категории</div>
          <div className="vstack" style={{ gap: 2 }}>
            {['Все', 'Кофе', 'Завтраки', 'Сэндвичи', 'Салаты', 'Горячее', 'Сладкое', 'Напитки'].map((c, i) => (
              <button key={c} className="btn btn-ghost btn-sm" style={{
                justifyContent: 'space-between', width: '100%',
                background: i === 1 ? 'var(--bg-2)' : 'transparent',
                color: i === 1 ? 'var(--fg)' : 'var(--fg-2)',
              }}>
                {c}
                <span className="mono t-sm">{[42,8,6,5,4,7,9,3][i]}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Items */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
          <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ font: '400 28px/1 var(--font-display)', margin: 0, letterSpacing: '-0.01em' }}>Меню</h2>
            <div className="hstack" style={{ gap: 8 }}>
              <button className="btn btn-sm"><Icon name="filter" size={14}/> Фильтры</button>
              <button className="btn btn-sm">По популярности <Icon name="chevD" size={14}/></button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {items.map((it, i) => (
              <div key={i} className="card fade-up" style={{ padding: 0, overflow: 'hidden', animationDelay: `${i*30}ms` }}>
                <div style={{ position: 'relative', height: 140 }}>
                  <img src={it.p} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  {it.sub && <span className="badge badge-ember" style={{ position: 'absolute', top: 10, left: 10 }}>{it.sub}</span>}
                </div>
                <div style={{ padding: 14 }}>
                  <div style={{ font: '600 15px/1.2 var(--font-sans)' }}>{it.n}</div>
                  <div className="t-sm" style={{ marginBottom: 10 }}>{it.d}</div>
                  <div className="hstack" style={{ justifyContent: 'space-between' }}>
                    <span style={{ font: '600 17px/1 var(--font-sans)' }}>{it.pr} ₽</span>
                    <button className="btn btn-sm btn-primary"><Icon name="plus" size={12} stroke={2.2}/> В корзину</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cart drawer */}
        <aside style={{ width: 320, borderLeft: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 20px 12px' }}>
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ font: '600 16px/1.2 var(--font-sans)', margin: 0 }}>Корзина</h3>
              <span className="mono t-sm">3 позиции</span>
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
            {[
              { n: 'Флэт уайт', q: 2, p: 280, sub: true },
              { n: 'Миндальный круассан', q: 1, p: 320 },
              { n: 'Поке с лососем', q: 1, p: 680 },
            ].map((it, i, a) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 0', borderBottom: i < a.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ font: '500 13px/1.3 var(--font-sans)' }}>{it.n}</div>
                  <div className="mono t-sm" style={{ fontSize: 11 }}>{it.q} × {it.p} ₽</div>
                </div>
                <div className="hstack" style={{ background: 'var(--bg-2)', borderRadius: 999, padding: 2 }}>
                  <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 24, height: 24 }}><span style={{ fontSize: 14 }}>−</span></button>
                  <span className="mono" style={{ font: '500 12px/1 var(--font-mono)', minWidth: 18, textAlign: 'center' }}>{it.q}</span>
                  <button className="btn btn-ghost btn-icon btn-sm" style={{ width: 24, height: 24 }}><Icon name="plus" size={11} stroke={2.2}/></button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: 20, borderTop: '1px solid var(--line-soft)' }}>
            <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="t-sm">Подытог</span><span className="mono t-sm">1 560 ₽</span>
            </div>
            <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="t-sm">Скидка</span><span className="mono t-sm" style={{ color: 'var(--accent)' }}>−140 ₽</span>
            </div>
            <div className="hstack" style={{ justifyContent: 'space-between', marginBottom: 14, paddingTop: 12, borderTop: '1px solid var(--line-soft)' }}>
              <span className="t" style={{ color: 'var(--fg)' }}>Итого</span>
              <span style={{ font: '400 26px/1 var(--font-display)' }}>1 420 ₽</span>
            </div>
            <button className="btn btn-primary btn-lg" style={{ width: '100%' }}>Оформить заказ <Icon name="arrowR" size={14}/></button>
          </div>
        </aside>
      </div>
    </div>
  );
}

window.ClientDesktopMap = ClientDesktopMap;
window.ClientDesktopMenu = ClientDesktopMenu;
