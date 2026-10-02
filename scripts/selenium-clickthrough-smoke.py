#!/usr/bin/env python3
"""Focused Selenium clickthrough checks for the public LifeTech flow."""

from __future__ import annotations

import argparse
import os
from urllib.parse import urljoin, urlsplit, parse_qs

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


def new_driver(selenium_url: str, width: int, height: int) -> webdriver.Remote:
    options = Options()
    if os.environ.get("SELENIUM_HEADLESS", "true").lower() != "false":
        options.add_argument("--headless=new")
    options.add_argument(f"--window-size={width},{height}")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument("--no-sandbox")
    options.set_capability("acceptInsecureCerts", True)
    driver = webdriver.Remote(command_executor=selenium_url, options=options)
    if width <= 760:
        driver.execute_cdp_cmd(
            "Emulation.setDeviceMetricsOverride",
            {"width": width, "height": height, "deviceScaleFactor": 2, "mobile": True},
        )
    driver.set_page_load_timeout(45)
    driver.set_script_timeout(45)
    return driver


def settle(driver: webdriver.Remote) -> None:
    WebDriverWait(driver, 30).until(lambda d: d.execute_script("return document.readyState") == "complete")


def visible_text(driver: webdriver.Remote) -> str:
    return " ".join((driver.find_element(By.TAG_NAME, "body").text or "").split())


def assert_no_broken_images(driver: webdriver.Remote, label: str) -> None:
    WebDriverWait(driver, 30).until(
        lambda d: d.execute_script("return Array.from(document.images).every(img => img.complete)")
    )
    broken = driver.execute_script(
        """
        return Array.from(document.images)
          .map((img) => ({
            src: img.currentSrc || img.src,
            complete: img.complete,
            width: img.naturalWidth,
            height: img.naturalHeight,
          }))
          .filter((img) => !img.complete || img.width === 0);
        """
    )
    if broken:
        raise AssertionError(f"{label}: broken images: {broken}")


def assert_no_overflow(driver: webdriver.Remote, label: str) -> None:
    metrics = driver.execute_script(
        """
        const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        return { innerWidth, scrollWidth, overflow: scrollWidth > innerWidth + 2 };
        """
    )
    if metrics["overflow"]:
        raise AssertionError(f"{label}: horizontal overflow: {metrics}")


def open_page(driver: webdriver.Remote, base_url: str, path: str, expected_text: str) -> None:
    driver.get(urljoin(base_url, path))
    settle(driver)
    WebDriverWait(driver, 30).until(lambda d: expected_text in visible_text(d) or expected_text in d.title)
    assert_no_broken_images(driver, path)
    assert_no_overflow(driver, path)


def click_link(driver: webdriver.Remote, text: str) -> None:
    def find_target():
        return driver.execute_script(
            """
            const needle = arguments[0].toLowerCase();
            return Array.from(document.querySelectorAll('a, button'))
              .find((el) => [
                el.textContent,
                el.getAttribute('aria-label'),
                el.getAttribute('href')
              ].filter(Boolean).join(' ').trim().replace(/\\s+/g, ' ').toLowerCase().includes(needle));
            """,
            text,
        )

    element = find_target()
    if not element:
        driver.execute_script(
            """
            const toggle = document.querySelector('.nav-toggle');
            if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
            """
        )
        element = find_target()
    if not element and text.lower() in {"login", "member login"}:
        element = driver.execute_script(
            """
            return Array.from(document.querySelectorAll('a'))
              .find((link) => (link.getAttribute('href') || '').includes('/users/login'));
            """
        )
    if not element:
        raise AssertionError(f"Missing click target: {text}")
    driver.execute_script("arguments[0].click()", element)
    settle(driver)


def click_current_login(driver: webdriver.Remote) -> None:
    element = driver.execute_script(
        """
        const toggle = document.querySelector('.nav-toggle');
        if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
        return Array.from(document.querySelectorAll('a'))
          .find((link) => (link.getAttribute('href') || '').includes('/users/login'));
        """
    )
    if not element:
        raise AssertionError("Missing login link")
    driver.execute_script("arguments[0].click()", element)
    settle(driver)


def assert_tenant_login(driver: webdriver.Remote, base_url: str) -> None:
    tenant = driver.execute_async_script("""
        const done = arguments[arguments.length - 1];
        fetch('/api/org/api/portal/tenant').then(response => {
          if (!response.ok) throw new Error(`Tenant lookup: ${response.status}`);
          return response.json();
        }).then(done).catch(error => done({error: String(error)}));
    """)
    if tenant.get('error') or not tenant.get('name'):
        raise AssertionError(f"Tenant configuration unavailable: {tenant}")
    WebDriverWait(driver, 45).until(
        lambda d: f"Welcome to {tenant['name']}" in visible_text(d)
    )
    if urlsplit(driver.current_url).netloc != urlsplit(base_url).netloc:
        raise AssertionError(f"Login left its tenant: {driver.current_url}")
    assert_no_broken_images(driver, "login")
    for label in ('Continue with email', 'Continue with Google', 'Continue with GitHub'):
        links = driver.find_elements(By.XPATH, f"//a[@aria-label='{label}' or normalize-space(.)='{label}']")
        if len(links) != 1:
            raise AssertionError(f"Missing sign-in option: {label}")
        target = urlsplit(links[0].get_attribute('href'))
        if target.netloc != urlsplit(base_url).netloc or target.path != '/pidp/auth/sso/start':
            raise AssertionError(f"Sign-in bypasses tenant PIdP proxy: {target.geturl()}")
        callback = urlsplit(parse_qs(target.query).get('next', [''])[0])
        if callback.netloc != urlsplit(base_url).netloc or callback.path != '/auth/callback':
            raise AssertionError(f"Sign-in callback lost tenant: {callback.geturl()}")


def run(base_url: str, selenium_url: str) -> None:
    driver = new_driver(selenium_url, 390, 844)
    try:
        open_page(driver, base_url, "/", "Better care starts")
        click_link(driver, "Start Here")
        WebDriverWait(driver, 30).until(lambda d: "Pick the first move" in visible_text(d))
        assert_no_broken_images(driver, "start clickthrough")

        driver.get(urljoin(base_url, "/calendar"))
        settle(driver)
        WebDriverWait(driver, 30).until(lambda d: "General Calendar" in visible_text(d))
        assert_no_broken_images(driver, "calendar redirect")

        driver.get(urljoin(base_url, "/"))
        settle(driver)
        click_current_login(driver)
        assert_tenant_login(driver, base_url)
    finally:
        driver.quit()



def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="https://lifetech.fyi")
    parser.add_argument("--selenium-url", default="http://127.0.0.1:4445/wd/hub")
    args = parser.parse_args()
    run(args.base_url.rstrip("/") + "/", args.selenium_url)
    print("Selenium clickthrough smoke passed")


if __name__ == "__main__":
    main()
