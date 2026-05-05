// Brandbook page — palette, type, components, logos
// Renders into a fixed 1280×auto card. Uses Aliby tokens via parent.

function Swatch({ name, value, dark }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        height: 80, borderRadius: 'var(--r-3)', background: value,
        border: '1px solid var(--line-soft)', boxShadow: 'var(--shadow-1)',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, alignItems: 'baseline' }}>
        <span style={{ font: '500 12px/1 var(--font-sans)', color: 'var(--fg)' }}>{name}</span>
        <span className="mono" style={{ font: '400 10px/1 var(--font-mono)', color: 'var(--fg-4)' }}>{value}</span>
      </div>
    </div>
  );
}

function BBSection({ title, kicker, children, span = 12 }) {
  return (
    <section style={{ gridColumn: `span ${span}`, padding: 'var(--sp-6)',
      background: 'var(--bg-1)', border: '1px solid var(--line-soft)', borderRadius: 'var(--r-4)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--sp-5)' }}>
        <h3 style={{ font: '400 28px/1 var(--font-display)', letterSpacing: '-0.01em', color: 'var(--fg)', margin: 0 }}>{title}</h3>
        {kicker && <span className="mono" style={{ font: '500 10px/1 var(--font-mono)', color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: '.12em' }}>{kicker}</span>}
      </div>
      {children}
    </section>
  );
}

function Brandbook() {
  return (
    <div style={{
      width: 1280, padding: 'var(--sp-7)',
      background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Hero */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        padding: 'var(--sp-9) var(--sp-7)',
        borderRadius: 'var(--r-4)', marginBottom: 'var(--sp-6)',
        border: '1px solid var(--line-soft)',
        background: 'radial-gradient(120% 80% at 80% -10%, oklch(from var(--accent) l c h / .18) 0, transparent 60%), var(--bg-1)',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.5,
          background: 'radial-gradient(circle at 1px 1px, var(--grid-dot) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }} />
        <div style={{ position: 'relative' }}>
          <div className="hstack" style={{ gap: 'var(--sp-3)', marginBottom: 'var(--sp-6)' }}>
            <span className="mono" style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg-3)', letterSpacing: '.16em', textTransform: 'uppercase' }}>BRAND BOOK</span>
            <span style={{ height: 1, flex: 1, background: 'var(--line-soft)' }} />
            <span className="mono" style={{ font: '500 11px/1 var(--font-mono)', color: 'var(--fg-4)' }}>v1.0 — 2026</span>
          </div>
          <h1 style={{ font: '400 96px/0.95 var(--font-display)', letterSpacing: '-0.02em', margin: '0 0 var(--sp-4)' }}>
            Aliby<span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
          <p style={{ font: '400 22px/1.4 var(--font-display)', color: 'var(--fg-2)', maxWidth: 720, margin: 0, fontStyle: 'italic' }}>
            Если возникнут подозрения — у тебя есть Aliby. Доказательство вкуса, теплоты и уверенности — в каждом заведении.
          </p>
        </div>
      </div>

      {/* 12-col grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 'var(--sp-5)' }}>

        {/* Logo */}
        <BBSection title="Логотип" kicker="01 — Identity" span={8}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <div style={{ aspectRatio: '1.6', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-2)', borderRadius: 'var(--r-3)' }}>
              <AlibyMark size={120} color="var(--accent)" />
            </div>
            <div style={{ aspectRatio: '1.6', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent)', borderRadius: 'var(--r-3)' }}>
              <AlibyMark size={120} color="oklch(0.16 0.012 60)" />
            </div>
            <div style={{ aspectRatio: '1.6', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-2)', borderRadius: 'var(--r-3)' }}>
              <AlibyWordmark size={56} color="var(--fg)" />
            </div>
            <div style={{ aspectRatio: '1.6', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-2)', borderRadius: 'var(--r-3)' }}>
              <AlibyLockup size={56} tagline="food, with proof" color="var(--fg)" />
            </div>
          </div>
          <div style={{ marginTop: 'var(--sp-5)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <div className="t-sm">
              <strong style={{ color: 'var(--fg)' }}>Clear-space.</strong> Минимум — высота перекладины «A» (≈ 28% размера) со всех сторон. Точка-акцент после слова «Aliby» неприкосновенна.
            </div>
            <div className="t-sm">
              <strong style={{ color: 'var(--fg)' }}>Don't.</strong> Не вращать, не растягивать, не менять цвет точки на любой кроме акцентного. Не размещать на изображениях с низким контрастом.
            </div>
          </div>
        </BBSection>

        {/* Tagline / voice */}
        <BBSection title="Голос" kicker="02 — Voice" span={4}>
          <p style={{ font: '400 24px/1.3 var(--font-display)', fontStyle: 'italic', color: 'var(--fg)', margin: '0 0 var(--sp-4)' }}>
            «Тёплый. Точный. С чувством юмора.»
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            <li className="t-sm">— Говорим как человек, не как меню.</li>
            <li className="t-sm">— Цифры — кратко, цена — крупно.</li>
            <li className="t-sm">— Ошибки — с эмпатией, без оправданий.</li>
            <li className="t-sm">— Юмор — мягкий, никогда сарказм.</li>
          </ul>
        </BBSection>

        {/* Palette */}
        <BBSection title="Палитра" kicker="03 — Color" span={12}>
          <div className="t-sm" style={{ marginBottom: 'var(--sp-5)' }}>
            Базовая палитра в OKLCH. Все акценты делят одну хрому и светлоту, варьируется только тон. Это даёт гармоничные комбинации без подбора.
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}><span className="label">Brand</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
            <Swatch name="Ember" value="oklch(0.74 0.17 55)" />
            <Swatch name="Ember Deep" value="oklch(0.62 0.19 38)" />
            <Swatch name="Crimson" value="oklch(0.66 0.20 22)" />
            <Swatch name="Honey" value="oklch(0.86 0.13 95)" />
            <Swatch name="Ice" value="oklch(0.78 0.10 220)" />
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}><span className="label">Neutrals — Dark</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
            <Swatch name="bg" value="oklch(0.16 0.012 60)" />
            <Swatch name="bg-1" value="oklch(0.19 0.013 60)" />
            <Swatch name="bg-2" value="oklch(0.22 0.014 60)" />
            <Swatch name="bg-3" value="oklch(0.26 0.015 60)" />
            <Swatch name="line" value="oklch(0.30 0.012 60)" />
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}><span className="label">Neutrals — Light</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
            <Swatch name="bg" value="oklch(0.985 0.005 80)" />
            <Swatch name="bg-1" value="oklch(0.965 0.006 80)" />
            <Swatch name="bg-2" value="oklch(0.94 0.007 80)" />
            <Swatch name="bg-3" value="oklch(0.91 0.008 80)" />
            <Swatch name="line" value="oklch(0.82 0.008 80)" />
          </div>

          <div style={{ marginBottom: 'var(--sp-2)' }}><span className="label">Semantic</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-3)' }}>
            <Swatch name="Success" value="oklch(0.74 0.16 150)" />
            <Swatch name="Warning" value="oklch(0.82 0.16 85)" />
            <Swatch name="Error" value="oklch(0.65 0.21 25)" />
            <Swatch name="Info" value="oklch(0.72 0.13 240)" />
          </div>
        </BBSection>

        {/* Type */}
        <BBSection title="Типографика" kicker="04 — Type" span={8}>
          <div style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <span className="label">Display — Instrument Serif</span>
            <div style={{ font: '400 88px/0.95 var(--font-display)', letterSpacing: '-0.02em' }}>Eat well, <em style={{ color: 'var(--accent)' }}>often</em>.</div>
          </div>
          <div style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: 'var(--sp-4)', marginBottom: 'var(--sp-4)' }}>
            <span className="label">Sans — Geist</span>
            <div style={{ font: '300 32px/1.1 var(--font-sans)', marginBottom: 4 }}>Light · 300</div>
            <div style={{ font: '400 28px/1.1 var(--font-sans)', marginBottom: 4 }}>Regular · 400</div>
            <div style={{ font: '500 24px/1.1 var(--font-sans)', marginBottom: 4 }}>Medium · 500</div>
            <div style={{ font: '600 20px/1.1 var(--font-sans)' }}>Semibold · 600</div>
          </div>
          <div>
            <span className="label">Mono — JetBrains Mono</span>
            <div className="mono" style={{ font: '400 14px/1.5 var(--font-mono)', color: 'var(--fg-2)' }}>
              ORDER #A2-0481 · 18:42 · 4 ITEMS · ₽ 2 480
            </div>
          </div>
        </BBSection>

        <BBSection title="Шкала" kicker="05 — Scale" span={4}>
          <div className="vstack" style={{ gap: 'var(--sp-3)' }}>
            {[
              ['Display', '56 / 1.05'],
              ['H1', '36 / 1.1'],
              ['H2', '24 / 1.2'],
              ['Body', '14 / 1.5'],
              ['Caption', '12 / 1.45'],
              ['Mono', '11 / 1.4'],
            ].map(([n, v]) => (
              <div key={n} className="hstack" style={{ justifyContent: 'space-between', borderBottom: '1px dashed var(--line-soft)', paddingBottom: 6 }}>
                <span style={{ font: '500 13px/1 var(--font-sans)', color: 'var(--fg)' }}>{n}</span>
                <span className="mono" style={{ font: '400 11px/1 var(--font-mono)', color: 'var(--fg-4)' }}>{v}</span>
              </div>
            ))}
          </div>
        </BBSection>

        {/* Components */}
        <BBSection title="Компоненты" kicker="06 — UI" span={12}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-5)' }}>

            <div>
              <span className="label">Buttons</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <button className="btn btn-primary"><Icon name="plus" size={16}/> Добавить</button>
                <button className="btn">Отмена</button>
                <button className="btn btn-ghost">Подробнее</button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm">Sm</button>
                <button className="btn">Md</button>
                <button className="btn btn-lg">Lg</button>
                <button className="btn btn-icon"><Icon name="search" size={18}/></button>
              </div>
            </div>

            <div>
              <span className="label">Inputs</span>
              <input className="input" placeholder="Поиск заведений…" style={{ marginBottom: 8 }} defaultValue="" />
              <select className="input" defaultValue="">
                <option value="">Категория</option>
              </select>
            </div>

            <div>
              <span className="label">Badges</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="badge badge-ember">Активен</span>
                <span className="badge badge-ok">Оплачен</span>
                <span className="badge badge-warn">Готовится</span>
                <span className="badge badge-info">Готов</span>
                <span className="badge badge-err">Отменён</span>
                <span className="badge">Черновик</span>
              </div>
            </div>

            <div>
              <span className="label">Chips</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="chip" data-active="true">Все</button>
                <button className="chip">Завтрак</button>
                <button className="chip">Ланч</button>
                <button className="chip">Кофе</button>
              </div>
            </div>

            <div>
              <span className="label">Tabs</span>
              <div className="tabs">
                <button className="tab" data-active="true">Меню</button>
                <button className="tab">Абонементы</button>
                <button className="tab">Отзывы</button>
              </div>
            </div>

            <div>
              <span className="label">Switch</span>
              <div className="hstack" style={{ gap: 12 }}>
                <span className="switch" data-on="true" />
                <span className="switch" data-on="false" />
              </div>
            </div>

          </div>
        </BBSection>

        {/* Iconography */}
        <BBSection title="Иконография" kicker="07 — Icons" span={12}>
          <div className="t-sm" style={{ marginBottom: 'var(--sp-4)' }}>
            Лёгкая линейная сетка 24×24, обводка 1.6 px, скруглённые концы. Не смешивать с filled-иконками.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 'var(--sp-3)' }}>
            {Object.keys(ICON_PATHS).map(n => (
              <div key={n} style={{
                aspectRatio: '1', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'var(--bg-2)', borderRadius: 'var(--r-2)',
                border: '1px solid var(--line-soft)',
              }}>
                <Icon name={n} size={22} />
                <span className="mono" style={{ font: '400 9px/1 var(--font-mono)', color: 'var(--fg-4)' }}>{n}</span>
              </div>
            ))}
          </div>
        </BBSection>

        {/* Motion */}
        <BBSection title="Motion" kicker="08 — Easing" span={12}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'var(--sp-5)' }}>
            {[
              { name: 'Fast', dur: '160ms', ease: 'ease-out', use: 'hover, micro-feedback, кнопки' },
              { name: 'Medium', dur: '280ms', ease: 'cubic-bezier(.2,.7,.3,1)', use: 'появление карточек, тосты' },
              { name: 'Emphasized', dur: '480ms', ease: 'cubic-bezier(.16,.84,.32,1)', use: 'переходы экранов, shared elements' },
            ].map(m => (
              <div key={m.name} className="card" style={{ padding: 'var(--sp-4)' }}>
                <div className="h3" style={{ marginBottom: 4 }}>{m.name}</div>
                <div className="mono t-sm">{m.dur} · {m.ease}</div>
                <div className="t-sm" style={{ marginTop: 8 }}>{m.use}</div>
              </div>
            ))}
          </div>
        </BBSection>

      </div>
    </div>
  );
}

window.Brandbook = Brandbook;
