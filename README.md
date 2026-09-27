# Pre-Call Checklist

A phone app for HVAC techs: work through the checks at the unit, then copy a clean summary to text or email before you call for help.

- **7 short steps** (unit, voltage, amps, refrigerant, air side, heat, the call) with a progress bar you can tap to jump around.
- **Live flags** as you type: phase and leg imbalance, amps over RLA, blower over FLA, capacitor out of tolerance, superheat for the metering device, temperature split.
- **Review screen** that puts the flags first. Once the required fields are in, **Text it** opens Messages with the whole summary typed in (set who it goes to in Profile), or copy or share it instead.
- **Saves as you go** on the phone. Unfinished calls wait on the home screen.
- **Units tab** groups past calls by serial number, and the Unit step tells you when a unit has been called in before.
- **AI check** on the review screen: Claude reads all the readings and suggests likely causes (with the readings behind each), what to check next, safety notes, and which missing readings would help. Suggestions only; verify before acting.
- **Works offline** once it has been opened once, and installs to the home screen. (The AI check needs signal.)

Everything stays in the browser on that phone (`localStorage`). The only thing sent anywhere is the AI check: when you tap it, the readings (not your name or the work order number) go to Claude, through your team server if you set one up.

## Turning on the AI check

There are two ways:

- **For a team (recommended):** deploy the small server in [`server/`](server/README.md). It holds your Claude API key, gives each tech their own team code, and caps how often each tech can run checks. Then put the server's address in [`config.js`](config.js). Techs enter their team code in **Profile**.
- **Just for you:** create an API key at [console.anthropic.com](https://console.anthropic.com) and paste it into **Profile → Claude API key**. The key is saved on that phone and the phone calls Claude directly, so only do this on a phone you control.

Each check is billed to the Claude account, usually a few cents. Set a monthly spend limit in the Anthropic Console.

## Run it

It's plain HTML, CSS and JavaScript with no build step. Serve the folder:

```sh
python3 -m http.server 8000
```

then open http://localhost:8000. (Offline mode and installing need `https://` or `localhost`.)

## Put it online

Turn on **GitHub Pages** for this repository (Settings → Pages → Deploy from a branch → `main`, `/ (root)`). The app will be at `https://<user>.github.io/<repo>/`. Open that on the phone and add it to the home screen:

- **iPhone:** Share → Add to Home Screen
- **Android:** browser menu → Install app

## Files

| File | What it is |
| --- | --- |
| `index.html` | App page |
| `app.js` | Checklist fields, flag rules, screens, saving |
| `app.css` | Styles |
| `sw.js` | Service worker for offline use |
| `config.js` | Team settings: the AI server's address |
| `ai-prompt.js` | What the AI check asks Claude, shared by the app and the server |
| `server/` | The team AI server (Cloudflare Worker) |
| `vendor/anthropic-sdk.js` | Anthropic's official JavaScript SDK (v0.128.0), bundled for the browser, MIT licensed |
| `manifest.webmanifest`, `icons/` | Home screen install |
| `pre-call-checklist.html` | The original single-page checklist |

When you change `app.js` or `app.css`, bump `CACHE` in `sw.js` (`precall-v1` → `precall-v2`) so installed copies pick up the new files.
