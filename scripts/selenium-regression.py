#!/usr/bin/env python3
"""Selenium regression checks for the Baltimore MedTech public site."""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
from urllib.parse import parse_qs, urlparse

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


PORTAL_URL = "https://codecollective.us/p/?portalProfile=baltimore-medtech"


def new_driver(selenium_url: str, width: int, height: int) -> webdriver.Remote:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument(f"--window-size={width},{height}")
    options.add_argument("--use-angle=swiftshader")
    options.add_argument("--use-gl=angle")
    options.add_argument("--enable-webgl")
    options.add_argument("--ignore-gpu-blocklist")
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
    driver.execute_script("window.scrollTo(0, 0)")
    WebDriverWait(driver, 10).until(lambda d: d.execute_script("return window.scrollY") == 0)


def body_excerpt(driver: webdriver.Remote) -> str:
    text = driver.find_element(By.TAG_NAME, "body").text or ""
    return " ".join(text.split())[:400]


def assert_no_horizontal_overflow(driver: webdriver.Remote, label: str) -> dict:
    metrics = driver.execute_script(
        """
        const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        return {
          innerWidth: window.innerWidth,
          scrollWidth,
          overflow: scrollWidth > window.innerWidth + 2,
          offenders: Array.from(document.querySelectorAll('body *'))
            .map((el) => {
              const box = el.getBoundingClientRect();
              return {
                tag: el.tagName.toLowerCase(),
                className: String(el.className || '').slice(0, 120),
                text: String(el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90),
                left: Math.round(box.left),
                right: Math.round(box.right),
                width: Math.round(box.width)
              };
            })
            .filter((item) => item.width > window.innerWidth || item.right > window.innerWidth + 2 || item.left < -2)
            .slice(0, 8)
        };
        """
    )
    if metrics["overflow"]:
        raise AssertionError(f"{label}: horizontal overflow detected: {metrics}")
    return metrics


def numeric_object_position_x(value: str) -> float | None:
    first = value.split()[0] if value else ""
    match = re.match(r"^([0-9.]+)%$", first)
    return float(match.group(1)) if match else None


def assert_theme_control(driver: webdriver.Remote, viewport: str, screenshot_dir: pathlib.Path) -> dict:
    metrics = driver.execute_script(
        """
        const controls = Array.from(document.querySelectorAll('.theme-option[data-theme-mode]'));
        const snapshot = () => controls.map((control) => {
          const box = control.getBoundingClientRect();
          return {
            mode: control.dataset.themeMode,
            label: control.getAttribute('aria-label'),
            pressed: control.getAttribute('aria-pressed'),
            hasIcon: !!control.querySelector('svg'),
            left: box.left,
            right: box.right
          };
        });
        const darkControl = controls.find((control) => control.dataset.themeMode === 'dark');
        darkControl.click();
        const dark = {
          mode: document.documentElement.dataset.themeMode,
          theme: document.documentElement.dataset.theme,
          stored: localStorage.getItem('bmore-medtech.theme'),
          controls: snapshot()
        };
        return {innerWidth: window.innerWidth, dark};
        """
    )
    dark_screenshot = screenshot_dir / f"{viewport}-theme-dark.png"
    driver.save_screenshot(str(dark_screenshot))

    system_metrics = driver.execute_script(
        """
        const control = document.querySelector('.theme-option[data-theme-mode="system"]');
        control.click();
        return {
          mode: document.documentElement.dataset.themeMode,
          stored: localStorage.getItem('bmore-medtech.theme'),
          pressed: control.getAttribute('aria-pressed')
        };
        """
    )
    controls = metrics["dark"]["controls"]
    if [control["mode"] for control in controls] != ["system", "light", "dark"]:
        raise AssertionError(f"{viewport}: theme control is missing a mode: {metrics}")
    if any(not control["label"] or not control["hasIcon"] for control in controls):
        raise AssertionError(f"{viewport}: theme controls need both icon and accessible name: {metrics}")
    if any(control["left"] < -1 or control["right"] > metrics["innerWidth"] + 1 for control in controls):
        raise AssertionError(f"{viewport}: theme icon is clipped outside the viewport: {metrics}")
    if metrics["dark"]["mode"] != "dark" or metrics["dark"]["theme"] != "dark" or metrics["dark"]["stored"] != "dark":
        raise AssertionError(f"{viewport}: dark theme did not apply and persist: {metrics}")
    if [control["pressed"] for control in controls] != ["false", "false", "true"]:
        raise AssertionError(f"{viewport}: dark theme icon is not the sole selected option: {metrics}")
    if system_metrics != {"mode": "system", "stored": "system", "pressed": "true"}:
        raise AssertionError(f"{viewport}: system theme did not restore correctly: {system_metrics}")

    return {**metrics, "system": system_metrics, "darkScreenshot": str(dark_screenshot)}


def assert_home(driver: webdriver.Remote, base_url: str, viewport: str, screenshot_dir: pathlib.Path) -> dict:
    driver.get(f"{base_url.rstrip('/')}/")
    settle(driver)
    WebDriverWait(driver, 20).until(lambda d: d.find_element(By.CSS_SELECTOR, ".hero-copy h1"))
    assert_no_horizontal_overflow(driver, f"{viewport} home")

    screenshot = screenshot_dir / f"{viewport}-home.png"
    driver.save_screenshot(str(screenshot))
    metrics = driver.execute_script(
        """
        const hero = document.querySelector('.hero').getBoundingClientRect();
        const copy = document.querySelector('.hero-copy').getBoundingClientRect();
        const h1 = document.querySelector('.hero-copy h1').getBoundingClientRect();
        const header = document.querySelector('.site-header').getBoundingClientRect();
        const heroCopyStyle = getComputedStyle(document.querySelector('.hero-copy'));
        const heroImageStyle = getComputedStyle(document.querySelector('.hero-image'));
        const heroOverlayStyle = getComputedStyle(document.querySelector('.hero'), '::before');
        const heroImageSrc = document.querySelector('.hero-image')?.currentSrc || document.querySelector('.hero-image')?.src || '';
        const pathways = document.querySelector('.pathways').getBoundingClientRect();
        const glossary = document.querySelector('.glossary').getBoundingClientRect();
        const bodyText = document.body.textContent;
        return {
          title: document.title,
          bodyText,
          loginHrefs: Array.from(document.querySelectorAll('a')).map((link) => link.href).filter((href) => href.includes('/p/?portalProfile=baltimore-medtech')),
          headerLoginHref: document.querySelector('header nav a.button')?.href || '',
          heroLeft: hero.left,
          heroRight: hero.right,
          heroWidth: hero.width,
          heroTop: hero.top,
          heroBottom: hero.bottom,
          heroHeight: hero.height,
          innerHeight: window.innerHeight,
          headerBottom: header.bottom,
          copyLeft: copy.left,
          copyRight: copy.right,
          copyWidth: copy.width,
          copyCenterPct: ((copy.left + copy.right) / 2 - hero.left) / hero.width,
          h1Left: h1.left,
          h1Right: h1.right,
          textAlign: heroCopyStyle.textAlign,
          copyBackground: heroCopyStyle.backgroundColor,
          heroOverlay: heroOverlayStyle.backgroundImage,
          imageObjectPosition: heroImageStyle.objectPosition,
          heroImageSrc,
          heroTitle: document.querySelector('.hero-copy h1')?.textContent.trim() || '',
          pathwaysTop: pathways.top,
          pathwayCount: document.querySelectorAll('.pathway-card').length,
          pathwayTitles: Array.from(document.querySelectorAll('.pathway-card h3'), (title) => title.textContent.trim()),
          glossaryTop: glossary.top,
          glossaryEntryCount: document.querySelectorAll('.glossary-entry').length,
          glossaryTitles: Array.from(document.querySelectorAll('.glossary-entry h3'), (title) => title.textContent.trim()),
          glossaryRegionalText: document.querySelector('.glossary-lede')?.textContent || '',
          revealEnabled: document.documentElement.classList.contains('reveal-enabled'),
          footerPresent: !!document.querySelector('.site-footer'),
          navEnhanced: document.documentElement.classList.contains('nav-enhanced'),
          navOpenInitial: document.getElementById('primary-nav')?.classList.contains('is-open') || false
        };
        """
    )

    if metrics["title"] != "Baltimore MedTech":
        raise AssertionError(f"{viewport} home: unexpected title {metrics['title']!r}")
    if "Baltimore MedTech" not in metrics["bodyText"]:
        raise AssertionError(f"{viewport} home: missing Baltimore MedTech body text")
    if metrics["headerLoginHref"] != PORTAL_URL or PORTAL_URL not in metrics["loginHrefs"]:
        raise AssertionError(f"{viewport} home: login links did not target the MedTech portal profile: {metrics}")
    if "baltimore-medtech-hero-v2" not in metrics["heroImageSrc"] or "lumacdn.com" in metrics["heroImageSrc"]:
        raise AssertionError(f"{viewport} home: hero background should use the optimized local editorial image: {metrics}")
    if abs(metrics["heroTop"] - metrics["headerBottom"]) > 2:
        raise AssertionError(f"{viewport} home: hero must start below the rendered navigation: {metrics}")
    if metrics["heroOverlay"] in {"none", ""}:
        raise AssertionError(f"{viewport} home: editorial hero needs a contrast overlay: {metrics}")
    if not metrics["innerHeight"] * 0.75 <= metrics["heroHeight"] <= metrics["innerHeight"] * 1.35:
        raise AssertionError(f"{viewport} home: hero no longer forms a focused opening chapter: {metrics}")
    if abs(metrics["pathwaysTop"] - metrics["heroBottom"]) > 2:
        raise AssertionError(f"{viewport} home: pathways must follow the hero without a layout gap: {metrics}")
    if metrics["heroTitle"] != "Better care starts with a better-connected city.":
        raise AssertionError(f"{viewport} home: editorial promise is missing: {metrics}")
    if metrics["pathwayCount"] != 3 or metrics["pathwayTitles"] != ["Events", "Medical map", "MedTech index"]:
        raise AssertionError(f"{viewport} home: community pathways are incomplete: {metrics}")
    if metrics["glossaryEntryCount"] != 3 or metrics["glossaryTitles"] != ["Health", "Medicine", "Biotech"]:
        raise AssertionError(f"{viewport} home: regional glossary fields are incomplete: {metrics}")
    if "specific to the Baltimore regional medical community" not in metrics["glossaryRegionalText"]:
        raise AssertionError(f"{viewport} home: glossary regional context is missing: {metrics}")
    if not metrics["revealEnabled"]:
        raise AssertionError(f"{viewport} home: progressive scroll reveal did not initialize: {metrics}")
    if not metrics["footerPresent"] or not metrics["navEnhanced"]:
        raise AssertionError(f"{viewport} home: navigation or footer enhancement is missing: {metrics}")
    if metrics["navOpenInitial"]:
        raise AssertionError(f"{viewport} home: navigation should load closed: {metrics}")

    if viewport == "desktop":
        if metrics["copyLeft"] > metrics["heroWidth"] * 0.12 or metrics["copyRight"] > metrics["heroWidth"] * 0.7:
            raise AssertionError(f"desktop home: hero copy lost its editorial left-column composition: {metrics}")
    else:
        image_x = numeric_object_position_x(metrics["imageObjectPosition"])
        if metrics["textAlign"] != "left":
            raise AssertionError(f"mobile home: editorial hero copy must stay left-aligned: {metrics}")
        if image_x is None or image_x < 55:
            raise AssertionError(f"mobile home: hero image crop must retain the Baltimore skyline: {metrics}")

        nav_metrics = driver.execute_script(
            """
            const toggle = document.querySelector('.nav-toggle');
            toggle.click();
            const nav = document.getElementById('primary-nav');
            const box = nav.getBoundingClientRect();
            return {
              expanded: toggle.getAttribute('aria-expanded'),
              isOpen: nav.classList.contains('is-open'),
              left: box.left,
              right: box.right,
              innerWidth: window.innerWidth
            };
            """
        )
        if not nav_metrics["isOpen"] or nav_metrics["expanded"] != "true":
            raise AssertionError(f"mobile home: compact navigation did not open accessibly: {nav_metrics}")
        if nav_metrics["left"] < -1 or nav_metrics["right"] > nav_metrics["innerWidth"] + 1:
            raise AssertionError(f"mobile home: open navigation is clipped: {nav_metrics}")
        driver.execute_script("document.querySelector('.nav-toggle').click()")
        metrics["mobileNavCheck"] = nav_metrics

    metrics["themeCheck"] = assert_theme_control(driver, viewport, screenshot_dir)

    driver.execute_script("document.querySelector('.pathway-grid').scrollIntoView({block: 'center', behavior: 'instant'})")
    WebDriverWait(driver, 10).until(
        lambda d: d.execute_script(
            "return getComputedStyle(document.querySelector('.pathway-card')).opacity === '1'"
        )
    )
    pathways_screenshot = screenshot_dir / f"{viewport}-home-pathways.png"
    driver.save_screenshot(str(pathways_screenshot))
    metrics["pathwaysScreenshot"] = str(pathways_screenshot)

    driver.execute_script("document.querySelector('.glossary-entry').scrollIntoView({block: 'center', behavior: 'instant'})")
    WebDriverWait(driver, 10).until(
        lambda d: d.execute_script(
            "return getComputedStyle(document.querySelector('.glossary-entry')).opacity === '1'"
        )
    )
    glossary_metrics = driver.execute_script(
        """
        const entry = document.querySelector('.glossary-entry');
        const box = entry.getBoundingClientRect();
        return {
          className: entry.className,
          opacity: getComputedStyle(entry).opacity,
          top: box.top,
          bottom: box.bottom,
          scrollY: window.scrollY
        };
        """
    )
    if glossary_metrics["opacity"] != "1":
        raise AssertionError(f"{viewport} home: glossary reveal did not complete: {glossary_metrics}")
    glossary_screenshot = screenshot_dir / f"{viewport}-home-glossary.png"
    driver.save_screenshot(str(glossary_screenshot))
    metrics["glossaryCheck"] = {**glossary_metrics, "screenshot": str(glossary_screenshot)}

    return {"viewport": viewport, "page": "home", "metrics": metrics, "screenshot": str(screenshot)}


def assert_calendar(driver: webdriver.Remote, base_url: str, viewport: str, screenshot_dir: pathlib.Path) -> dict:
    driver.get(f"{base_url.rstrip('/')}/calendar")
    settle(driver)
    WebDriverWait(driver, 30).until(lambda d: d.find_element(By.CSS_SELECTOR, ".event-card"))
    assert_no_horizontal_overflow(driver, f"{viewport} calendar")

    screenshot = screenshot_dir / f"{viewport}-calendar.png"
    driver.save_screenshot(str(screenshot))
    metrics = driver.execute_script(
        """
        const pageSections = Array.from(document.querySelectorAll('main > section')).map((el) => el.className);
        const listSection = document.querySelector('.event-list-section').getBoundingClientRect();
        const monthSection = document.querySelector('.month-section').getBoundingClientRect();
        const cards = Array.from(document.querySelectorAll('.event-card'));
        return {
          title: document.title,
          pageSections,
          cardCount: cards.length,
          eventCountText: document.getElementById('event-count')?.textContent || '',
          statusHidden: document.getElementById('status')?.hidden || false,
          listTop: listSection.top,
          monthTop: monthSection.top,
          firstCardText: cards[0]?.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 180) || ''
        };
        """
    )
    metrics["themeCheck"] = assert_theme_control(driver, viewport, screenshot_dir)

    if metrics["title"] != "Calendar | Baltimore MedTech":
        raise AssertionError(f"{viewport} calendar: unexpected title {metrics['title']!r}")
    if metrics["pageSections"][1] != "event-list-section":
        raise AssertionError(f"{viewport} calendar: upcoming list is no longer the first content section: {metrics}")
    if metrics["cardCount"] <= 0 or not metrics["statusHidden"]:
        raise AssertionError(f"{viewport} calendar: medical events did not load from the published feed: {metrics}")
    if metrics["monthTop"] <= metrics["listTop"]:
        raise AssertionError(f"{viewport} calendar: monthly overview moved above the event list: {metrics}")

    return {"viewport": viewport, "page": "calendar", "metrics": metrics, "screenshot": str(screenshot)}


def assert_map(driver: webdriver.Remote, base_url: str, viewport: str, screenshot_dir: pathlib.Path) -> dict:
    driver.get(f"{base_url.rstrip('/')}/map")
    settle(driver)
    WebDriverWait(driver, 45).until(lambda d: d.execute_script("return window.__bmoreMedTechMapReady === true"))
    assert_no_horizontal_overflow(driver, f"{viewport} map")

    screenshot = screenshot_dir / f"{viewport}-map.png"
    driver.save_screenshot(str(screenshot))
    metrics = driver.execute_script(
        """
        const mapBox = document.getElementById('medical-map').getBoundingClientRect();
        const panelBox = document.querySelector('.map-panel').getBoundingClientRect();
        const stageBox = document.querySelector('.map-stage').getBoundingClientRect();
        const inspector = document.getElementById('map-inspector');
        const inspectorBox = inspector.getBoundingClientRect();
        const canvas = document.querySelector('#medical-map canvas.maplibregl-canvas');
        const state = window.__bmoreMedTechLayerState || {};
        return {
          title: document.title,
          regionValue: document.getElementById('region-select')?.value,
          stateFieldHidden: document.getElementById('state-field')?.hidden,
          sizeModeValue: document.getElementById('size-mode-select')?.value,
          layerRows: document.querySelectorAll('.map-layer-row').length,
          layerOrderTopToBottom: Array.from(document.querySelectorAll('.map-layer-row')).map((row) => row.dataset.layerRow),
          layerStack: window.__bmoreMedTechLayerStack || [],
          mapWidth: mapBox.width,
          mapHeight: mapBox.height,
          stageRight: stageBox.right,
          panelWidth: panelBox.width,
          inspectorLeft: inspectorBox.left,
          inspectorTop: inspectorBox.top,
          inspectorWidth: inspectorBox.width,
          inspectorState: inspector.dataset.inspectorState,
          inspectorCloseHidden: document.getElementById('close-map-inspector')?.hidden,
          compactSupported: window.__bmoreMedTechQueryState?.supportsCompression,
          compactDisabled: document.getElementById('compress-query-state')?.disabled,
          shareExpanded: document.getElementById('open-map-share')?.getAttribute('aria-expanded'),
          shareHidden: document.getElementById('map-share-sheet')?.hidden,
          shareDisplay: getComputedStyle(document.getElementById('map-share-sheet')).display,
          canvasPresent: !!canvas,
          canvasWidth: canvas?.width || 0,
          canvasHeight: canvas?.height || 0,
          diagnostics: state
        };
        """
    )

    if metrics["title"] != "Medical System Map | Baltimore MedTech":
        raise AssertionError(f"{viewport} map: unexpected title {metrics['title']!r}")
    if metrics["regionValue"] != "baltimore-city":
        raise AssertionError(f"{viewport} map: default region changed: {metrics}")
    if metrics["sizeModeValue"] != "volume":
        raise AssertionError(f"{viewport} map: marker sizing should default to volume: {metrics}")
    if metrics["layerRows"] < 12:
        raise AssertionError(f"{viewport} map: missing expected medical layer controls: {metrics}")
    if metrics["layerOrderTopToBottom"][:3] != ["medical-events", "us-hospitals", "md-hospitals"]:
        raise AssertionError(f"{viewport} map: point layers should start above regional polygons: {metrics}")
    if not metrics["canvasPresent"] or metrics["mapWidth"] < 280 or metrics["mapHeight"] < 500:
        raise AssertionError(f"{viewport} map: MapLibre canvas did not render at useful size: {metrics}")
    if viewport == "desktop" and metrics["inspectorLeft"] < metrics["stageRight"] - 2:
        raise AssertionError(f"desktop map: inspector should be a right-hand column, not a map overlay: {metrics}")
    if metrics["inspectorState"] != "idle" or not metrics["inspectorCloseHidden"]:
        raise AssertionError(f"{viewport} map: inspector should start idle and unpinned: {metrics}")
    if not metrics["compactSupported"] or metrics["compactDisabled"]:
        raise AssertionError(f"{viewport} map: browser compression support was not exposed: {metrics}")
    if metrics["shareExpanded"] != "false" or not metrics["shareHidden"] or metrics["shareDisplay"] != "none":
        raise AssertionError(f"{viewport} map: share sheet should start fully closed: {metrics}")

    diagnostics = metrics["diagnostics"]
    for layer_id in ("medical-events", "us-hospitals", "md-hospitals", "dhcd-healthy-homes", "enviro-asthma"):
        layer_state = diagnostics.get(layer_id) or {}
        if not layer_state.get("visible") or not layer_state.get("applies") or int(layer_state.get("count") or 0) <= 0:
            raise AssertionError(f"{viewport} map: expected layer {layer_id} did not load for Baltimore City: {metrics}")

    volume_layers = [
        diagnostics.get(layer_id) or {}
        for layer_id in ("us-hospitals", "md-hospitals", "long-term-care")
    ]
    sized_layers = [
        layer
        for layer in volume_layers
        if layer.get("sizeMode") == "volume"
        and int(layer.get("volumeCount") or 0) > 0
        and layer.get("minScale") is not None
        and layer.get("maxScale") is not None
    ]
    if not sized_layers or not any(layer["maxScale"] > layer["minScale"] for layer in sized_layers):
        raise AssertionError(f"{viewport} map: expected volume-based marker sizing diagnostics: {metrics}")

    event_metrics = driver.execute_script(
        """
        const point = window.__bmoreMedTechFirstFeaturePoint('medical-events');
        const result = window.__showBmoreMedTechHoverTarget(point);
        return {
          point,
          result,
          inspectorState: document.getElementById('map-inspector').dataset.inspectorState,
          text: document.getElementById('map-inspector-content').textContent.replace(/\\s+/g, ' ').trim(),
          eventHref: Array.from(document.querySelectorAll('#map-inspector-content a'))
            .map((link) => link.href)
            .find((href) => !href.includes('codecollective.us/calendar.html')) || ''
        };
        """
    )
    event_layer = (event_metrics.get("result") or {}).get("arbitration", {}).get("chosen", {}).get("layerId")
    if (
        not event_metrics.get("point")
        or event_layer != "medical-events"
        or event_metrics["inspectorState"] != "hover"
        or "Upcoming medical events" not in event_metrics["text"]
        or not event_metrics["eventHref"].startswith("http")
    ):
        raise AssertionError(f"{viewport} map: upcoming medical event did not render in the inspector: {event_metrics}")
    metrics["medicalEventCheck"] = event_metrics

    hover_metrics = driver.execute_script(
        """
        const point = window.__bmoreMedTechFirstFeaturePoint('us-hospitals');
        const result = window.__showBmoreMedTechHoverTarget(point);
        const inspector = document.getElementById('map-inspector');
        return {
          point,
          result,
          inspectorState: inspector.dataset.inspectorState,
          closeHidden: document.getElementById('close-map-inspector').hidden,
          text: document.getElementById('map-inspector-content').textContent.replace(/\\s+/g, ' ').trim()
        };
        """
    )
    chosen_layer = (hover_metrics.get("result") or {}).get("arbitration", {}).get("chosen", {}).get("layerId")
    if (
        not hover_metrics.get("point")
        or chosen_layer != "us-hospitals"
        or hover_metrics["inspectorState"] != "hover"
        or not hover_metrics["closeHidden"]
        or "All hospitals" not in hover_metrics["text"]
    ):
        raise AssertionError(f"{viewport} map: hover inspector did not preview the top medical feature: {hover_metrics}")
    metrics["hoverInspectorCheck"] = hover_metrics

    pin_metrics = driver.execute_script(
        """
        const point = window.__bmoreMedTechFirstFeaturePoint('us-hospitals');
        const result = window.__pinBmoreMedTechHoverTarget(point);
        const inspector = document.getElementById('map-inspector');
        const box = inspector.getBoundingClientRect();
        const close = document.getElementById('close-map-inspector');
        const computed = getComputedStyle(inspector);
        const beforeClose = {
          result,
          inspectorState: inspector.dataset.inspectorState,
          closeHidden: close.hidden,
          position: computed.position,
          box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
          text: document.getElementById('map-inspector-content').textContent.replace(/\\s+/g, ' ').trim()
        };
        close.click();
        return {
          beforeClose,
          afterClose: {
            inspectorState: inspector.dataset.inspectorState,
            closeHidden: close.hidden,
            text: document.getElementById('map-inspector-content').textContent.replace(/\\s+/g, ' ').trim()
          }
        };
        """
    )
    if (
        pin_metrics["beforeClose"]["inspectorState"] != "pinned"
        or pin_metrics["beforeClose"]["closeHidden"]
        or "All hospitals" not in pin_metrics["beforeClose"]["text"]
        or pin_metrics["afterClose"]["inspectorState"] != "idle"
        or not pin_metrics["afterClose"]["closeHidden"]
    ):
        raise AssertionError(f"{viewport} map: pinned inspector lifecycle failed: {pin_metrics}")
    if viewport == "mobile" and pin_metrics["beforeClose"]["position"] != "fixed":
        raise AssertionError(f"mobile map: pinned inspector should become a bottom sheet: {pin_metrics}")
    metrics["pinnedInspectorCheck"] = pin_metrics

    z_order_metrics = driver.execute_script(
        """
        const before = Array.from(document.querySelectorAll('.map-layer-row')).map((row) => row.dataset.layerRow);
        document.querySelector('.map-layer-row [data-layer-action="down"]').click();
        const after = Array.from(document.querySelectorAll('.map-layer-row')).map((row) => row.dataset.layerRow);
        return {
          before,
          after,
          stack: window.__bmoreMedTechLayerStack || [],
          diagnostics: window.__bmoreMedTechLayerState || {}
        };
        """
    )
    if z_order_metrics["before"][:2] != ["medical-events", "us-hospitals"] or z_order_metrics["after"][:2] != ["us-hospitals", "medical-events"]:
        raise AssertionError(f"{viewport} map: layer stack controls did not reorder the top layers: {z_order_metrics}")
    metrics["zOrderCheck"] = z_order_metrics

    uniform_metrics = driver.execute_script(
        """
        const select = document.getElementById('size-mode-select');
        select.value = 'uniform';
        select.dispatchEvent(new Event('change', {bubbles: true}));
        return {
          sizeModeValue: select.value,
          diagnostics: window.__bmoreMedTechLayerState || {}
        };
        """
    )
    const_layer = uniform_metrics["diagnostics"].get("md-hospitals") or {}
    if (
        uniform_metrics["sizeModeValue"] != "uniform"
        or const_layer.get("sizeMode") != "uniform"
        or const_layer.get("minScale") != 1
        or const_layer.get("maxScale") != 1
    ):
        raise AssertionError(f"{viewport} map: uniform marker sizing did not apply cleanly: {uniform_metrics}")
    metrics["uniformSizingCheck"] = uniform_metrics

    if viewport == "desktop":
        driver.execute_script(
            """
            document.getElementById('region-select').value = 'state';
            document.getElementById('region-select').dispatchEvent(new Event('change', {bubbles: true}));
            document.getElementById('state-select').value = 'PA';
            document.getElementById('state-select').dispatchEvent(new Event('change', {bubbles: true}));
            """
        )
        WebDriverWait(driver, 45).until(
            lambda d: d.execute_script(
                "return window.__bmoreMedTechLayerState?.['us-hospitals']?.count > 0 && window.__bmoreMedTechLayerState?.['md-hospitals']?.applies === false"
            )
        )
        state_metrics = driver.execute_script(
            """
            return {
              regionValue: document.getElementById('region-select').value,
              stateValue: document.getElementById('state-select').value,
              stateFieldHidden: document.getElementById('state-field').hidden,
              diagnostics: window.__bmoreMedTechLayerState
            };
            """
        )
        if (
            state_metrics["stateFieldHidden"]
            or state_metrics["diagnostics"]["md-hospitals"]["applies"]
            or state_metrics["diagnostics"]["medical-events"]["applies"]
        ):
            raise AssertionError(f"desktop map: state-region filtering did not disable Maryland-only layers: {state_metrics}")
        metrics["stateRegionCheck"] = state_metrics

        WebDriverWait(driver, 15).until(
            lambda d: parse_qs(urlparse(d.current_url).query).get("region") == ["state"]
            and parse_qs(urlparse(d.current_url).query).get("state") == ["PA"]
            and parse_qs(urlparse(d.current_url).query).get("size") == ["uniform"]
        )
        readable_query = parse_qs(urlparse(driver.current_url).query)
        for parameter in ("region", "state", "size", "layers", "order", "c", "z", "o"):
            if parameter not in readable_query:
                raise AssertionError(f"desktop map: readable URL is missing {parameter}: {driver.current_url}")

        share_urls = driver.execute_async_script(
            """
            const done = arguments[arguments.length - 1];
            Promise.all([
              window.__bmoreMedTechQueryState.buildShareUrl({preferCompressed: true}),
              window.__bmoreMedTechQueryState.buildShareUrl({preferCompressed: false})
            ]).then(([compact, readable]) => done({compact, readable})).catch((error) => done({error: String(error)}));
            """
        )
        if share_urls.get("error"):
            raise AssertionError(f"desktop map: share URLs could not be built: {share_urls}")
        compact_query = parse_qs(urlparse(share_urls["compact"]).query)
        expanded_share_query = parse_qs(urlparse(share_urls["readable"]).query)
        if set(compact_query) != {"s"} or not compact_query["s"][0]:
            raise AssertionError(f"desktop map: compact share URL should contain only s: {share_urls}")
        if "s" in expanded_share_query or expanded_share_query.get("region") != ["state"]:
            raise AssertionError(f"desktop map: readable share URL was not expanded: {share_urls}")

        share_lifecycle = driver.execute_async_script(
            """
            const done = arguments[arguments.length - 1];
            const trigger = document.getElementById('open-map-share');
            const sheet = document.getElementById('map-share-sheet');
            trigger.click();
            const opened = {
              expanded: trigger.getAttribute('aria-expanded'),
              hidden: sheet.hidden,
              display: getComputedStyle(sheet).display
            };
            document.getElementById('copy-readable-url').click();
            setTimeout(() => done({
              opened,
              closed: {
                expanded: trigger.getAttribute('aria-expanded'),
                hidden: sheet.hidden,
                display: getComputedStyle(sheet).display,
                status: document.getElementById('map-share-status').textContent
              }
            }), 500);
            """
        )
        if (
            share_lifecycle["opened"] != {"expanded": "true", "hidden": False, "display": "grid"}
            or share_lifecycle["closed"]["expanded"] != "false"
            or not share_lifecycle["closed"]["hidden"]
            or share_lifecycle["closed"]["display"] != "none"
            or "Readable map URL copied" not in share_lifecycle["closed"]["status"]
        ):
            raise AssertionError(f"desktop map: live share sheet lifecycle failed: {share_lifecycle}")

        driver.execute_script("document.getElementById('compress-query-state').click()")
        WebDriverWait(driver, 15).until(lambda d: set(parse_qs(urlparse(d.current_url).query)) == {"s"})
        compressed_current_url = driver.current_url
        driver.get(compressed_current_url)
        settle(driver)
        WebDriverWait(driver, 45).until(lambda d: d.execute_script("return window.__bmoreMedTechMapReady === true"))
        roundtrip = driver.execute_script(
            """
            const sheet = document.getElementById('map-share-sheet');
            return {
              region: document.getElementById('region-select').value,
              state: document.getElementById('state-select').value,
              size: document.getElementById('size-mode-select').value,
              compactChecked: document.getElementById('compress-query-state').checked,
              visible: Array.from(document.querySelectorAll('.map-layer-row input:checked'), (input) => input.id.slice(5)),
              orderTopToBottom: Array.from(document.querySelectorAll('.map-layer-row'), (row) => row.dataset.layerRow),
              shareExpanded: document.getElementById('open-map-share').getAttribute('aria-expanded'),
              shareHidden: sheet.hidden,
              shareDisplay: getComputedStyle(sheet).display,
              queryState: window.__bmoreMedTechQueryState.current()
            };
            """
        )
        if (
            roundtrip["region"] != "state"
            or roundtrip["state"] != "PA"
            or roundtrip["size"] != "uniform"
            or not roundtrip["compactChecked"]
            or roundtrip["orderTopToBottom"][:2] != ["us-hospitals", "medical-events"]
            or roundtrip["shareExpanded"] != "false"
            or not roundtrip["shareHidden"]
            or roundtrip["shareDisplay"] != "none"
        ):
            raise AssertionError(f"desktop map: compressed URL did not round-trip live state: {roundtrip}")
        metrics["queryStateCheck"] = {
            "readableParameters": sorted(readable_query),
            "compactParameter": "s",
            "shareLifecycle": share_lifecycle,
            "roundtrip": roundtrip,
        }

    return {"viewport": viewport, "page": "map", "metrics": metrics, "screenshot": str(screenshot)}


def assert_taxonomy(driver: webdriver.Remote, base_url: str, viewport: str, screenshot_dir: pathlib.Path) -> dict:
    driver.get(f"{base_url.rstrip('/')}/taxonomy")
    settle(driver)
    WebDriverWait(driver, 30).until(
        lambda d: d.execute_script("return window.__bmoreMedTechTaxonomyReady === true")
    )
    assert_no_horizontal_overflow(driver, f"{viewport} taxonomy")

    screenshot = screenshot_dir / f"{viewport}-taxonomy.png"
    driver.save_screenshot(str(screenshot))
    metrics = driver.execute_script(
        """
        const state = window.__bmoreMedTechTaxonomyState || {};
        return {
          title: document.title,
          totalText: document.getElementById('taxonomy-total')?.textContent || '',
          databaseOptions: document.getElementById('taxonomy-database')?.options.length || 0,
          databaseValue: document.getElementById('taxonomy-database')?.value,
          clusters: document.querySelectorAll('.taxonomy-cluster').length,
          nodes: document.querySelectorAll('.taxonomy-node').length,
          sourceHref: document.getElementById('taxonomy-source-link')?.href || '',
          navbarCurrent: document.querySelector('header nav [aria-current="page"]')?.textContent?.trim() || '',
          diagnostics: state
        };
        """
    )
    if metrics["title"] != "Medical Science & Coding Atlas | Baltimore MedTech":
        raise AssertionError(f"{viewport} taxonomy: unexpected title: {metrics}")
    if int(metrics["totalText"].replace(",", "")) < 200 or metrics["databaseOptions"] != 6:
        raise AssertionError(f"{viewport} taxonomy: index or framework selector is incomplete: {metrics}")
    if metrics["databaseValue"] != "medtech_index" or metrics["clusters"] < 9 or metrics["nodes"] < 200:
        raise AssertionError(f"{viewport} taxonomy: default MedTech Index did not render: {metrics}")
    if not metrics["sourceHref"].endswith("/medical-science-field-atlas.json") or metrics["navbarCurrent"] != "Medical atlas":
        raise AssertionError(f"{viewport} taxonomy: download or navbar link is incorrect: {metrics}")

    interaction_metrics = driver.execute_script(
        """
        const database = document.getElementById('taxonomy-database');
        database.value = 'acgme';
        database.dispatchEvent(new Event('change', {bubbles: true}));
        const acgme = {...window.__bmoreMedTechTaxonomyState};
        const search = document.getElementById('taxonomy-search');
        search.value = 'genomics';
        search.dispatchEvent(new Event('input', {bubbles: true}));
        const searched = {...window.__bmoreMedTechTaxonomyState};
        const firstNode = document.querySelector('.taxonomy-node');
        firstNode?.click();
        return {
          acgme,
          searched,
          selectedText: document.getElementById('taxonomy-inspector-title')?.textContent || '',
          selectedId: window.__bmoreMedTechTaxonomyState?.selectedRecord || null,
          sourceHref: document.getElementById('taxonomy-source-link')?.href || ''
        };
        """
    )
    acgme = interaction_metrics["acgme"]
    searched = interaction_metrics["searched"]
    if not (20 < acgme.get("availableRecords", 0) < acgme.get("totalRecords", 0)):
        raise AssertionError(f"{viewport} taxonomy: ACGME lens did not filter the index: {interaction_metrics}")
    if not (0 < searched.get("visibleRecords", 0) < acgme.get("availableRecords", 0)):
        raise AssertionError(f"{viewport} taxonomy: taxonomy search did not narrow the ACGME lens: {interaction_metrics}")
    if not interaction_metrics["selectedId"] or interaction_metrics["selectedText"] == "Select a field":
        raise AssertionError(f"{viewport} taxonomy: field inspector did not respond: {interaction_metrics}")
    if "acgme.org/specialties" not in interaction_metrics["sourceHref"]:
        raise AssertionError(f"{viewport} taxonomy: selected framework source is wrong: {interaction_metrics}")

    metrics["interactionCheck"] = interaction_metrics
    return {"viewport": viewport, "page": "taxonomy", "metrics": metrics, "screenshot": str(screenshot)}


def run(args: argparse.Namespace) -> int:
    screenshot_dir = pathlib.Path(args.screenshot_dir).resolve()
    screenshot_dir.mkdir(parents=True, exist_ok=True)

    viewports = [("desktop", 1366, 900), ("mobile", 390, 844)]
    page_checks = {
        "home": assert_home,
        "calendar": assert_calendar,
        "map": assert_map,
        "taxonomy": assert_taxonomy,
    }
    requested_pages = [page.strip() for page in args.pages.split(",") if page.strip()]
    unknown_pages = sorted(set(requested_pages) - set(page_checks))
    if unknown_pages:
        raise ValueError(f"Unknown regression pages: {', '.join(unknown_pages)}")

    checks: list[dict] = []
    for viewport, width, height in viewports:
        driver = new_driver(args.selenium_url, width, height)
        try:
            for page in requested_pages:
                checks.append(page_checks[page](driver, args.base_url, viewport, screenshot_dir))
        except Exception:
            failure_path = screenshot_dir / f"{viewport}-failure.png"
            try:
                driver.save_screenshot(str(failure_path))
                print(f"[failure] {viewport} screenshot={failure_path}")
                print(f"[failure] {viewport} body={body_excerpt(driver)}")
            except Exception:
                pass
            raise
        finally:
            driver.quit()

    print(json.dumps({"base_url": args.base_url, "checks": checks}, indent=2))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Baltimore MedTech Selenium regressions.")
    parser.add_argument("--selenium-url", default=os.environ.get("SELENIUM_URL", "http://127.0.0.1:4444/wd/hub"))
    parser.add_argument(
        "--base-url",
        default=os.environ.get("BMORE_MEDTECH_BASE_URL", "https://host.docker.internal:8768"),
    )
    parser.add_argument(
        "--screenshot-dir",
        default=os.environ.get("BMORE_MEDTECH_SCREENSHOT_DIR", "/tmp/bmore-medtech-selenium-regression"),
    )
    parser.add_argument(
        "--pages",
        default=os.environ.get("BMORE_MEDTECH_TEST_PAGES", "home,calendar,map,taxonomy"),
        help="Comma-separated pages to check: home, calendar, map, taxonomy",
    )
    return parser.parse_args()


if __name__ == "__main__":
    sys.exit(run(parse_args()))
