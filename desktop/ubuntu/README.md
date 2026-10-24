# LifeTech for Ubuntu

LifeTech uses a dedicated Electron window with the Ubuntu window frame, native
application menus, LifeTech's favicon as its window and launcher icon, and a compact
desktop layout. It follows the OS light/dark appearance unless you choose a theme.
The runtime is included; Chrome is not required. Live services need internet access.

## Development

From this repository:

```sh
npm ci
npm run dev:ubuntu
```

Vite starts with LifeTech branding and live reload, chooses an available port
starting at 5173, and opens the desktop window at the actual URL. Closing the
window or pressing Ctrl+C stops the development server. Use
`LIFETECH_DEV_PORT=5174 npm run dev:ubuntu` to require a particular port.
The View menu includes reload, zoom, fullscreen, and development tools.

The Vite loop serves the frontend only. For authenticated portal/API development,
start the existing local stack with `python run.py start --site-brand lifetech`.
After installing the desktop package, open its displayed URL with:

```sh
lifetech --dev http://localhost:8080/
```

Development sessions use `~/.config/lifetech-desktop-dev`; production sessions
use `~/.config/lifetech-desktop` (under `$XDG_CONFIG_HOME` when set). Sign in separately.

## Build and install

Build on Ubuntu/Debian with Node.js, Python 3 and `dpkg-deb` after `npm ci`:

```sh
npm run build:ubuntu
sudo apt install ./dist-ubuntu/lifetech_2.1.0_amd64.deb
```

The artifact's architecture matches the build machine. Open **LifeTech** in
Applications, or run `lifetech`. The launcher also has a Development action for
an already-running server at `http://localhost:5173/`; custom ports use `--dev URL`.
The package installs Chromium's root-owned sandbox helper without disabling the
renderer sandbox. Rebuild and reinstall to update the desktop runtime or desktop
styles; live website content updates automatically.

Uninstall with `sudo apt remove lifetech`. Saved sessions remain in the profile
directories above; delete those directories to remove the sessions too.

## Checks

Run `npm run test:ubuntu` in a desktop session, or
`xvfb-run -a npm run test:ubuntu` headlessly (requires Xvfb and `xprop`). This checks
the native window icon and application grouping, menus, sandbox, favicon, themes,
window layouts, and live reload. Screenshots and reports are saved under the
workspace's `artifacts/lifetech-native` directory.

On Ubuntu systems that restrict development user namespaces, the dev command
uses an existing root-owned sandbox helper from the installed LifeTech package
or Google Chrome. Installing the LifeTech package supplies that helper; it does
not disable sandboxing.

Run `npm run test:ubuntu:clickthrough` (with `xvfb-run -a` headlessly) for the
navigation and visual sweep. It saves screenshots and a contact sheet under
`artifacts/lifetech-clickthrough` and fails on broken destinations or page errors.
The headless sweep uses software WebGL; it does not verify hardware acceleration.

The desktop development server connects API requests and shared portal links to
the existing local LifeTech stack at `https://localhost:8770`. Override the local
loopback endpoint with `LIFETECH_LOCAL_ORIGIN`. Start that stack before testing
Events or Login. Portal navigation keeps its own Vite/assets/authentication flow.
Only the certificate matching `.local/certs/localhost.crt` is trusted by the
Electron development window. Production certificate checks remain enabled.

The Organization launcher registers the HTTPS loopback preview origins for ports
8769 and 8770 with local PIdP, using the shared `orgportal` account namespace.
The development window pins the local preview certificate and the separate
`OrgPortal/.local/certs/localhost.crt` identity certificate at
`https://id.localhost:8443`. Identity pages keep their own presentation.
Override `LIFETECH_IDENTITY_ORIGIN`, `LIFETECH_IDENTITY_CERT`, and
`LIFETECH_DEV_CERT` for a custom local deployment. When invoking the installed
`lifetech --dev` command, run it from this repository or set those certificate
paths explicitly.

Run `npm run test:ubuntu:login` against the running local containers for the full
password handoff and session-reload check. The test creates and deletes one
unprivileged synthetic member in the local identity database and removes its
isolated browser profile. It does not require your credentials.

## Browser sign-in

Click **Login**, or choose **LifeTech → Sign in Using Browser**. The app opens
PIdP in your default web browser. Finish signing in there, then return to LifeTech;
the app signs in automatically. This uses S256 PKCE, a one-use authorization code,
a random callback state, and an ephemeral listener bound only to `127.0.0.1`.
The verifier remains in the Electron main process. PIdP also checks the initiating
app's HTTP-only cookie before creating its remembered app session.

**LifeTech → Sign in Here** keeps sign-in inside the app.
**Cancel Browser Sign-in** cancels the pending listener; unfinished requests expire
after ten minutes. The browser-auth tests use a separate disposable browser context
and local member account:

```sh
npm run test:ubuntu:callback
xvfb-run -a npm run test:ubuntu:browser-auth
```

Browser sign-in requires the updated PIdP service. The local Python container
creates its new ephemeral request table at startup. Worker deployments require
PIdP migration `0015_portal_desktop_auth.sql` before enabling this flow remotely.
The Ubuntu package does not deploy or migrate PIdP.
