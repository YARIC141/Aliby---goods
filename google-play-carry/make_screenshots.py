#!/usr/bin/env python3
"""
Play Store screenshots for Alliby Carry.
Creates a throwaway, pre-confirmed courier test account via the Supabase
admin API (public signup needs email confirmation, which a headless script
can't click), captures the key screens in light and dark theme, then
deletes the test account via the same admin API.

Run: python make_screenshots.py
"""

import os
import time
import json
import urllib.request
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.join(os.path.dirname(__file__), 'screenshots')
os.makedirs(OUT_DIR, exist_ok=True)

BASE = 'https://carry.alliby.ru'
SB_URL = 'https://alliby.ru'
SERVICE_KEY = os.environ.get('ALLIBY_SERVICE_ROLE_KEY', '')
VP_W, VP_H, SCALE = 393, 852, 3
TEST_PWD = "Screenshot123!"


def admin_request(method, path, body=None):
    req = urllib.request.Request(
        SB_URL + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode() or "{}")


def create_test_user(email):
    return admin_request("POST", "/auth/v1/admin/users", {
        "email": email, "password": TEST_PWD, "email_confirm": True,
    })


def delete_test_user(user_id):
    admin_request("DELETE", f"/auth/v1/admin/users/{user_id}")


def shot(page, name, theme):
    path = os.path.join(OUT_DIR, f"{theme}_{name}.png")
    page.screenshot(path=path, clip={"x": 0, "y": 0, "width": VP_W, "height": VP_H})
    print(f"  OK  {theme}_{name}.png")


def run_pass(p, dark):
    theme = "dark" if dark else "light"
    test_email = f"carry.screenshots.{theme}.{int(time.time())}@aliby-test.ru"
    print(f"\n=== {theme} pass ===")

    user = create_test_user(test_email)
    user_id = user["id"]
    print(f"  Created test user {test_email} ({user_id})")

    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport={"width": VP_W, "height": VP_H},
        device_scale_factor=SCALE,
        locale="ru-RU",
        geolocation={"latitude": 53.1959, "longitude": 50.1000},  # Samara
        permissions=["geolocation"],
        user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    )
    ctx.add_init_script("localStorage.setItem('alliby_theme', %r);" % theme)
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())

    try:
        page.goto(BASE, wait_until="networkidle", timeout=25000)
        time.sleep(1.5)

        # 1. Auth screen (login tab, default)
        page.wait_for_selector("#screen-auth.active", timeout=15000)
        shot(page, "01_auth", theme)

        # 2. Log in with the pre-confirmed test account
        page.fill("#li-email", test_email)
        page.fill("#li-pwd", TEST_PWD)
        page.click("#login-btn")
        page.wait_for_selector("#screen-onboard.active", timeout=20000)
        time.sleep(1)
        shot(page, "02_onboard", theme)

        # 3. Fill onboarding form
        page.fill("#ob-name", "Иван Курьеров")
        page.fill("#ob-phone", "+7 900 123-45-67")
        page.fill("#ob-city", "Самара")
        page.fill("#ob-reward", "150")
        page.check("#ob-terms-check", force=True)
        page.click("#ob-btn")

        # 4. Courier contract modal — scroll to bottom, accept, sign
        page.wait_for_selector("#m-contract-courier.open", timeout=10000)
        time.sleep(0.5)
        page.evaluate(
            "() => { const el = document.getElementById('mcc-scroll'); "
            "el.scrollTop = el.scrollHeight; "
            "if (typeof onCourierContractScroll === 'function') onCourierContractScroll(); }"
        )
        time.sleep(0.3)
        page.check("#mcc-check", force=True)
        page.click("#mcc-sign-btn")

        # 5. Main screen — orders pane, shift on
        page.wait_for_selector("#screen-main.active", timeout=20000)
        time.sleep(1.5)
        page.evaluate(
            "() => { const el = document.getElementById('shift-toggle'); "
            "el.checked = true; el.dispatchEvent(new Event('change')); }"
        )
        time.sleep(1.5)
        shot(page, "03_main_orders", theme)

        # 6. Stats tab
        page.click('button[data-main-tab="stats"]')
        time.sleep(1)
        shot(page, "04_stats", theme)

        # 7. Profile modal
        page.click('button[title="Профиль"]')
        page.wait_for_selector("#m-profile.open", timeout=8000)
        time.sleep(0.8)
        shot(page, "05_profile", theme)
        page.click('#m-profile .modal-x')
        time.sleep(0.3)
    finally:
        page.close()
        browser.close()
        delete_test_user(user_id)
        print(f"  Deleted test user {test_email}")


if not SERVICE_KEY:
    raise SystemExit(
        "Set ALLIBY_SERVICE_ROLE_KEY env var first, e.g.:\n"
        '  $env:ALLIBY_SERVICE_ROLE_KEY="..."; python make_screenshots.py'
    )

with sync_playwright() as p:
    run_pass(p, dark=False)
    run_pass(p, dark=True)

print(f"\nSaved to: {OUT_DIR}")
