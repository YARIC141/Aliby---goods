#!/usr/bin/env python3
"""
Take Play Store screenshots of alliby.ru.
Run with credentials for full set:
  $env:ALLIBY_EMAIL="your@email"; $env:ALLIBY_PASSWORD="yourpwd"; python make_screenshots.py
"""

from playwright.sync_api import sync_playwright
import os, time

OUT_DIR = os.path.join(os.path.dirname(__file__), 'screenshots')
os.makedirs(OUT_DIR, exist_ok=True)

BASE  = 'https://alliby.ru'
EMAIL = os.environ.get('ALLIBY_EMAIL', '')
PWD   = os.environ.get('ALLIBY_PASSWORD', '')

VIEWPORT = {'width': 390, 'height': 844}
SCALE    = 3

def shot(page, fname, desc):
    out = os.path.join(OUT_DIR, fname)
    page.screenshot(path=out)
    kb = os.path.getsize(out) // 1024
    print(f'  {fname}  {kb} KB  {desc}')

def dismiss(page):
    for sel in ['button:has-text("Пропустить")', 'button:has-text("Понятно")',
                '.modal-x', 'button:has-text("Закрыть")']:
        try:
            b = page.locator(sel).first
            if b.is_visible(timeout=600):
                b.click(); time.sleep(0.5)
        except Exception:
            pass

def load(page):
    try:
        page.goto(BASE, wait_until='networkidle', timeout=25000)
    except Exception:
        pass
    time.sleep(2.5)
    dismiss(page)

def click_nav(page, label):
    """Click bottom nav button by label text."""
    try:
        page.locator(f'.bn-btn:has-text("{label}"), .nav-btn:has-text("{label}")').first.click(timeout=3000)
        time.sleep(1.5); dismiss(page)
        return True
    except Exception:
        return False

def login(page):
    if not EMAIL or not PWD:
        return False
    try:
        click_nav(page, 'Профиль') or page.evaluate("if(typeof goTo==='function') goTo('profile')")
        time.sleep(1)
        page.locator('#li-email, input[type="email"]').first.fill(EMAIL, timeout=5000)
        page.locator('#li-pwd, input[type="password"]').first.fill(PWD, timeout=5000)
        page.locator('button:has-text("Войти")').first.click(timeout=5000)
        time.sleep(3.5); dismiss(page)
        # Check if login succeeded
        logged = page.evaluate("!!window.S?.session")
        return logged
    except Exception as e:
        print(f'  login error: {e}'); return False


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport=VIEWPORT, device_scale_factor=SCALE,
        user_agent='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        locale='ru-RU',
    )
    page = ctx.new_page()
    load(page)

    # ── Try to log in if credentials given ───────────────────────────────────
    authed = login(page)
    if authed:
        print('  Logged in successfully')
    else:
        print('  No auth — shooting public screens')

    # ── 1. Stores list ────────────────────────────────────────────────────────
    # Try nav button click first (works without auth), fallback to goTo
    ok = click_nav(page, 'Заведения')
    if not ok:
        page.evaluate("if(typeof goTo==='function') goTo('stores')")
        time.sleep(1.5); dismiss(page)
    shot(page, '01_stores.png', 'Список заведений с картой')

    # ── 2. Open first store ───────────────────────────────────────────────────
    try:
        page.locator('.sl-item').first.click(timeout=5000)
        time.sleep(2.5); dismiss(page)
        shot(page, '02_store.png', 'Страница заведения')

        # Scroll to see menu items
        page.mouse.wheel(0, 350)
        time.sleep(0.8)
        shot(page, '03_menu_items.png', 'Меню / товары заведения')
    except Exception as e:
        print(f'  store open failed: {e}')

    # ── 3. Profile screen ─────────────────────────────────────────────────────
    click_nav(page, 'Профиль') or page.evaluate("if(typeof goTo==='function') goTo('profile')")
    time.sleep(1.5); dismiss(page)
    # Scroll to support section
    page.evaluate("document.querySelector('.pb') && document.querySelector('.pb').scrollTo(0, 400)")
    time.sleep(0.5)
    shot(page, '04_profile.png', 'Профиль — поддержка и документы')

    # ── 4. Orders screen (if authed) ─────────────────────────────────────────
    if authed:
        click_nav(page, 'Заказы') or page.evaluate("if(typeof goTo==='function') goTo('calenabs')")
        time.sleep(1.5); dismiss(page)
        shot(page, '05_orders.png', 'Заказы и записи')

        # Notifications bell
        try:
            page.evaluate("if(typeof openPromoNotifs==='function') openPromoNotifs()")
            time.sleep(1)
            shot(page, '06_notifications.png', 'Уведомления')
        except Exception:
            pass
    else:
        print('\n  Run with credentials for orders/notifications screens:')
        print('  $env:ALLIBY_EMAIL="email"; $env:ALLIBY_PASSWORD="pwd"; python make_screenshots.py')

    page.close()
    browser.close()

print(f'\nSaved to: {OUT_DIR}')
