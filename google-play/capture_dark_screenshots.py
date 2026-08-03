"""
Захват скриншотов тёмной темы для Google Play Store.
Перед запуском: вставьте email/пароль ниже.
Запуск: python capture_dark_screenshots.py
"""
import asyncio
import os
from playwright.async_api import async_playwright

# === НАСТРОЙКИ ===
EMAIL    = "yarich92@gmail.com"
PASSWORD = "overlord1"

OUT_DIR = r"C:\Users\Yarich\Desktop\Aliby - foods\google-play\screenshots"

# Размер вьюпорта (393×852 × 3 = 1179×2556 px — подходит для Google Play)
VP_W, VP_H, SCALE = 393, 852, 3

APP_URL = "https://alliby.ru"

# ─── helpers ─────────────────────────────────────────────────────────────────

async def shot(page, name, wait_ms=800):
    await page.wait_for_timeout(wait_ms)
    path = os.path.join(OUT_DIR, f"dark_{name}.png")
    await page.screenshot(path=path, full_page=False,
                          clip={"x": 0, "y": 0, "width": VP_W, "height": VP_H})
    print(f"  OK  dark_{name}.png")

async def wait_screen(page, screen_id, timeout=12000):
    await page.wait_for_selector(f"#{screen_id}.active", timeout=timeout)

# ─── main ─────────────────────────────────────────────────────────────────────

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=["--lang=ru"])
        ctx = await browser.new_context(
            viewport={"width": VP_W, "height": VP_H},
            device_scale_factor=SCALE,
            locale="ru-RU",
        )

        # Предустанавливаем состояние до загрузки страницы
        await ctx.add_init_script("""
            localStorage.setItem('alliby_theme', 'dark');
            localStorage.setItem('alliby_city', 'Самара');
            localStorage.setItem('alliby_launched', '1');
        """)

        page = await ctx.new_page()

        # Перехватываем консольные ошибки для диагностики
        page.on("console", lambda m: print(f"  [console {m.type}] {m.text[:120]}") if m.type in ("error","warning") else None)

        print("Открываю приложение…")
        await page.goto(APP_URL, wait_until="load")
        await page.wait_for_timeout(5000)   # ждём инициализацию Supabase

        # Диагностика: что сейчас активно?
        active = await page.evaluate("""
            () => {
                const s = document.querySelector('.screen.active');
                return s ? s.id : 'none';
            }
        """)
        print(f"  Активный экран: {active}")

        # Если ни один экран не активен — делаем скриншот для диагностики и выходим
        if active == 'none':
            await page.screenshot(path=os.path.join(OUT_DIR, '_debug.png'), full_page=False)
            print("  Скриншот _debug.png сохранён. Нет активных экранов — проверьте JS-ошибки выше.")
            await browser.close()
            return
        await page.wait_for_timeout(1500)   # даём карте/данным загрузиться

        is_auth = await page.is_visible("#screen-auth.active")

        if is_auth:
            # ── 1. Экран входа ────────────────────────────────────────────────
            print("1/5  Экран входа")
            await shot(page, "01_home", wait_ms=600)

            # ── 2. Авторизация ────────────────────────────────────────────────
            print("Вхожу в аккаунт…")
            await page.fill("#li-email", EMAIL)
            await page.fill("#li-pwd",   PASSWORD)
            await page.click("#login-btn")
            await wait_screen(page, "screen-map", timeout=25000)
            await page.wait_for_timeout(1500)
            print("  Авторизован.")
        else:
            # Сессия уже активна — сохраним токен до перехода на auth
            saved_session = await page.evaluate("() => localStorage.getItem('alliby_s')")

            print("1/5  Экран входа (переход через goTo)")
            await page.evaluate("goTo('auth')")
            await wait_screen(page, "screen-auth", timeout=8000)
            await shot(page, "01_home", wait_ms=600)

            # Переходим обратно на карту (SW может перезагрузить страницу — перехватываем)
            try:
                await page.evaluate("goTo('map')")
                await wait_screen(page, "screen-map", timeout=8000)
            except Exception:
                print("  Страница перезагрузилась — восстанавливаю сессию...")
                # Ждём новую загрузку
                await page.wait_for_load_state("domcontentloaded")
                await page.wait_for_timeout(2000)
                # Восстанавливаем сессию
                if saved_session:
                    await page.evaluate(
                        f"localStorage.setItem('alliby_s', {repr(saved_session)}); "
                        "localStorage.setItem('alliby_city', 'Самара'); "
                        "localStorage.setItem('alliby_theme', 'dark');"
                    )
                    await page.evaluate("location.reload()")
                    await page.wait_for_load_state("load")
                    await page.wait_for_timeout(4000)
                await wait_screen(page, "screen-map", timeout=12000)

            await page.wait_for_timeout(1500)
            print("  Уже авторизован.")

        # ── 3. Список заведений + карта ───────────────────────────────────────
        print("2/5  Список заведений")
        # Ждём пока загрузится хотя бы одна карточка заведения
        await page.wait_for_selector(".sl-item", timeout=15000)
        await shot(page, "01_login", wait_ms=1500)

        # ── 4. Модальное окно выбора адреса (карта) ───────────────────────────
        print("3/5  Карта выбора адреса")
        await page.evaluate("openAddressPicker()")
        await page.wait_for_selector("#m-addr-pick.open", timeout=8000)
        await shot(page, "02_catalog", wait_ms=2500)   # карта успевает загрузиться

        # Закрыть модалку
        await page.evaluate("closeModal('m-addr-pick')")
        await page.wait_for_timeout(400)

        # ── 5. Страница заведения ─────────────────────────────────────────────
        print("4/5  Страница заведения")
        await page.click(".sl-item")          # первое заведение в списке
        await wait_screen(page, "screen-store", timeout=10000)
        await shot(page, "02_store", wait_ms=1500)

        # ── 6. Сетка позиций меню ─────────────────────────────────────────────
        # 03_menu_items — это screen-store, прокрученный вниз до раздела товаров
        # (goTo('menu') внутри алиасируется в 'store', login не нужен)
        print("5/5  Позиции меню")
        # Уже на экране заведения — ждём загрузки товаров и скроллируем к ним
        await page.wait_for_selector(".item-card, #menu-items .loading", timeout=15000)
        await page.wait_for_timeout(2000)   # ждём пока пропадёт «Загрузка…»
        # Скроллируем до раздела «Товары и Услуги»
        await page.evaluate("""
            const el = document.querySelector('#screen-store .items-grid, #menu-items');
            if (el) el.scrollIntoView({behavior: 'instant', block: 'start'});
            const scr = document.getElementById('screen-store');
            if (scr) scr.scrollTop = scr.scrollHeight;
        """)
        await shot(page, "03_menu_items", wait_ms=1200)

        print(f"\nГотово! Файлы сохранены в:\n  {OUT_DIR}")
        await browser.close()

asyncio.run(main())
