#!/usr/bin/env python3
"""Run the Baltimore MedTech local test stack in Docker.

Containers read live source from bind mounts. The test command builds the site,
serves the built dist directory through the local HTTPS server, starts Selenium,
and runs the Selenium regression against that mounted server.
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import docker_utils


root = Path(os.path.abspath(os.path.dirname(__file__)))
WORKSPACE = "/workspace"
PREFIX = "bmoremedtech-"
DEFAULT_NODE_IMAGE = "node:22-bookworm-slim"
DEFAULT_PYTHON_IMAGE = "python:3.13-alpine"
DEFAULT_SELENIUM_IMAGE = "selenium/standalone-chrome:latest"


def wait_for_http(url: str, label: str, attempts: int = 80) -> None:
    context = ssl._create_unverified_context() if url.startswith("https://") else None
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=2, context=context) as response:
                if response.status < 500:
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {label} at {url}")


def wait_for_selenium(port: int, attempts: int = 80) -> None:
    status_url = f"http://127.0.0.1:{port}/status"
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(status_url, timeout=2) as response:
                payload = json.loads(response.read().decode("utf-8"))
                value = payload.get("value", {})
                nodes = value.get("nodes") or []
                has_up_node = any(node.get("availability") == "UP" for node in nodes)
                if value.get("ready") or has_up_node:
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for Selenium at {status_url}")


def ensure_local_certificates(cert_dir: Path) -> None:
    cert = cert_dir / "localhost.crt"
    key = cert_dir / "localhost.key"
    if cert.exists() and key.exists():
        return

    cert_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-days",
            "825",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-subj",
            "/CN=localhost",
            "-addext",
            "subjectAltName=DNS:localhost,DNS:host.docker.internal,IP:127.0.0.1,IP:::1",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def run_one_shot_container(config: dict):
    docker_utils.remove_container(config["name"])
    container = docker_utils.run_container(config)
    result = container.wait()
    logs = container.logs(stdout=True, stderr=True).decode("utf-8", errors="replace")
    if logs:
        print(logs, end="" if logs.endswith("\n") else "\n")
    try:
        container.remove(force=True)
    except Exception:
        pass

    status_code = result.get("StatusCode", 1)
    if status_code != 0:
        raise RuntimeError(f"{config['name']} exited with status {status_code}")


def build_site(args: argparse.Namespace) -> None:
    run_one_shot_container(
        {
            "image": args.node_image,
            "name": f"{PREFIX}build",
            "detach": True,
            "remove": False,
            "working_dir": WORKSPACE,
            "volumes": {
                str(root): {"bind": WORKSPACE, "mode": "rw"},
                f"{PREFIX}node-modules": {"bind": f"{WORKSPACE}/node_modules", "mode": "rw"},
            },
            "environment": {
                "NODE_ENV": "development",
                "HOST_UID": str(os.getuid()),
                "HOST_GID": str(os.getgid()),
            },
            "command": [
                "sh",
                "-c",
                "npm ci --ignore-scripts --no-audit --no-fund && npm run build && chown -R ${HOST_UID}:${HOST_GID} dist assets/data",
            ],
        }
    )


def start_site(args: argparse.Namespace) -> None:
    cert_dir = root / ".local" / "certs"
    ensure_local_certificates(cert_dir)
    docker_utils.remove_container(args.site_container_name)
    docker_utils.run_container(
        {
            "image": args.node_image,
            "name": args.site_container_name,
            "detach": True,
            "restart_policy": {"Name": "unless-stopped"},
            "ports": {"8080/tcp": args.site_port},
            "working_dir": WORKSPACE,
            "extra_hosts": {"host.docker.internal": "host-gateway"},
            "volumes": {
                str(root): {"bind": WORKSPACE, "mode": "rw"},
                f"{PREFIX}node-modules": {"bind": f"{WORKSPACE}/node_modules", "mode": "rw"},
                str(cert_dir): {"bind": "/certs", "mode": "ro"},
            },
            "environment": {
                "SITE_ROOT": f"{WORKSPACE}/dist",
                "CONTAINER_PORT": "8080",
                "TLS_CERT_FILE": "/certs/localhost.crt",
                "TLS_KEY_FILE": "/certs/localhost.key",
            },
            "command": [
                "node",
                "scripts/local-static-server.mjs",
            ],
        }
    )
    wait_for_http(f"https://127.0.0.1:{args.site_port}/", "Baltimore MedTech local site")


def start_selenium(args: argparse.Namespace) -> None:
    docker_utils.remove_container(args.selenium_container_name)
    docker_utils.run_container(
        {
            "image": args.selenium_image,
            "name": args.selenium_container_name,
            "detach": True,
            "restart_policy": {"Name": "unless-stopped"},
            "ports": {"4444/tcp": args.selenium_port},
            "shm_size": "2g",
            "extra_hosts": {"host.docker.internal": "host-gateway"},
            "environment": {
                "SE_NODE_MAX_SESSIONS": "1",
                "SE_NODE_OVERRIDE_MAX_SESSIONS": "true",
            },
        }
    )
    wait_for_selenium(args.selenium_port)


def start(args: argparse.Namespace) -> None:
    if args.build:
        build_site(args)
    start_site(args)
    start_selenium(args)
    print(f"Local site:       https://127.0.0.1:{args.site_port}/")
    print(f"Selenium status:  http://127.0.0.1:{args.selenium_port}/status")
    print(f"Live source mount: {root} -> {WORKSPACE}")


def run_tests(args: argparse.Namespace) -> None:
    build_site(args)
    start_site(args)
    start_selenium(args)

    screenshot_dir = Path(args.screenshot_dir)
    screenshot_dir.mkdir(parents=True, exist_ok=True)
    base_url = f"https://host.docker.internal:{args.site_port}"
    selenium_url = f"http://host.docker.internal:{args.selenium_port}/wd/hub"
    run_one_shot_container(
        {
            "image": args.python_image,
            "name": f"{PREFIX}selenium-regression",
            "detach": True,
            "remove": False,
            "working_dir": WORKSPACE,
            "extra_hosts": {"host.docker.internal": "host-gateway"},
            "volumes": {
                str(root): {"bind": WORKSPACE, "mode": "ro"},
                str(screenshot_dir): {"bind": "/screenshots", "mode": "rw"},
            },
            "environment": {
                "SELENIUM_URL": selenium_url,
                "BMORE_MEDTECH_BASE_URL": base_url,
                "BMORE_MEDTECH_SCREENSHOT_DIR": "/screenshots",
                "BMORE_MEDTECH_TEST_PAGES": args.test_pages,
            },
            "command": [
                "sh",
                "-c",
                "pip install --quiet --disable-pip-version-check selenium==4.36.0 && python scripts/selenium-regression.py",
            ],
        }
    )


def stop(args: argparse.Namespace) -> None:
    for name in (
        args.site_container_name,
        args.selenium_container_name,
        f"{PREFIX}build",
        f"{PREFIX}selenium-regression",
    ):
        docker_utils.remove_container(name)


def status(_args: argparse.Namespace) -> None:
    print(docker_utils.list_containers(show_all=False))


def add_common_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--site-port", type=int, default=int(os.getenv("BMORE_MEDTECH_SITE_PORT", "8769")))
    parser.add_argument("--selenium-port", type=int, default=int(os.getenv("BMORE_MEDTECH_SELENIUM_PORT", "4445")))
    parser.add_argument("--site-container-name", default=os.getenv("BMORE_MEDTECH_SITE_CONTAINER", f"{PREFIX}site"))
    parser.add_argument("--selenium-container-name", default=os.getenv("BMORE_MEDTECH_SELENIUM_CONTAINER", f"{PREFIX}selenium"))
    parser.add_argument("--node-image", default=os.getenv("NODE_IMAGE", DEFAULT_NODE_IMAGE))
    parser.add_argument("--python-image", default=os.getenv("PYTHON_IMAGE", DEFAULT_PYTHON_IMAGE))
    parser.add_argument("--selenium-image", default=os.getenv("SELENIUM_IMAGE", DEFAULT_SELENIUM_IMAGE))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    start_parser = subparsers.add_parser("start")
    add_common_options(start_parser)
    start_parser.add_argument("--build", action="store_true")
    start_parser.set_defaults(func=start)

    test_parser = subparsers.add_parser("test")
    add_common_options(test_parser)
    test_parser.add_argument(
        "--screenshot-dir",
        default=os.getenv("BMORE_MEDTECH_SCREENSHOT_DIR", "/tmp/bmore-medtech-selenium-regression"),
    )
    test_parser.add_argument(
        "--test-pages",
        default=os.getenv("BMORE_MEDTECH_TEST_PAGES", "home,calendar,map,taxonomy"),
    )
    test_parser.set_defaults(func=run_tests)

    stop_parser = subparsers.add_parser("stop")
    add_common_options(stop_parser)
    stop_parser.set_defaults(func=stop)

    status_parser = subparsers.add_parser("status")
    status_parser.set_defaults(func=status)

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(1)
