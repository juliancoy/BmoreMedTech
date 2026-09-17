#!/usr/bin/env python3
"""Run the Baltimore MedTech local test stack in Docker.

Containers read live source from bind mounts. The test command builds the site,
serves the built dist directory through the local HTTPS server, starts Selenium,
and runs the Selenium regression against that mounted server.
"""

from __future__ import annotations

import argparse
import importlib.util
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
DEFAULT_SYSTEM_NETWORK = "bmoremedtech"
DEFAULT_SYSTEM_PREFIX = "bmoremedtech-"
DEFAULT_ORG_API_ORIGIN = "https://org-codecollective.jcloiacon.workers.dev"
DEFAULT_PIDP_IMAGE = "python:3.11-slim"
DEFAULT_PORTAL_IMAGE = "node:24-alpine"


def ensure_network(network_name: str) -> None:
    try:
        docker_utils.DOCKER_CLIENT.networks.get(network_name)
    except Exception:
        docker_utils.DOCKER_CLIENT.networks.create(network_name)


def load_pidp_editme(pidp_dir: Path):
    path = pidp_dir / "pidp_editme.py"
    if not path.is_file():
        example = pidp_dir / "pidp_editme.example.py"
        raise RuntimeError(f"PIdP config not found at {path}; copy/edit {example} first")
    spec = importlib.util.spec_from_file_location("bmoremedtech_pidp_editme", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load PIdP config at {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def wait_for_container_healthy(container_name: str, label: str, attempts: int = 80) -> None:
    for _ in range(attempts):
        container = docker_utils.DOCKER_CLIENT.containers.get(container_name)
        container.reload()
        health = container.attrs.get("State", {}).get("Health", {}).get("Status")
        if health == "healthy":
            return
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {label} container {container_name} to become healthy")


def wait_for_container_port(container_name: str, port: int, label: str, runtime: str, attempts: int = 180) -> None:
    if runtime == "node":
        command = [
            "node",
            "-e",
            (
                "const net=require('net');"
                f"const s=net.createConnection({port}, '127.0.0.1');"
                "s.setTimeout(1000);"
                "s.on('connect',()=>{s.destroy();process.exit(0)});"
                "s.on('timeout',()=>process.exit(1));"
                "s.on('error',()=>process.exit(1));"
            ),
        ]
    else:
        command = [
            "python",
            "-c",
            (
                "import socket;"
                "s=socket.socket();"
                "s.settimeout(1);"
                f"s.connect(('127.0.0.1',{port}));"
                "s.close()"
            ),
        ]

    for _ in range(attempts):
        container = docker_utils.DOCKER_CLIENT.containers.get(container_name)
        container.reload()
        if container.status != "running":
            raise RuntimeError(f"{label} container {container_name} is {container.status}")
        result = container.exec_run(command)
        if result.exit_code == 0:
            return
        time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {label} at {container_name}:{port}")


def local_system_values(args: argparse.Namespace) -> dict[str, str]:
    public_base = f"https://127.0.0.1:{args.site_port}"
    pidp_public_base = f"{public_base}/pidp"
    portal_internal_base = f"http://{args.system_prefix}portal-dev:5173"
    allowed_origins = ",".join(
        [
            public_base,
            f"https://localhost:{args.site_port}",
            f"https://host.docker.internal:{args.site_port}",
        ]
    )

    return {
        "public_base": public_base,
        "pidp_public_base": pidp_public_base,
        "portal_internal_base": portal_internal_base,
        "allowed_origins": allowed_origins,
    }


def start_pidp(args: argparse.Namespace, values: dict[str, str]) -> None:
    pidp_dir = Path(args.pidp_dir)
    pidp_editme = load_pidp_editme(pidp_dir)
    db_name = f"{args.system_prefix}pidpdb"
    pidp_name = f"{args.system_prefix}pidp-dev"
    db_url = (
        f"postgresql+asyncpg://{pidp_editme.PIDP_POSTGRES_USER}:"
        f"{pidp_editme.PIDP_POSTGRES_PASSWORD}@{db_name}:5432/PIdP"
    )

    docker_utils.run_container(
        {
            "image": "postgres:15-alpine",
            "detach": True,
            "name": db_name,
            "network": args.system_network,
            "restart_policy": {"Name": "unless-stopped"},
            "user": "postgres",
            "environment": {
                "POSTGRES_PASSWORD": pidp_editme.PIDP_POSTGRES_PASSWORD,
                "POSTGRES_USER": pidp_editme.PIDP_POSTGRES_USER,
                "POSTGRES_DB": "PIdP",
            },
            "volumes": {
                f"{args.system_prefix}PIdP_POSTGRES": {"bind": "/var/lib/postgresql/data", "mode": "rw"}
            },
            "healthcheck": {
                "test": ["CMD-SHELL", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\""],
                "interval": 5000000000,
                "timeout": 5000000000,
                "retries": 20,
            },
        }
    )
    wait_for_container_healthy(db_name, "PIdP database")

    docker_utils.remove_container(pidp_name)
    docker_utils.run_container(
        {
            "image": args.pidp_image,
            "name": pidp_name,
            "detach": True,
            "network": args.system_network,
            "restart_policy": {"Name": "unless-stopped"},
            "working_dir": "/app",
            "volumes": {
                str(pidp_dir): {"bind": "/app", "mode": "rw"},
                f"{args.system_prefix}pidp-venv": {"bind": "/venv", "mode": "rw"},
            },
            "environment": {
                "ENV": "dev",
                "DATABASE_URL": db_url,
                "SECRET_KEY": os.getenv("PIDP_SECRET_KEY", "bmoremedtech-local-dev-secret"),
                "PII_ENCRYPTION_KEYS": os.getenv("PIDP_PII_ENCRYPTION_KEYS", ""),
                "AUTO_CREATE_TABLES": "true",
                "ALLOWED_ORIGINS": values["allowed_origins"],
                "EMAIL_VERIFICATION_REQUIRED": os.getenv("PIDP_EMAIL_VERIFICATION_REQUIRED", "true"),
                "EMAIL_VERIFICATION_TOKEN_MINUTES": os.getenv("PIDP_EMAIL_VERIFICATION_TOKEN_MINUTES", "1440"),
                "EMAIL_VERIFICATION_DELIVERY": os.getenv("PIDP_EMAIL_VERIFICATION_DELIVERY", "log"),
                "EMAIL_FROM": os.getenv("PIDP_EMAIL_FROM", ""),
                "SMTP_HOST": os.getenv("PIDP_SMTP_HOST", ""),
                "SMTP_PORT": os.getenv("PIDP_SMTP_PORT", "587"),
                "SMTP_USERNAME": os.getenv("PIDP_SMTP_USERNAME", ""),
                "SMTP_PASSWORD": os.getenv("PIDP_SMTP_PASSWORD", ""),
                "SMTP_STARTTLS": os.getenv("PIDP_SMTP_STARTTLS", "true"),
                "GOOGLE_WORKSPACE_SMTP_USERNAME": os.getenv("PIDP_GOOGLE_WORKSPACE_SMTP_USERNAME", ""),
                "GOOGLE_WORKSPACE_SMTP_PASSWORD": os.getenv("PIDP_GOOGLE_WORKSPACE_SMTP_PASSWORD", ""),
                "GOOGLE_WORKSPACE_EMAIL_FROM": os.getenv("PIDP_GOOGLE_WORKSPACE_EMAIL_FROM", ""),
                "GOOGLE_WORKSPACE_ALLOWED_SENDERS": os.getenv("PIDP_GOOGLE_WORKSPACE_ALLOWED_SENDERS", ""),
                "ALLOWED_NATIVE_REDIRECT_SCHEMES": os.getenv(
                    "PIDP_ALLOWED_NATIVE_REDIRECT_SCHEMES",
                    "org.arkavo.portal",
                ),
                "ALLOW_CROSS_LANE_REDIRECT": "false",
                "ACCESS_TOKEN_EXPIRE_MINUTES": os.getenv("PIDP_ACCESS_TOKEN_EXPIRE_MINUTES", "525600"),
                "GOOGLE_CLIENT_ID": pidp_editme.PIDP_GOOGLE_CLIENT_ID,
                "GOOGLE_CLIENT_SECRET": pidp_editme.PIDP_GOOGLE_CLIENT_SECRET,
                "GOOGLE_REDIRECT_URI": f"{values['pidp_public_base']}/auth/google/callback",
                "GITHUB_CLIENT_ID": pidp_editme.PIDP_GITHUB_CLIENT_ID,
                "GITHUB_CLIENT_SECRET": pidp_editme.PIDP_GITHUB_CLIENT_SECRET,
                "GITHUB_REDIRECT_URI": f"{values['pidp_public_base']}/auth/github/callback",
                "FRONTEND_REDIRECT_URL": f"{values['public_base']}/auth/callback",
                "MINIO_ENDPOINT": pidp_editme.MINIO_ENDPOINT,
                "MINIO_ACCESS_KEY": pidp_editme.MINIO_ACCESS_KEY,
                "MINIO_SECRET_KEY": pidp_editme.MINIO_SECRET_KEY,
                "MINIO_BUCKET": pidp_editme.MINIO_BUCKET,
                "MINIO_PUBLIC_BASE_URL": f"{values['pidp_public_base']}/s3",
                "MINIO_USE_SSL": os.getenv("PIDP_MINIO_USE_SSL", "true"),
                "MINIO_SERVER_SIDE_ENCRYPTION": os.getenv("PIDP_MINIO_SERVER_SIDE_ENCRYPTION", "AES256"),
            },
            "command": [
                "sh",
                "-c",
                (
                    "python -m venv /venv && "
                    "/venv/bin/pip install --quiet --disable-pip-version-check -r requirements.txt && "
                    "exec /venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-dir /app"
                ),
            ],
        }
    )
    wait_for_container_port(pidp_name, 8000, "PIdP", "python", attempts=240)


def start_orgportal(args: argparse.Namespace, values: dict[str, str]) -> None:
    portal_dir = Path(args.orgportal_dir) / "web"
    if not (portal_dir / "package.json").is_file():
        raise RuntimeError(f"OrgPortal web checkout not found at {portal_dir}")
    portal_name = f"{args.system_prefix}portal-dev"
    docker_utils.remove_container(portal_name)
    docker_utils.run_container(
        {
            "image": args.portal_image,
            "name": portal_name,
            "detach": True,
            "network": args.system_network,
            "restart_policy": {"Name": "unless-stopped"},
            "working_dir": "/app",
            "volumes": {
                str(portal_dir): {"bind": "/app", "mode": "rw"},
                f"{args.system_prefix}orgportal-node-modules": {"bind": "/app/node_modules", "mode": "rw"},
            },
            "environment": {
                "NODE_ENV": "development",
                "CHOKIDAR_USEPOLLING": os.getenv("ORGPORTAL_DEV_CHOKIDAR_USEPOLLING", "1"),
                "CHOKIDAR_INTERVAL": os.getenv("ORGPORTAL_DEV_CHOKIDAR_INTERVAL", "200"),
                "WATCHPACK_POLLING": os.getenv("ORGPORTAL_DEV_WATCHPACK_POLLING", "true"),
                "VITE_PIDP_BASE_URL": "/pidp",
                "VITE_DATA_SOURCE": os.getenv("ORGPORTAL_DATA_SOURCE", "api"),
                "VITE_PUBLIC_BASE": "/",
                "VITE_HMR_HOST": "localhost",
                "VITE_HMR_PROTOCOL": "ws",
                "VITE_HMR_CLIENT_PORT": "5173",
                "VITE_ALLOWED_HOSTS": ",".join(
                    [
                        "localhost",
                        "127.0.0.1",
                        f"{args.system_prefix}portal-dev",
                    ]
                ),
                "PIDP_PROXY_ORIGIN": args.pidp_origin,
                "ORG_API_ORIGIN": args.org_api_origin,
            },
            "command": [
                "sh",
                "-c",
                "npm ci --no-audit --no-fund && npm run dev -- --host 0.0.0.0 --port 5173 --strictPort",
            ],
        }
    )
    wait_for_container_port(portal_name, 5173, "OrgPortal", "node", attempts=180)


def start_shared_system(args: argparse.Namespace) -> None:
    ensure_network(args.system_network)
    values = local_system_values(args)
    start_pidp(args, values)
    start_orgportal(args, values)


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
    environment = {
        "SITE_ROOT": f"{WORKSPACE}/dist",
        "CONTAINER_PORT": "8080",
        "TLS_CERT_FILE": "/certs/localhost.crt",
        "TLS_KEY_FILE": "/certs/localhost.key",
    }
    if args.org_api_origin:
        environment["ORG_API_ORIGIN"] = args.org_api_origin
    if args.pidp_origin:
        environment["PIDP_PROXY_ORIGIN"] = args.pidp_origin
    if args.portal_origin:
        environment["PORTAL_SITE_ORIGIN"] = args.portal_origin

    config = {
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
        "environment": environment,
        "command": [
            "node",
            "scripts/local-static-server.mjs",
        ],
    }
    if not args.medtech_only:
        config["network"] = args.system_network
    docker_utils.run_container(
        config
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
    if not args.medtech_only:
        start_shared_system(args)
    if args.build:
        build_site(args)
    start_site(args)
    start_selenium(args)
    print(f"Local site:       https://127.0.0.1:{args.site_port}/")
    print(f"Selenium status:  http://127.0.0.1:{args.selenium_port}/status")
    if not args.medtech_only:
        print(f"Portal proxy:     {args.portal_origin}")
        print(f"PIdP proxy:       {args.pidp_origin}")
        print(f"Shared network:   {args.system_network}")
    print(f"Live source mount: {root} -> {WORKSPACE}")


def run_tests(args: argparse.Namespace) -> None:
    if not args.medtech_only:
        start_shared_system(args)
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
    names = [
        args.site_container_name,
        args.selenium_container_name,
        f"{PREFIX}build",
        f"{PREFIX}selenium-regression",
    ]
    names.extend(
        [
            f"{args.system_prefix}pidpdb",
            f"{args.system_prefix}pidp",
            f"{args.system_prefix}pidp-dev",
            f"{args.system_prefix}portal",
            f"{args.system_prefix}portal-dev",
        ]
    )
    for name in names:
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
    parser.add_argument("--pidp-image", default=os.getenv("PIDP_DEV_BASE_IMAGE", DEFAULT_PIDP_IMAGE))
    parser.add_argument("--portal-image", default=os.getenv("ORGPORTAL_DEV_BASE_IMAGE", DEFAULT_PORTAL_IMAGE))
    parser.add_argument("--medtech-only", action="store_true", help="Start only the MedTech site and Selenium harness.")
    parser.add_argument("--system-network", default=os.getenv("BMORE_MEDTECH_SYSTEM_NETWORK", DEFAULT_SYSTEM_NETWORK))
    parser.add_argument("--system-prefix", default=os.getenv("BMORE_MEDTECH_SYSTEM_PREFIX", DEFAULT_SYSTEM_PREFIX))
    parser.add_argument("--orgportal-dir", default=os.getenv("ORGPORTAL_DIR", str(root.parent / "OrgPortal")))
    parser.add_argument("--pidp-dir", default=os.getenv("PIDP_DIR", str(root.parent / "pidp")))
    parser.add_argument("--org-api-origin", default=os.getenv("ORG_API_ORIGIN", DEFAULT_ORG_API_ORIGIN))
    parser.add_argument("--pidp-origin", default=os.getenv("PIDP_PROXY_ORIGIN"))
    parser.add_argument("--portal-origin", default=os.getenv("PORTAL_SITE_ORIGIN"))


def normalize_args(args: argparse.Namespace) -> argparse.Namespace:
    if hasattr(args, "orgportal_dir"):
        args.orgportal_dir = str(Path(args.orgportal_dir).expanduser().resolve())
    if hasattr(args, "pidp_dir"):
        args.pidp_dir = str(Path(args.pidp_dir).expanduser().resolve())
    if getattr(args, "medtech_only", True):
        return args
    prefix = args.system_prefix
    if not args.pidp_origin:
        args.pidp_origin = f"http://{prefix}pidp-dev:8000"
    if not args.portal_origin:
        args.portal_origin = f"http://{prefix}portal-dev:5173"
    return args


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
        default=os.getenv("BMORE_MEDTECH_TEST_PAGES", "home,calendar,map,taxonomy,datasets"),
    )
    test_parser.set_defaults(func=run_tests)

    stop_parser = subparsers.add_parser("stop")
    add_common_options(stop_parser)
    stop_parser.set_defaults(func=stop)

    status_parser = subparsers.add_parser("status")
    add_common_options(status_parser)
    status_parser.set_defaults(func=status)

    return normalize_args(parser.parse_args())


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
