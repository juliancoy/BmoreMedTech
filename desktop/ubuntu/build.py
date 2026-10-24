#!/usr/bin/env python3
"""Build the LifeTech Ubuntu package using the system Debian tools."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = "2.1.0"


def build():
    arch = subprocess.check_output(["dpkg", "--print-architecture"], text=True).strip()
    runtime = ROOT / "node_modules/electron/dist"
    if not (runtime / "electron").exists():
        subprocess.run(["node", "-e", "require('electron')"], cwd=ROOT, check=True)
    output = ROOT / "dist-ubuntu"
    output.mkdir(exist_ok=True)
    artifact = output / f"lifetech_{VERSION}_{arch}.deb"
    with tempfile.TemporaryDirectory(prefix="lifetech-deb-") as temp:
        stage = Path(temp)
        shutil.copytree(runtime, stage / "opt/lifetech")
        (stage / "opt/lifetech/resources/default_app.asar").unlink(missing_ok=True)
        for source, target, mode in (
            (ROOT / "desktop/ubuntu/lifetech", "usr/bin/lifetech", 0o755),
            (ROOT / "desktop/ubuntu/lifetech.desktop", "usr/share/applications/lifetech.desktop", 0o644),
            (ROOT / "assets/images/lifetech-logo-v2.png", "usr/share/pixmaps/lifetech.png", 0o644),
            (ROOT / "desktop/ubuntu/lifetech-dev.desktop", "usr/share/applications/lifetech-dev.desktop", 0o644),
        ):
            dest = stage / target
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, dest)
            dest.chmod(mode)
        app = stage / "opt/lifetech/resources/app"
        app.mkdir()
        for filename in ("main.cjs", "preload.cjs", "browser-auth.cjs", "desktop.css"):
            shutil.copyfile(ROOT / "desktop/ubuntu" / filename, app / filename)
        shutil.copyfile(ROOT / "assets/images/lifetech-logo-v2.png", app / "icon.png")
        (app / "package.json").write_text(json.dumps({"name": "lifetech", "productName": "LifeTech", "version": VERSION, "main": "main.cjs"}))
        (stage / "opt/lifetech/chrome-sandbox").chmod(0o4755)
        control = stage / "DEBIAN/control"
        control.parent.mkdir()
        control.write_text(f"""Package: lifetech
Version: {VERSION}
Section: net
Priority: optional
Architecture: {arch}
Maintainer: Julian Coy <jcloiacon@gmail.com>
Depends: libgtk-3-0 | libgtk-4-1, libnss3, libasound2t64 | libasound2, libgbm1, libdrm2, libxss1, libxtst6, libatspi2.0-0
Homepage: https://lifetech.fyi/
Description: LifeTech desktop app
 Health, medicine and biotech with native desktop menus and window controls.
 Includes its web runtime; requires internet access for live services.
""")
        env = {**os.environ, "SOURCE_DATE_EPOCH": os.environ.get("SOURCE_DATE_EPOCH", "1792800000")}
        subprocess.run(["dpkg-deb", "--root-owner-group", "--build", str(stage), str(artifact)], check=True, env=env)
    print(artifact)


if __name__ == "__main__":
    build()
