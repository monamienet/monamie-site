# AGENTS.md

## Project

Static pages of the MonAmie website (company: MonAmieNet). Each page is a single self-contained HTML file that the owner pastes into **Google Sites** via *Inserir → Incorporar → Incorporar código*, so it runs inside a sandboxed iframe. There is no build step and no package manager.

| File | What it is |
|---|---|
| `home.html` | "Under construction" landing page (en-US) |
| `privacy.html`, `delete-account.html` | Bilingual pt/en pages (`only-pt`/`only-en` classes, localStorage key `monamie-privacy-lang`) |
| `onboarding.html` | Partner onboarding form (pt-BR only), see below |
| `apps-script/` | Google Apps Script backend of the onboarding form, plus `LEIAME.md` with deploy steps (pt-BR) |
| `tests/` | Headless-Chrome tests of the onboarding form |

The pages serve the white-label Flutter app at `~/FlutterProjects/monamie-app`. Read its `AGENTS.md` and `STEPS.md` when you need facts about app instances.

The onboarding form replaced an earlier Google Form, abandoned because Google Forms can't accept SVG uploads.

## Git workflow

- **Repository:** `monamienet/monamie-site` on GitHub (public, like `monamienet/monamie-app`). Use the `gh` account `jvlgoncalves-monamie`.
- **`main` accepts changes only through pull requests.** A repository ruleset requires a PR (0 approvals, so the owner can merge their own) and blocks force pushes and deletion.
- **One branch per task**, named with the change type: `feat/`, `fix/`, `chore/`, `docs/`, `test/`.
- **Commit messages in English.**
- **Open the PR only after the owner approves the work.**
- **Never commit secrets.** The Apps Script `/exec` URL is not a secret, since it is published in the page anyway.

## Conventions

- **Shared look:** copy the skeleton of `delete-account.html` when creating a page. It includes:
  - Tailwind CDN with the `brand` palette (`brand-700` = `#315399`), Plus Jakarta Sans, and Lucide pinned to `lucide@0.468.0` (UMD);
  - `bg-grid-pattern`, the two blurred background blobs and `glass-card`;
  - white `rounded-3xl` section cards with numbered `h2 .num` badges;
  - the bottom-right toast and the footer with the dynamic year.
- **Links:** use absolute paths (`/`, `/privacy/`, `/assets/logo-mark.svg`). They break when a file is opened locally; that is expected.
- **Language:** UI text is pt-BR (except `home.html`). Code comments are in English.
- **Google Sites iframe constraints:**
  - don't depend on `localStorage` or `window.top`;
  - calls to Apps Script must be CORS "simple requests" (POST with no `Content-Type` header, so the body goes as `text/plain`).

## Onboarding form (`onboarding.html` + `apps-script/Code.gs`)

**Fields and rules**, derived from the app's requirements:
- **App name:** always "MonAmie <brand>". Store titles max out at 30 chars, so the brand gets ≤ 22. The prefix is shown fixed, and names starting with "MonAmie" are rejected. The alternative name must differ from the desired one.
- **Colors:** primary and secondary as `#RRGGBB`, with a color picker and a text field kept in sync.
- **Logos:** two SVG drop zones, `symbol` (logo without text) and `full` (logo with text). At least one is required.
  - Only one sent: it is used for both the icon and the login screen.
  - Both sent: `symbol` becomes the icon and `full` goes on the login screen.
  - The owner converts SVG → PNG when building the app.
  - History: it started as PNG icon + logo; on 2026-10-16 the owner switched to SVG only, with no size rule.
- **Other:** a rights-declaration checkbox (required) and a hidden honeypot field `website`.

**Live preview:** a phone mockup with two screens.
- **`home` (launcher):** the app label shows "MonAmie" on one line and the brand on the next.
- **`login`:** must stay identical to the app's `lib/app/modules/login/views/login_view.dart`.
  - AppBar background is `AppColors.darkBlue()`. The form doesn't collect it, so it is approximated as `darken(primary, 0.33)`.
  - AppBar title "MonAmie X": white, bold, 18, centered.
  - White body with the logo at 220×220 (contain), a 48 gap, then `SignInButton(Buttons.google)` with the text "Entrar com o Google".
  - The button is 220×36, white, elevation 2, radius 2, with the "G" image from the `sign_in_button` package embedded as base64.
  - The screen is laid out at 390dp wide and scaled by 0.5949.
  - If the Flutter login changes, update the replica.
- **Auto-switch rule** (owner-specified, implemented with `data-preview-for` attributes):
  - colors → `login`;
  - `symbol` SVG → `home`;
  - `full` SVG → `login`;
  - email, names and confirmation → keep the current screen.
- The secondary color appears in neither screen (the real login doesn't use it).

**Backend:**
- `apps-script/Code.gs` is an Apps Script web app. It:
  - re-validates the submission;
  - saves `logo-sem-texto.svg` / `logo-com-texto.svg` to a Drive subfolder;
  - appends a row to the responses Sheet (including which file is the icon and which is the login logo);
  - emails `NOTIFY_EMAIL`.
- Script Properties: `FOLDER_ID`, `SHEET_ID`, `NOTIFY_EMAIL`.
- Deployed on 2026-10-16. `APPS_SCRIPT_URL` in `onboarding.html` points to the live web app (`.../macros/s/AKfycbyds8_.../exec`). A GET returns `{"ok":true,"service":"monamie-onboarding"}`.
  - Redeploy with *Gerenciar implantações → Nova versão* so the URL doesn't change.
  - Never POST to the live URL from tests or checks: every POST creates real Drive files, a Sheet row and an email.
- Keep the client and server rules in sync: `NAME_MAX`, 5 MB per file, the hex format, the SVG checks and the "at least one logo" rule.

## Testing

- **Run `tests/run.sh`.**
  - It injects `tests/onboarding.test.js` into two copies of the page: one with the placeholder URL, and one with a fake URL and a stubbed `fetch` that captures the payload.
  - Both run in headless `google-chrome` in real time, and the results come back via POST to a throwaway local server.
  - Exit code 0 means everything passed.
  - Update the test whenever the form changes.
- **Visual checks:** take a screenshot with `google-chrome --headless=new --screenshot=out.png --window-size=W,H <url>` and look at the PNG.
- **Pitfalls:**
  - `--virtual-time-budget` / `--dump-dom` race async work (FileReader, image decoding), so checks look like failures. Use real time.
  - Virtual-time screenshots can catch CSS transitions halfway (e.g. the preview tab highlight looks wrong) and ignore `scrollIntoView`. Use a tall window and crop.
  - `pkill -f <pattern>` whose pattern also appears in your own bash command kills that shell (exit 144). Use a bracket trick, e.g. `pkill -f "http.server 876[8]"`.

## Working with the owner

- The owner writes in Portuguese. Reply in pt-BR.
