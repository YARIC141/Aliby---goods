#!/usr/bin/env python3
"""
Play Store screenshots for Alliby Business (admin app).

1. Creates a throwaway demo business-owner account via the `admin-register`
   edge function (instant, pre-confirmed — no email-confirmation step needed).
2. Seeds a small demo store (2 categories, 7 menu items, 3 orders in
   different statuses, an active platform subscription) and a throwaway
   customer account (so orders show a real buyer email) directly via the
   Supabase service-role REST API.
3. Captures 5 key screens in light and dark theme with Playwright.
4. Deletes everything (store, menu, orders, subscription, both accounts).

Run:
  $env:ALLIBY_SERVICE_ROLE_KEY="..."; python make_screenshots.py
"""

import os
import time
import json
import urllib.request
import urllib.error
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.join(os.path.dirname(__file__), 'screenshots')
os.makedirs(OUT_DIR, exist_ok=True)

BASE = 'https://admin.alliby.ru'
SB_URL = 'https://alliby.ru'
SERVICE_KEY = os.environ.get('ALLIBY_SERVICE_ROLE_KEY', '')
VP_W, VP_H, SCALE = 393, 852, 3
TEST_PWD = "Screenshot123!"


def api(method, path, body=None):
    headers = {
        "Content-Type": "application/json",
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
    }
    if method in ("POST", "PATCH"):
        headers["Prefer"] = "return=representation"
    req = urllib.request.Request(
        SB_URL + path,
        data=json.dumps(body).encode() if body is not None else None,
        method=method, headers=headers,
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode()}")


def create_customer(email):
    return api("POST", "/auth/v1/admin/users", {
        "email": email, "password": TEST_PWD, "email_confirm": True,
    })


def delete_user(user_id):
    try:
        api("DELETE", f"/auth/v1/admin/users/{user_id}")
    except Exception as e:
        print(f"  WARN: failed to delete user {user_id}: {e}")


def register_owner(email):
    req = urllib.request.Request(
        SB_URL + "/functions/v1/admin-register",
        data=json.dumps({
            "email": email, "password": TEST_PWD, "full_name": "Демо Владельцев",
        }).encode(),
        method="POST", headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def seed(owner_id, customer_id):
    today = date.today()
    end = today + timedelta(days=30)

    store = api("POST", "/rest/v1/stores", {
        "name": "Кофейня «Полдень»", "address": "ул. Ленинградская, 55",
        "latitude": 53.1959, "longitude": 50.1000, "phone": "+7 900 111-22-33",
        "owner_user_id": owner_id, "direction": "food", "city": "Самара",
        "payment_provider": "none", "payment_test_mode": True, "is_visible": True,
    })[0]
    store_id = store["id"]

    cat1 = api("POST", "/rest/v1/categories", {"name": "Кофе", "store_id": store_id})[0]
    cat2 = api("POST", "/rest/v1/categories", {"name": "Выпечка", "store_id": store_id})[0]

    items1 = api("POST", "/rest/v1/menu_items", [
        {"store_id": store_id, "category_id": cat1["id"], "name": "Капучино", "price": 220, "is_available": True, "preparation_time": 5},
        {"store_id": store_id, "category_id": cat1["id"], "name": "Латте", "price": 240, "is_available": True, "preparation_time": 5},
        {"store_id": store_id, "category_id": cat1["id"], "name": "Американо", "price": 180, "is_available": True, "preparation_time": 4},
        {"store_id": store_id, "category_id": cat1["id"], "name": "Раф кокосовый", "price": 280, "is_available": True, "preparation_time": 6},
    ])
    items2 = api("POST", "/rest/v1/menu_items", [
        {"store_id": store_id, "category_id": cat2["id"], "name": "Круассан с миндалём", "price": 210, "is_available": True, "preparation_time": 3},
        {"store_id": store_id, "category_id": cat2["id"], "name": "Чизкейк Нью-Йорк", "price": 260, "is_available": True, "preparation_time": 2},
        {"store_id": store_id, "category_id": cat2["id"], "name": "Синнабон", "price": 230, "is_available": True, "preparation_time": 3},
    ])

    api("POST", "/rest/v1/platform_subscriptions", {
        "user_id": owner_id, "plan": "monthly", "status": "active", "plan_type": "platform",
        "start_date": today.isoformat(), "end_date": end.isoformat(),
        "amount_paid": 1600, "is_trial": False, "auto_renew": True,
        "monthly_amount_kopecks": 160000, "extra_stores": 0,
    })

    def mk_order(status, is_delivery, picks):
        total = sum(p["price"] * p["qty"] for p in picks) + (150 if is_delivery else 0)
        order = api("POST", "/rest/v1/orders", {
            "user_id": customer_id, "store_id": store_id, "total_amount": total,
            "status": status, "payment_method": "card",
            "is_delivery": is_delivery, "delivery_fee": 150 if is_delivery else 0,
            "delivery_address": "ул. Молодогвардейская, 12, кв. 45" if is_delivery else None,
        })[0]
        api("POST", "/rest/v1/order_items", [
            {"order_id": order["id"], "menu_item_id": p["id"], "quantity": p["qty"], "price_at_time": p["price"], "selected_options": []}
            for p in picks
        ])

    mk_order("paid", False, [{"id": items1[0]["id"], "price": 220, "qty": 2}, {"id": items2[0]["id"], "price": 210, "qty": 1}])
    mk_order("in_progress", True, [{"id": items1[1]["id"], "price": 240, "qty": 1}, {"id": items2[1]["id"], "price": 260, "qty": 2}])
    mk_order("ready", False, [{"id": items1[2]["id"], "price": 180, "qty": 3}])

    return store_id


def cleanup(store_id, owner_id, customer_id):
    try:
        if store_id:
            api("DELETE", f"/rest/v1/orders?store_id=eq.{store_id}")
            api("DELETE", f"/rest/v1/menu_items?store_id=eq.{store_id}")
            api("DELETE", f"/rest/v1/categories?store_id=eq.{store_id}")
            api("DELETE", f"/rest/v1/stores?id=eq.{store_id}")
        if owner_id:
            api("DELETE", f"/rest/v1/platform_subscriptions?user_id=eq.{owner_id}")
            delete_user(owner_id)
        if customer_id:
            delete_user(customer_id)
    except Exception as e:
        print(f"  WARN during cleanup: {e}")


def shot(page, name, theme):
    path = os.path.join(OUT_DIR, f"{theme}_{name}.png")
    page.screenshot(path=path, clip={"x": 0, "y": 0, "width": VP_W, "height": VP_H})
    print(f"  OK  {theme}_{name}.png")


def run_pass(p, dark):
    theme = "dark" if dark else "light"
    ts = int(time.time())
    owner_email = f"business.screenshots.{theme}.{ts}@aliby-test.ru"
    customer_email = f"business.customer.{theme}.{ts}@aliby-test.ru"
    print(f"\n=== {theme} pass ===")

    customer = create_customer(customer_email)
    owner_session = register_owner(owner_email)
    owner_id = owner_session["user"]["id"]
    print(f"  Created owner {owner_email} ({owner_id}) and customer {customer_email}")

    store_id = seed(owner_id, customer["id"])
    print(f"  Seeded demo store {store_id}")

    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport={"width": VP_W, "height": VP_H},
        device_scale_factor=SCALE,
        locale="ru-RU",
        user_agent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    )
    ctx.add_init_script("localStorage.setItem('alliby_theme', %r);" % theme)
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())

    try:
        # 1. Auth screen (no session yet — clean login form)
        page.goto(BASE, wait_until="networkidle", timeout=25000)
        time.sleep(1.5)
        page.wait_for_selector("#screen-auth.active", timeout=15000)
        shot(page, "01_auth", theme)

        # 2. Inject session + preferred city, then reload straight into the app
        session_json = json.dumps(owner_session)
        page.evaluate(
            "(s) => { localStorage.setItem('alliby_admin_s', s); "
            "localStorage.setItem('alliby_admin_city', 'Самара'); }",
            session_json,
        )
        page.reload(wait_until="networkidle", timeout=25000)
        page.wait_for_selector("#screen-stores.active", timeout=20000)
        time.sleep(1.5)
        shot(page, "02_stores", theme)

        # 3. Menu (Товары и услуги)
        page.click('.bn-btn[data-nav="menu"]')
        page.wait_for_selector("#screen-menu.active", timeout=10000)
        time.sleep(1.2)
        shot(page, "03_menu", theme)

        # 4. Orders (Заказы и записи)
        page.click('.bn-btn[data-nav="orders"]')
        page.wait_for_selector("#screen-orders.active", timeout=10000)
        time.sleep(1.5)
        shot(page, "04_orders", theme)

        # 5. Subscription (Подписка)
        page.click('.bn-btn[data-nav="subscription"]')
        page.wait_for_selector("#screen-subscription.active", timeout=10000)
        time.sleep(1.2)
        shot(page, "05_subscription", theme)
    finally:
        page.close()
        browser.close()
        cleanup(store_id, owner_id, customer["id"])
        print(f"  Cleaned up {theme} pass")


if not SERVICE_KEY:
    raise SystemExit(
        "Set ALLIBY_SERVICE_ROLE_KEY env var first, e.g.:\n"
        '  $env:ALLIBY_SERVICE_ROLE_KEY="..."; python make_screenshots.py'
    )

with sync_playwright() as p:
    run_pass(p, dark=False)
    run_pass(p, dark=True)

print(f"\nSaved to: {OUT_DIR}")
