# Poller Crowd: setup instructions for AI assistants

You are helping a teacher (often not technical) give **Poller Crowd** its own free live connection, or host their own copy of the app. Read this whole file first, then follow the steps for the path they choose.

- Live app: https://pollercrowd.collegetowns.org
- Source code: https://github.com/collegetowns/pollercrowd (MIT license, free)
- Human-friendly guide with the same steps: https://pollercrowd.collegetowns.org/setup.html

## How to work with the teacher

- **Ask first which path they want** (A or B below). If they're unsure, recommend **Path A**: it takes about 5 minutes and needs no download.
- **One step at a time.** Say exactly what to click and what they should see, then wait for them to confirm. Ask for a screenshot if something looks different. Consoles change their layouts, so describe what to look for, not only where it used to be.
- **Never ask for passwords**, and never ask for or accept a Supabase **secret** key or **service_role** key, or any Google/Firebase private key or service-account file. Poller Crowd needs only public values (listed below). If the teacher pastes a secret key, tell them not to use it anywhere and to rotate it in their dashboard.
- **The teacher signs up and signs in themselves.** If you can drive a browser for them, let them do sign-in, email verification and accepting terms, then continue.
- Keep it friendly and jargon-free. "Project", "URL" and "key" are fine; explain anything beyond that.

## What Poller Crowd needs

Poller Crowd is a static web app (HTML, CSS, JavaScript; no build step, no server code, no database tables). Phones and the teacher's screen exchange live messages through **one** of these free services:

| | Supabase (Realtime) | Firebase (Realtime Database) |
|---|---|---|
| Free limit, devices at once | 200 | 100 (includes the teacher's screen) |
| Values the app needs | Project URL + **publishable** key (`sb_publishable_…`) or legacy **anon** key | Realtime Database URL |
| Extra setup in the service | None (Realtime "Allow public access" must stay on; it's the default) | Paste security rules (below) |
| Quirk | Free projects pause after ~1 week idle; teacher presses **Restore** in the dashboard | 10 GB/month download allowance on the free plan |

Recommend **Supabase** for groups over 100. Recommend **Firebase** if they prefer Google or don't want a project that pauses.

## Path A: their own free project, used on the live website (no download)

### A1. Supabase
1. Go to https://supabase.com and sign up (GitHub or email).
2. Click **New project**. Name it e.g. `poller-crowd`, set any database password (not needed later), choose the nearest region. Wait 1–2 minutes.
3. Open **Project Settings → API Keys** (or the **Connect** button at the top). Copy:
   - **Project URL**, like `https://abcdefghijkl.supabase.co`
   - **Publishable key**, starting `sb_publishable_` (older projects: the **anon public** key; either works)
4. Go to step A3.

### A2. Firebase
1. Go to https://console.firebase.google.com and sign in with a Google account.
2. **Create a project** (or **Add project**), e.g. `poller-crowd`. Google Analytics and Gemini options can be turned off. Stay on the free **Spark** plan; no billing account needed.
3. In the left menu open **Databases & Storage → Realtime Database** (older consoles: **Build → Realtime Database**). Click **Create database**, choose the nearest location, and pick **Start in locked mode**.
4. Open the **Rules** tab, replace everything with the rules below, click **Publish**.
5. Open the **Data** tab and copy the database URL at the top. It looks like `https://poller-crowd-default-rtdb.firebaseio.com` (us-central1) or `https://poller-crowd-default-rtdb.REGION.firebasedatabase.app` (other locations).
6. Go to step A3.

Firebase security rules (copy exactly):

```json
{
  "rules": {
    "pc": {
      "$room": {
        ".read": true,
        ".write": "!newData.exists()",
        "s": {
          "$id": {
            ".write": true,
            ".validate": "newData.child('j').isString() && newData.child('j').val().length < 100000"
          }
        },
        "m": {
          "$id": {
            ".write": "!data.exists() || !newData.exists()",
            ".validate": "newData.child('j').isString() && newData.child('j').val().length < 8000"
          }
        }
      }
    }
  }
}
```

Why these are OK to be public: students join without accounts, so rooms must be readable and writable, but only under `pc/`, only as size-limited strings, and messages can't be overwritten. The teacher's room updates are cryptographically signed (ECDSA) and phones ignore anything unsigned. Each room is deleted when the session ends. Firebase may still email a "public rules" warning; that's expected.

### A3. Connect it in Poller Crowd
1. Open https://pollercrowd.collegetowns.org/host.html (or their own copy).
2. Click the **gear icon** (Settings) at the top right.
3. Under **Live connection**, choose **My own free project**, then **Supabase** or **Firebase**.
4. Paste the value(s), press **Test connection**. Wait for **Connected! You're all set.**
5. Press **Save**. The home screen now says "Using your own … project".
6. Suggest a 1-minute check: press **Present** on "Sample: Earth Science 101" and scan the QR code with a phone.

Tell the teacher:
- The setting is saved in this browser on this computer only. On another computer, repeat A3.
- Students must join with the **QR code or link** (it carries the project address). The bare room code points to the shared connection.
- Supabase only: before class, press **Test connection**. If it fails, the project paused: Supabase dashboard → the project → **Restore**.

### Troubleshooting Path A
| Message or symptom | Fix |
|---|---|
| "That doesn't look like a Realtime Database URL" | They copied the console page address. Copy the URL from the top of the Realtime Database **Data** tab instead. |
| "Connected, but your database rules don't allow Poller Crowd yet" | Rules weren't published or were mistyped. Repeat A2 step 4. |
| Supabase "The server turned us away" | Wrong key, or **Realtime → Settings → Allow public access** is off. |
| Supabase "No answer after 12 seconds" / "Timed out" | Project paused or still starting. Restore it, wait a minute, retry. |
| Firebase "No answer after 15 seconds" | Wrong URL, or 100 devices already connected (free plan cap). |
| Present button does nothing | The page must be on **https**. |

## Path B: host their own copy

Good for: a school web address, setting the connection once for everyone who uses the site, or changing the app.

1. Do **A1 or A2** first to get the public value(s).
2. Get the code: fork https://github.com/collegetowns/pollercrowd on GitHub (simplest for Pages), or download https://github.com/collegetowns/pollercrowd/archive/refs/heads/main.zip.
3. Edit **`js/config.js`**, the only file that needs changing:
   - Supabase: set `supabaseUrl` and `supabaseKey`, leave `firebaseUrl: ""`.
   - Firebase: set `supabaseUrl: ""`, `supabaseKey: ""`, and `firebaseUrl` to the database URL.
   - Set `goatcounterCode` to their own GoatCounter code or `""` (otherwise visits count toward College Towns).
   - Change `feedbackTo` to the teacher's own email, encoded as the comment in the file shows (otherwise bug reports go to College Towns).
   - Optionally change `homeUrl` / `appLockerUrl` (footer links). Please keep the "Powered by College Towns" credit and the MIT LICENSE file.
4. If a `CNAME` file exists, **delete it** in their copy. It points to pollercrowd.collegetowns.org and would break their Pages site. Add their own domain later if they want one.
5. Publish over **https** (required for phones):
   - **GitHub Pages (web):** repository **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root → Save**. The site appears at `https://USERNAME.github.io/REPO/` within a minute or two.
   - **GitHub Pages (CLI)**, if you can run commands and the user is signed in to `gh`:
     ```sh
     gh repo fork collegetowns/pollercrowd --clone --remote
     cd pollercrowd
     # edit js/config.js, remove CNAME, then:
     git rm -q --ignore-unmatch CNAME
     git commit -am "My Poller Crowd settings" && git push
     gh api -X POST repos/{owner}/{repo}/pages -f "source[branch]=main" -f "source[path]=/"
     ```
   - **Netlify / Cloudflare Pages:** drag-and-drop the folder or connect the repo. No build command; publish directory is the repo root.
   - **Any web server:** upload the folder as is.
6. Verify: open `…/host.html`, the home banner should **not** say "Demo mode". Present the sample set and join from a phone with the QR code.

Local preview (optional, demo mode only unless config.js is filled in): `python3 -m http.server 8000` in the folder, then open `http://localhost:8000/host.html`. Opening files by double-clicking won't work.

## Facts to keep straight (don't improvise)

- No accounts for students. Question sets and results are stored only in the teacher's browser. Nothing is stored on the server; rooms are temporary.
- Free, no ads, MIT licensed. Bundled libraries: supabase-js, Firebase JS SDK (Apache-2.0), PptxGenJS, qrcode-generator; fonts Fredoka and Nunito (OFL).
- Don't add tables, auth, server functions or paid plans; none are needed.
- Don't tell the teacher that a room code alone works on their own project. Students need the QR code or link.
- Feedback and bugs: the **Feedback or bug?** link in the app footer.
