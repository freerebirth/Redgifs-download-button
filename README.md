![Thebuttontheyforfo](https://github.com/user-attachments/assets/cd0fecdb-85de-4782-ba20-6e64a912ce2b)

<div align="center">

# 🚀 Redgifs Downloader Button  

### The button Redgifs forgot to add.  

[![GitHub release](https://img.shields.io/github/v/release/freerebirth/Redgifs-download-button?style=for-the-badge&color=ff5252&label=Latest%20Version)](https://github.com/freerebirth/Redgifs-download-button/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/freerebirth/Redgifs-download-button/total?style=for-the-badge&color=4CAF50&label=Total%20Downloads)](https://github.com/freerebirth/Redgifs-download-button/releases)
[![GitHub stars](https://img.shields.io/github/stars/freerebirth/Redgifs-download-button?style=for-the-badge&color=FFD700)](https://github.com/freerebirth/Redgifs-download-button/stargazers)
[![License](https://img.shields.io/github/license/freerebirth/Redgifs-download-button?style=for-the-badge&color=blue)](LICENSE)

---

### ❌ Rejected by Chrome. ❌ Rejected by Firefox.  
### ✅ Approved by Me.  

</div>

I tried to do things the *proper* way. I really did. Submitted this extension to the **Chrome Web Store** and the **Firefox Add-ons Store**, thinking,  
*"Hey, this is a simple, useful tool—what could go wrong?"*  

Well… **both rejected it.** 🎉  

So I said **"F**k it"** and uploaded it here.  

No weird websites. No sketchy extensions. Just a **clean, fast, and easy** way to download Redgifs videos **in HD, with audio, instantly**.  

---

## 🔥 Features  

| Feature | Description |
|---------|-------------|
| ⬇️ **One-click download** | No setup, no pop-ups, no BS. Just click and save. |
| 🎬 **HD + Audio** | Always downloads the highest quality available. |
| ⚡ **Fast & smooth** | No delays, no lag, just results. |
| 💰 **Completely free** | No hidden fees, no daily limits, no ads. |
| 🪶 **Lightweight** | Runs seamlessly without slowing down your browser. |
| 🔄 **Auto-update notifications** | Get notified when a new version is available. |
| 📱 **Android support** | Works on Kiwi, Lemur, and other Chromium Android browsers. |
| 🛡️ **Smart download** | 3-tier fallback system ensures downloads work on any browser. |
| 🔁 **Auto-retry** | Failed downloads automatically retry with exponential backoff. |

---

## 🆕 What's New in v1.4

<details>
<summary>🐛 <b>Bug Fixes</b></summary>

- ✅ Fixed a crash bug on Chrome that broke downloads on certain pages
- ✅ Fixed update notification on Firefox (was checking the wrong URL — oops!)
- ✅ Fixed `.m4s` file extension issue — downloads now always save as `.mp4`
- ✅ Download errors are now shown clearly instead of failing silently

</details>

<details>
<summary>📱 <b>Android Browser Support (NEW!)</b></summary>

- ✅ **Kiwi Browser** — downloads now work with blob fallback
- ✅ **Lemur Browser** — fixed `"No matching signature"` crash
- ✅ **3-tier download fallback**: `chrome.downloads` → blob download → direct XHR
- ✅ Works on any Android Chromium browser with extension support

</details>

<details>
<summary>⚡ <b>Performance & Architecture</b></summary>

- 🔄 Automatic retry with exponential backoff + jitter on failed downloads
- 🧹 **45% less code** — removed all dead code and duplication (2,660 → 1,470 lines)
- 🎯 Debounced DOM observer for smoother scrolling performance
- 🎨 All styles consolidated into CSS (no more inline styles)

</details>

<details>
<summary>🦊 <b>Firefox Manifest V3 Migration</b></summary>

- Upgraded from Manifest V2 to Manifest V3
- Removed `browser-polyfill.min.js` dependency
- Minimum Firefox version: 109+

</details>

---

## 🛠️ Installation  

### 🟢 Chrome / Edge / Brave  
> Since the **Chrome Web Store rejected it**, you'll need to install it manually  

1. 📦 **Download** `Chrome_v1.4.zip` from the [**latest release**](https://github.com/freerebirth/Redgifs-download-button/releases/latest)  
2. 📂 **Unzip it** anywhere on your PC  
3. 🌐 Open **Chrome** → go to `chrome://extensions/`  
4. 🔧 Enable **Developer Mode** (toggle in the top right corner)  
5. 📁 Click **"Load unpacked"** and select the unzipped folder  

✅ **Done!** Head to Redgifs and enjoy your **new Download button**.  

---

### 🟠 Firefox  
> Mozilla didn't want it either, so here's how to install it yourself  

#### 🔧 Temporary Installation (for testing)  
1. 📦 **Download** `Firefox_v1.4.zip` from the [**latest release**](https://github.com/freerebirth/Redgifs-download-button/releases/latest)  
2. 📂 **Unzip it** anywhere on your PC  
3. 🌐 Open **Firefox** → go to `about:debugging#/runtime/this-firefox`  
4. 📁 Click **"Load Temporary Add-on"** → select `manifest.json`  

⚠️ **This only lasts until you restart Firefox.**  

#### 🔥 Permanent Installation (Without Signing)  
Some versions of Firefox **allow installing unsigned extensions permanently**:  

- **Firefox Developer Edition**  
- **Firefox Nightly**  
- **Firefox ESR (Enterprise Edition)**  
- **Unbranded Firefox Builds**  

If you're using one of these versions:  

1. Open Firefox → go to `about:config`  
2. Search for `xpinstall.signatures.required`  
3. **Set it to `false`**  
4. Go to `about:addons` → **"Install Add-on From File"** → select the `.xpi` file  

✅ **Now you have a permanently installed extension without signing!**  

🔗 [More info on Extension Signing](https://wiki.mozilla.org/Add-ons/Extension_Signing)  

---

### 📱 Android (Kiwi / Lemur / Edge Canary)  

1. 📦 **Download** `Chrome_v1.4.zip` from the [**latest release**](https://github.com/freerebirth/Redgifs-download-button/releases/latest)  
2. 📂 **Unzip it** on your phone  
3. 🌐 Open your browser's extension page and **load the unpacked extension**  

> 💡 The extension will automatically use a fallback download method optimized for Android  

---

## ☕ Support My Work  

<div align="center">

If this extension saved you from sketchy websites and annoying workarounds,  
consider **buying me a coffee** or sending a small donation! ❤️  

I don't do paywalls, ads, or weird limitations — just **fast, simple, and useful tools.**  
Your support helps me keep it that way! 🚀  

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/M4M31B5A8B)

[![Liberapay](https://img.shields.io/badge/Support%20Me%20on%20Liberapay-%23F6C915?style=for-the-badge&logo=liberapay&logoColor=black)](https://liberapay.com/freerebirth)

</div>

---

## 💡 Suggestions? Bugs?  

Found a bug? Have an idea? Just wanna say thanks?  

[![Open an Issue](https://img.shields.io/badge/Open%20an%20Issue-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/freerebirth/Redgifs-download-button/issues)

---

<div align="center">

## 🚀 Enjoy!  

This is the **Redgifs Download button you always wanted but never got.**  
Now you have it. ⬇️  

⭐ **Star this repo** if you find it useful — it helps others discover it!  

</div>
