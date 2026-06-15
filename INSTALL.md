# Install First Light on Any Device

> **No App Store. No download. Works offline. Free.**
>
> First Light is a PWA (Progressive Web App). It installs straight from the browser onto your home screen / dock / start menu and runs as a standalone app — full screen, no browser chrome, offline-capable, with PIN + biometric unlock.

**Skip the docs and go to → https://firstlight.live/install.html** — the page auto-detects your device and walks you through the exact path.

---

## Universal credentials

- **Default PIN:** `2259` — change it from Settings → Security after first unlock.
- **Biometric (optional):** Face ID / Touch ID / Windows Hello / Android fingerprint — set up the first time you unlock.

---

## iPhone (iOS 16.4+ recommended)

> Apple intentionally blocks programmatic install on iOS. The only path is Safari → Share → Add to Home Screen.

1. Open **Safari** (must be Safari — Chrome/Firefox on iOS are all Safari underneath but the Share menu has the install entry).
2. Go to **https://firstlight.live**
3. Tap the **Share** icon `⬆️` in the bottom bar.
4. Scroll down and tap **Add to Home Screen** `⊞`.
5. Confirm the name **FL Punch** and tap **Add** (top-right).
6. Open from your home screen — unlock with PIN `2259`.

**You'll be offered Face ID enrollment** on the second unlock if your iPhone has it.

### What you get
- Standalone launch — no Safari address bar, no tabs
- Lock-screen splash with the FirstLight icon
- 4 shortcuts when you long-press the icon: **Punch · Command Center · Add Slip · Mastery**
- IndexedDB persistence so offline writes survive force-quits

---

## iPad (iPadOS 16.4+)

Identical to iPhone. The **Share** icon is in the **top-right** corner of Safari on iPad, not the bottom.

The PWA runs in iPad landscape with a **2-column layout** — Run + Slips full-width, Sleep / Food / Brahma / Mastery side-by-side.

---

## Mac (Chrome / Edge / Brave / Arc / Vivaldi)

> One-click install in any Chromium-based browser.

1. Open **Chrome** (or Edge / Brave / Arc).
2. Go to **https://firstlight.live**
3. Click the **install icon** `⊕` in the right side of the address bar.
   - Alternatively: Chrome menu (⋮) → **Install First Light**…
4. Confirm. The app opens in its own window with the cyan header.
5. Drag the icon from Spotlight / Launchpad to your Dock so it stays put.

**Safari 17+ on macOS Sonoma:** Safari now supports basic PWA install via **File → Add to Dock**, but Chrome/Edge give a richer experience (background sync, push, etc.).

---

## Windows (Chrome / Edge)

1. Open **Edge** or **Chrome**.
2. Go to **https://firstlight.live**
3. Click the **install icon** in the address bar.
4. The app appears in your **Start menu** and can be pinned to the taskbar.

Edge gets a slight bonus on Windows: it integrates the PWA with Windows notifications + the Action Center.

---

## Linux desktop (Chrome / Brave / Vivaldi)

Same as Mac/Windows — click the install icon in the address bar. App appears in your application launcher.

---

## Android (Chrome 90+)

> One-click install — Chrome detects PWAs automatically.

1. Open **Chrome** on your phone or tablet.
2. Go to **https://firstlight.live**
3. Chrome usually pops up an "Add First Light to Home screen?" sheet. Tap **Install**.
4. If you missed the prompt: menu (⋮) → **Install app**.

You'll see the maskable icon (won't get cropped by Android's adaptive icon styles).

---

## Want a real native installer instead of a PWA?

The PWA is the recommended path — it installs faster, updates automatically, and works offline. But if you want a real native package:

- **Windows `.msix` / macOS `.pkg` / Android `.apk` / iOS `.ipa`** — Microsoft's **PWA Builder** generates all of these from this site:
  → **https://www.pwabuilder.com/reportcard?site=https%3A%2F%2Ffirstlight.live**
- Click the platform tile (Windows, Android, iOS, etc.) → download → install on the target device.

Caveats:
- **iOS .ipa requires an Apple Developer account** ($99/year) to actually sideload. PWA Builder generates the package, but Apple won't let you install unsigned IPAs.
- **Android .apk** can be installed directly after enabling "Install unknown apps" on the device, OR uploaded to Play Store if you have a developer account.
- **Windows .msix** can be installed directly or pushed to the Microsoft Store.

For your personal use (single device per platform), the PWA install is the better path — no signing, no store, no fees, instant updates.

---

## Updating the app

PWAs update **automatically** when there's a new deploy:

- Open the installed app — the service worker checks for updates in the background.
- A small "update available" hint appears in the top-right status pill if the shell changed.
- Tap the status pill → **DRAIN NOW** if you want to force-sync queued offline writes.

No manual update needed. Ever.

---

## Uninstall

| Platform | How |
|---|---|
| iPhone / iPad | Long-press icon → **Remove App** → **Delete App** |
| Android | Long-press icon → **Uninstall** |
| Mac (Chrome) | Open the app → ⋮ menu → **Uninstall First Light** |
| Windows (Edge) | Settings → Apps → First Light → **Uninstall** |

Uninstall removes the icon + app shell. **Your data stays in Supabase** (sync source of truth), so reinstalling restores everything once you unlock + first sync runs.

---

## Troubleshooting

**"Install" button isn't appearing on desktop Chrome/Edge?**
- The site must be served over HTTPS — `firstlight.live` is. ✓
- Manifest + service worker must register correctly — visit `chrome://inspect/#service-workers` to confirm.
- You may have already installed — check Chrome menu for "Open First Light".

**iPhone "Add to Home Screen" missing the FirstLight icon?**
- Make sure you're in **Safari**, not Chrome/Firefox iOS (same engine, different Share menu).
- Try **Safari → Settings → Advanced → Experimental Features** — disable any web-related experimental toggles, reload.

**Offline writes not syncing back online?**
- Tap the status pill (top-right) → **DRAIN NOW**.
- Or **VIEW QUEUE** to see exactly what's pending; per-row retry available.

**Forgot the PIN?**
- The default is `2259` unless you changed it.
- If you changed it and forgot: in DevTools console run `FL.auth.resetAll()` to nuke local auth, then re-set on next launch.

---

## What's actually installed?

Looking at it from a technical angle:

| Component | Where it lives | Survives reload |
|---|---|---|
| App shell (HTML/CSS/JS) | Service Worker cache `fl-shell-v4` | ✓ |
| Offline write queue | IndexedDB `fl-sync.writes` | ✓ |
| Read cache | IndexedDB `fl-cache.rows` + SW cache `fl-supa-reads-v3` | ✓ |
| PIN hash | IndexedDB `fl-auth.vault` (PBKDF2, 200K iters) | ✓ |
| Biometric credential | IndexedDB `fl-auth.vault` + platform Secure Enclave | ✓ |
| Unlock session | sessionStorage (12h grace) | per-tab |
| Device ID (LWW tiebreak) | localStorage `fl_device_id` | ✓ |

Total disk footprint per device: **~3-4 MB** typically (depends on how much you punch).

---

## Source

- **Web app:** https://github.com/firstlightlive/firstlight
- **Service worker:** [website/sw.js](website/sw.js)
- **Offline runtime:** [website/js/fl-offline.js](website/js/fl-offline.js)
- **Auth gate:** [website/js/fl-auth.js](website/js/fl-auth.js)
- **Punch screen:** [website/punch.html](website/punch.html)
- **Manifest:** [website/manifest.json](website/manifest.json)
