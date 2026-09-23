#!/usr/bin/env python3
"""Profile MedTech page-load timings with the running Selenium Chrome."""

from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path
from urllib.parse import urljoin

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, WebDriverException
from selenium.webdriver.support.ui import WebDriverWait


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE_URL = "http://127.0.0.1:8769/"
DEFAULT_SELENIUM_URL = "http://127.0.0.1:4445/wd/hub"
METRICS_SCRIPT = """
(() => {
  window.__bmorePerf = { lcp: 0, cls: 0, paints: {}, shifts: [] };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__bmorePerf.paints[entry.name] = entry.startTime;
      }
    }).observe({ type: 'paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__bmorePerf.lcp = entry.startTime;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.hadRecentInput) continue;
        window.__bmorePerf.cls += entry.value;
        window.__bmorePerf.shifts.push({
          value: entry.value,
          startTime: entry.startTime,
          sources: (entry.sources || []).map((source) => source.node ? source.node.outerHTML.slice(0, 160) : '')
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {}
})();
"""


def medtech_pages() -> list[str]:
    inventory = json.loads((ROOT / "assets/data/link-inventory.json").read_text())
    pages: list[str] = []
    for page in inventory.get("pages", []):
        if not page.startswith("medtech:"):
            continue
        path = page.split(":", 1)[1]
        if path == "index.html":
            pages.append("/")
        else:
            pages.append(f"/{path}")
    return sorted(set(pages), key=lambda value: (value.count("/"), value))


def new_driver(selenium_url: str, width: int, height: int) -> webdriver.Remote:
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument(f"--window-size={width},{height}")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument("--no-sandbox")
    options.page_load_strategy = "eager"
    options.set_capability("acceptInsecureCerts", True)
    driver = webdriver.Remote(command_executor=selenium_url, options=options)
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": METRICS_SCRIPT})
    driver.execute_cdp_cmd("Network.enable", {})
    driver.execute_cdp_cmd("Network.setCacheDisabled", {"cacheDisabled": True})
    driver.set_page_load_timeout(60)
    driver.set_script_timeout(60)
    return driver


def wait_for_quiet_page(driver: webdriver.Remote) -> None:
    WebDriverWait(driver, 45).until(lambda d: d.execute_script("return ['interactive', 'complete'].includes(document.readyState)"))
    time.sleep(1.0)


def collect_metrics(driver: webdriver.Remote) -> dict:
    return driver.execute_script(
        """
        const nav = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const byType = {};
        for (const resource of resources) {
          const type = resource.initiatorType || 'other';
          byType[type] ||= { count: 0, transferSize: 0, encodedBodySize: 0, duration: 0 };
          byType[type].count += 1;
          byType[type].transferSize += resource.transferSize || 0;
          byType[type].encodedBodySize += resource.encodedBodySize || 0;
          byType[type].duration += resource.duration || 0;
        }
        const images = resources
          .filter((resource) => resource.initiatorType === 'img' || /\\.(png|jpe?g|webp|gif|svg)(\\?|$)/i.test(resource.name))
          .map((resource) => ({
            url: resource.name,
            transferSize: resource.transferSize || 0,
            encodedBodySize: resource.encodedBodySize || 0,
            duration: resource.duration || 0,
            startTime: resource.startTime || 0,
          }))
          .sort((a, b) => b.transferSize - a.transferSize)
          .slice(0, 8);
        return {
          title: document.title,
          url: location.href,
          nav: nav ? nav.toJSON() : null,
          perf: window.__bmorePerf || {},
          byType,
          images,
          resourceCount: resources.length,
        };
        """
    )


def summarize(path: str, raw: dict) -> dict:
    nav = raw.get("nav") or {}
    perf = raw.get("perf") or {}
    paints = perf.get("paints") or {}
    by_type = raw.get("byType") or {}
    image_type = by_type.get("img") or {}
    return {
        "path": path,
        "title": raw.get("title", ""),
        "dom_content_loaded_ms": round(nav.get("domContentLoadedEventEnd", 0), 1),
        "load_ms": round(nav.get("loadEventEnd", 0), 1),
        "ttfb_ms": round(nav.get("responseStart", 0), 1),
        "fcp_ms": round(paints.get("first-contentful-paint", 0), 1),
        "lcp_ms": round(perf.get("lcp", 0), 1),
        "cls": round(perf.get("cls", 0), 4),
        "resource_count": raw.get("resourceCount", 0),
        "image_count": image_type.get("count", 0),
        "image_transfer_kb": round((image_type.get("transferSize", 0) or 0) / 1024, 1),
        "total_transfer_kb": round(sum((entry.get("transferSize", 0) or 0) for entry in by_type.values()) / 1024, 1),
        "largest_images": raw.get("images", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--selenium-url", default=DEFAULT_SELENIUM_URL)
    parser.add_argument("--output", default="artifacts/performance/page-loads.json")
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=1000)
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--page-timeout", type=int, default=25)
    args = parser.parse_args()

    pages = medtech_pages()
    records = []
    driver = new_driver(args.selenium_url, args.width, args.height)
    driver.set_page_load_timeout(args.page_timeout)
    try:
      for path in pages:
          runs = []
          for _ in range(args.repeat):
              try:
                  driver.execute_cdp_cmd("Network.clearBrowserCache", {})
                  driver.get(urljoin(args.base_url.rstrip("/") + "/", path.lstrip("/")))
                  wait_for_quiet_page(driver)
                  runs.append(summarize(path, collect_metrics(driver)))
              except (TimeoutException, WebDriverException) as error:
                  runs.append({
                      "path": path,
                      "title": "",
                      "error": error.__class__.__name__,
                      "error_message": str(error).splitlines()[0],
                      "dom_content_loaded_ms": 0,
                      "load_ms": 0,
                      "ttfb_ms": 0,
                      "fcp_ms": 0,
                      "lcp_ms": 0,
                      "cls": 0,
                      "resource_count": 0,
                      "image_count": 0,
                      "image_transfer_kb": 0,
                      "total_transfer_kb": 0,
                      "largest_images": [],
                  })
          if len(runs) == 1:
              record = runs[0]
          else:
              record = runs[-1]
              for key in ["dom_content_loaded_ms", "load_ms", "ttfb_ms", "fcp_ms", "lcp_ms", "cls", "total_transfer_kb", "image_transfer_kb"]:
                  record[key] = round(statistics.median(run[key] for run in runs), 2)
          records.append(record)
          suffix = f" error={record['error']}" if record.get("error") else ""
          print(f"{record['path']:<48} load={record['load_ms']:>7}ms lcp={record['lcp_ms']:>7}ms cls={record['cls']}{suffix}", flush=True)
    finally:
        driver.quit()

    slowest = sorted(records, key=lambda row: row["load_ms"], reverse=True)[:8]
    payload = {
        "base_url": args.base_url,
        "viewport": {"width": args.width, "height": args.height},
        "page_count": len(records),
        "pages": records,
        "slowest_by_load": slowest,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    out = ROOT / args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
