#!/usr/bin/env python3
"""Focused Selenium clickthrough checks for the public MedTech flow."""

from __future__ import annotations

import argparse
from urllib.parse import urljoin

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


def new_driver(selenium_url: str, width: int, height: int) -> webdriver.Remote:
    options = Options()
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
    element = driver.execute_script(
        """
        const needle = arguments[0].toLowerCase();
        return Array.from(document.querySelectorAll('a, button'))
          .find((el) => el.textContent.trim().replace(/\\s+/g, ' ').toLowerCase().includes(needle));
        """,
        text,
    )
    if not element:
        raise AssertionError(f"Missing click target: {text}")
    driver.execute_script("arguments[0].click()", element)
    settle(driver)


def simulate_login(driver: webdriver.Remote, base_url: str) -> None:
    driver.get(urljoin(base_url, "/users/login"))
    settle(driver)
    WebDriverWait(driver, 45).until(lambda d: "Welcome to Baltimore MedTech" in visible_text(d))
    if "portalProfile=baltimore-medtech" not in driver.current_url:
        raise AssertionError(f"Login did not pick the MedTech tenant profile: {driver.current_url}")
    assert_no_broken_images(driver, "login")

    form_count = driver.execute_script("return document.querySelectorAll('form').length")
    if form_count < 1:
        raise AssertionError("Login page did not expose an email/password form")

    submitted = driver.execute_script(
        """
        const form = Array.from(document.querySelectorAll('form'))
          .find((candidate) => candidate.querySelector('input[type="password"]'));
        if (!form) return { ok: false, reason: 'missing password form' };
        for (const input of form.querySelectorAll('input')) {
          const key = `${input.name} ${input.id} ${input.placeholder} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
          if (input.type === 'email' || key.includes('email')) input.value = 'selenium.invalid@example.com';
          if (input.type === 'password' || key.includes('password')) input.value = 'not-a-real-password-123';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const button = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
        if (!button) return { ok: false, reason: 'missing submit button' };
        button.click();
        return { ok: true, label: button.textContent || button.value || '' };
        """
    )
    if not submitted["ok"]:
        raise AssertionError(f"Login form could not be submitted: {submitted}")

    WebDriverWait(driver, 15).until(
        lambda d: "Member login" in visible_text(d)
        or "invalid" in visible_text(d).lower()
        or "incorrect" in visible_text(d).lower()
        or "failed" in visible_text(d).lower()
    )
    if "Page not found" in visible_text(driver):
        raise AssertionError("Fake login routed to Page not found")


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
        click_link(driver, "Member login")
        WebDriverWait(driver, 45).until(lambda d: "Welcome to Baltimore MedTech" in visible_text(d))
        assert_no_broken_images(driver, "member login clickthrough")
    finally:
        driver.quit()

    driver = new_driver(selenium_url, 390, 844)
    try:
        simulate_login(driver, base_url)
    finally:
        driver.quit()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="https://medtech.social")
    parser.add_argument("--selenium-url", default="http://127.0.0.1:4445/wd/hub")
    args = parser.parse_args()
    run(args.base_url.rstrip("/") + "/", args.selenium_url)
    print("Selenium clickthrough smoke passed")


if __name__ == "__main__":
    main()
