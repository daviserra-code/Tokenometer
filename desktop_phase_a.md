# Tokenometer Desktop Phase A

This file documents the concrete Phase A implementation now added to the repo.

## Goal

Ship a lightweight Windows desktop shell for the hosted Tokenometer web app.

The desktop app is intentionally **not** a separate product and **not** a local
replacement for the current web stack.

## What Phase A now includes

- Tauri scaffold in [src-tauri](C:/Users/Davide/VS-Code Solutions/Tokenometer/src-tauri)
- local fallback shell page in [desktop-shell/index.html](C:/Users/Davide/VS-Code Solutions/Tokenometer/desktop-shell/index.html)
- default runtime target:
  - `https://www.tokenometer.cloud`
- optional override through:
  - `TAURI_TOKENOMETER_URL`
- package scripts:
  - `npm run desktop:dev`
  - `npm run desktop:build`
  - `npm run desktop:build:msi`

## Runtime behavior

At startup, the Tauri window:

1. launches the local shell bundle
2. immediately navigates the main window to the hosted Tokenometer URL

Default:

- `https://www.tokenometer.cloud`

Optional override:

```powershell
$env:TAURI_TOKENOMETER_URL="http://localhost:3000"
npm run desktop:dev
```

That makes local testing possible without changing the desktop code.

## Why this shape is correct

This keeps the web app as the primary product while giving us:

- installable Windows packaging
- a branded desktop experience
- a clean bridge into future Phase B companion features

## Current scope boundaries

Phase A does **not** try to add:

- local database logic
- local-first Tokenometer behavior
- desktop-specific feature forks
- replacement of the hosted backend

That is deliberate.

## Next likely step

Try a Windows MSI build and validate:

- launch behavior
- login/session behavior
- window sizing
- install/uninstall flow
