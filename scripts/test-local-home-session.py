#!/usr/bin/env python3
"""Check static-site account state against the real local Docker PIdP and portal."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = 'https://localhost:8443'
SITE = Path(__file__).resolve().parents[1] / 'dist-lifetech'
ACCOUNT = Path(__file__).resolve().parents[2] / 'OrgPortal/.local/session-test/availability-bot.json'
credentials = json.loads(ACCOUNT.read_text())
KEY = 'orgportal.auth.accessToken'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    try:
        context = browser.new_context(ignore_https_errors=True)
        def local_only(route):
            url = urlparse(route.request.url)
            if url.hostname != 'localhost':
                route.abort()
                return
            path = 'index.html' if url.path == '/' else url.path.lstrip('/')
            file = (SITE / path).resolve()
            if file.is_relative_to(SITE.resolve()) and file.is_file():
                route.fulfill(path=str(file), content_type=mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
            else:
                route.continue_()
        context.route('**/*', local_only)
        assert context.request.get(BASE + '/pidp/health').json()['status'] == 'ok'
        assert context.request.get(BASE + '/api/org/health').ok
        def login():
            response = context.request.post(BASE + '/pidp/auth/session/login', form={'username': credentials['email'], 'password': credentials['password']}, headers={'Origin': BASE})
            assert response.ok, response.status
        login()
        page = context.new_page()
        page.goto(BASE + '/availability')
        expect(page.get_by_role('button', name='Open user menu')).to_be_visible(timeout=30000)
        assert page.evaluate('(key)=>!!localStorage.getItem(key)', KEY)
        # Reproduce the difference between a token-backed portal and cookie-only home.
        context.clear_cookies()
        assert context.request.get(BASE + '/pidp/auth/session-token').status == 401
        page.goto(BASE + '/')
        profile = page.get_by_role('link', name='Profile: ' + credentials['full_name'], exact=True)
        expect(profile).to_be_visible()
        expect(page.locator('a[href="/users/login"]')).to_have_count(0)
        assert context.request.get(BASE + '/pidp/auth/session-token').status == 401
        profile.click()
        expect(page.get_by_role('button', name='Open user menu')).to_be_visible(timeout=30000)
        page.goto(BASE + '/')
        expect(profile).to_be_visible()
        page.get_by_label('Account menu', exact=True).click()
        page.get_by_role('button', name='Sign out', exact=True).click()
        expect(page.locator('.account-login')).to_be_visible()
        assert not page.evaluate('(key)=>!!localStorage.getItem(key)', KEY)
        assert context.request.get(BASE + '/pidp/auth/session-token').status == 401
        # A restored page must notice a real cookie created after its initial render.
        login()
        page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}))")
        expect(profile).to_be_visible()
        # Losing both credentials must restore the guest display on focus.
        context.clear_cookies()
        page.evaluate('(key)=>localStorage.removeItem(key)', KEY)
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.locator('.account-login')).to_be_visible()
        # An untrusted cached token cannot fake a signed-in account.
        page.evaluate('(key)=>localStorage.setItem(key,"invalid-token")', KEY)
        page.reload()
        expect(page.locator('.account-login')).to_be_visible()
        expect(page.locator('.account-avatar')).to_have_count(0)
        page.wait_for_function('(key)=>localStorage.getItem(key)===null', arg=KEY)
        print('PASS: portal → home → profile persistence, cookie-only restoration, page restore/focus, logout, and invalid-token rejection using local Docker accounts')
        context.close()
    finally:
        browser.close()
