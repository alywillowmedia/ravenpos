# Windows Build + Receipt Printer Preflight

Use this checklist before sending a build to the Windows POS laptop.

## 1) Build artifacts on dev machine

```bash
npm run electron:build
```

Expected output files in `electron-dist/`:
- `RavenPOS-Setup-<version>-x64.exe`
- `RavenPOS-Portable-<version>-x64.exe`

The build also runs `npm run electron:verify:artifacts` and prints SHA-256 hashes.

## 2) Quick smoke test with portable build (no installer)

On Windows:
1. Copy `RavenPOS-Portable-<version>-x64.exe`.
2. Run it directly.
3. Confirm app opens and can sign in.
4. Go to printer settings and verify your receipt printer appears.
5. Run a test sale and print a receipt.

If this fails, fix app/printer logic before spending time on installer debugging.

## 3) Installer/uninstaller validation

On Windows:
1. Run `RavenPOS-Setup-<version>-x64.exe`.
2. Install with default options.
3. Launch RavenPOS and print a receipt.
4. Close app fully.
5. Uninstall from `Settings > Apps > Installed apps > RavenPOS`.
6. Reinstall the same installer.
7. Launch and print again.

Pass criteria:
- Install completes without errors.
- App launches after install.
- Receipt printer is discoverable and can print.
- Uninstall completes without errors.
- Reinstall works and app still prints.

## 4) If uninstall fails

Common causes:
- App still running in background.
- Installed with admin rights but uninstall attempted without admin rights.

Check on Windows:
1. End `RavenPOS.exe` in Task Manager.
2. Retry uninstall as administrator.
3. If needed, remove leftover install folder and reinstall fresh.

## 5) Final handoff package

Send both files:
- `RavenPOS-Setup-<version>-x64.exe`
- `RavenPOS-Portable-<version>-x64.exe`

Include the SHA-256 hashes from `npm run electron:verify:artifacts` so you can verify file integrity after transfer.
