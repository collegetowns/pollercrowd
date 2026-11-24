# Poller Crowd

**Warm up the lecture.** Free live polls, word clouds, quizzes, rankings and Q&A for classes and lectures. Students scan a QR code and answer from their phones: no app, no accounts, anonymous answers. A free app from [College Towns](https://www.collegetowns.org).

- **Seven activities, plus info slides:** multiple choice, word cloud, rating scale, open Q&A with upvotes, timed quiz race with a leaderboard, ranking, and thermometer (students place something between two poles). Info slides show a title, notes or a break countdown with nothing to answer.
- **Buddies:** students pick one of 10 polar buddies with 4 color patterns and 5 looks (200 combinations). Repeats are avoided automatically.
- **Polar Night and Polar Day** themes on every screen.
- **Rude-word filter:** common swear words and slurs become `#!*&`. Teachers can also hold answers for approval, hide anything, and remove a student.
- **Exports:** PowerPoint (a slide per question), a printable summary (save as PDF), and a spreadsheet (CSV).
- **Private by design:** nothing is stored on a server. Question sets and results stay in the teacher's browser. Phones remind students not to type names or personal details.
- **For learning, not grading:** answers are anonymous and nothing confirms who answered, so results aren't meant for grades or official records. `privacy.html` explains why and has a one-screen summary for school and district reviews.
- **Bring your own free connection:** Supabase (200 at once) or Firebase (100 at once), pasted into Settings on the live site or set once in `js/config.js` for your own copy.

> **Setting this up with an AI assistant?** Point it at [`AGENTS.md`](AGENTS.md). It has step-by-step instructions written for assistants like Claude, ChatGPT or Copilot, for both connecting a free project and hosting your own copy. Teachers can copy a ready-made message from [`setup.html`](https://pollercrowd.collegetowns.org/setup.html#ai).

---

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | Landing page: students type a room code, teachers open the teacher screen |
| `host.html` | The teacher screen (build question sets, present, results, exports) |
| `join.html` | The student phone screen (the QR code points here) |
| `setup.html` | Guide for teachers: connect their own free Supabase or Firebase, host a copy, or let an AI assistant walk them through it |
| `AGENTS.md` | Setup instructions written for AI assistants |
| `privacy.html` | Plain-language privacy page: where data goes, why it's not for grading, and a summary for school/district reviewers |
| `js/config.js` | **The only file you edit:** your Supabase keys (or Firebase URL), GoatCounter code, feedback email |
| `js/`, `css/`, `fonts/`, `vendor/` | The app itself, its fonts and bundled libraries (Supabase, Firebase, PptxGenJS, QR code) |

There's no build step. It's plain HTML, CSS and JavaScript, so you can host it anywhere that serves files.

---

## Step 1. Try it on your own computer (2 minutes, optional)

With no Supabase keys, Poller Crowd runs in **demo mode**: the teacher screen and "students" are tabs in the same browser.

1. Open a terminal in this folder and run `python3 -m http.server 8000` (Mac and Linux have Python built in).
2. Visit `http://localhost:8000/host.html`, press **Present** on the sample question set.
3. Press **Copy join link** and open it in a few more tabs. Each tab is a student.

> Tip: opening the files by double-clicking won't work, because browsers block live connections between pages opened as files. Use the little server above.

## Step 2. Create the free Supabase project (5 minutes)

Supabase passes the answers from phones to the projector in real time. Poller Crowd uses only its **Realtime** feature, so there are no tables or code to set up.

1. Sign up at [supabase.com](https://supabase.com) and click **New project**. Name it `poller-crowd`, set any database password, and pick a region near you.
2. When it's ready, open **Project Settings → API Keys** (or the **Connect** button).
3. Copy the **Project URL** (like `https://abcdefgh.supabase.co`) and the **Publishable key** (starts with `sb_publishable_`; older projects call it the **anon public** key).
4. Leave **Realtime → Settings → Allow public access** turned on. It's on by default.

These two values are public by design. They are meant to sit in a web page. **Never** use the `secret` or `service_role` key.

**Prefer Firebase?** Its free Spark plan allows 100 devices at once and never pauses. Create a project at [console.firebase.google.com](https://console.firebase.google.com), open **Databases & Storage → Realtime Database → Create database** (locked mode), paste the rules from [`setup.html`](setup.html#firebase) or [`AGENTS.md`](AGENTS.md) into the **Rules** tab and publish, then copy the database URL from the **Data** tab. In Step 3, put it in `firebaseUrl` and leave the two Supabase lines empty.

## Step 3. Edit `js/config.js`

```js
supabaseUrl: "https://abcdefgh.supabase.co",
supabaseKey: "sb_publishable_xxxxxxxxxxxxxxxxxxxx",
goatcounterCode: "yourcode",   // the part before .goatcounter.com, same as on the App Locker
```

- **GoatCounter:** use the same code as your App Locker (if your dashboard is `https://collegetowns.goatcounter.com`, the code is `collegetowns`). Only the page name is counted (`/join.html`), never room codes. Counting is skipped on `localhost`.
- **Feedback email:** `feedbackTo` is already set to `ryanmallen555+pollercrowd@gmail.com`, encoded the same way as the App Locker's suggestion box (written backwards, then base64). The `+pollercrowd` tag lets you filter it in Gmail. The comment in the file shows how to change it.
- **App Locker link:** `appLockerUrl` points to the App Locker. Swap in its public web address when it has one.

## Step 4. Put it on GitHub Pages (10 minutes)

1. Create a new repository on GitHub, e.g. `pollercrowd`. Public is fine; there's nothing secret in it.
2. Upload everything in this folder (drag the files into **Add file → Upload files**, keeping the folders), and commit.
3. In the repository, go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute your site is live at `https://<your-username>.github.io/pollercrowd/`.

**Using your own address** (like your other apps, `pollercrowd.collegetowns.org`):

1. In **Settings → Pages → Custom domain**, type `pollercrowd.collegetowns.org` and save.
2. At your domain's DNS provider, add a **CNAME** record: name `pollercrowd`, value `<your-username>.github.io`.
3. Once GitHub shows the domain is verified, tick **Enforce HTTPS**. HTTPS is required: phones only allow the security features Poller Crowd uses on secure pages.

## Step 5. Test it with real phones

1. Open `host.html` on your laptop, press **Present**.
2. Scan the QR code with your phone (and a friend's). Pick buddies and answer a couple of questions.
3. Check **People** on the teacher screen, try **Moderation**, end the session and download the PowerPoint.

Before each class, glance at the green **Live** chip at the top of the teacher screen. If it says *Reconnecting…*, your free Supabase project may be asleep (see below).

---

## Limits and how Poller Crowd stays inside them

| Supabase free plan | Limit | What it means here |
|---|---|---|
| Concurrent connections | 200 | Up to ~199 students at once across **all** classes using your project |
| Messages per second | 100 | Answers go only to the teacher's screen, and screen updates to phones are batched, so a class of 100 stays well under |
| Project pausing | after about a week unused | Open the Supabase dashboard and press **Restore** before class |
| Active free projects | 2 per account | |

With Firebase instead: 100 devices at once (a hard cap on the free plan, including the teacher's screen), no pausing, and 10 GB of downloads a month. A room's live update is usually a few KB, so normal class use stays far below that.

**Lots of teachers using your site at once?** Each teacher can connect their **own** free Supabase project in **Settings** (the gear icon on the teacher screen). Their rooms then run on their project with their own allowance (200 on Supabase, 100 on Firebase), and the QR code tells phones where to connect. The step-by-step guide for them is `setup.html`, linked from the landing page and from Settings. Rooms on a teacher's own project need the QR code or link; the room code alone points to your shared project.

## How it works (for the curious)

- The teacher screen makes a fresh **signing key** for each room, and the room code (e.g. `IGLOO-482`) is derived from that key. Every update the phones receive is signed. A prankster who sends fake "the quiz is over" messages gets ignored, because phones check the signature.
- Phones send answers to the teacher's screen as separate messages (Supabase HTTP broadcast, or a short-lived entry the teacher's screen reads and deletes on Firebase). Phones only listen for the teacher's signed updates, so message counts stay low.
- Each phone has a random private ID. The teacher's screen only ever sees a one-way hash of it, which is how "one answer per phone", the buddy patterns and **Remove** work, without names.
- Question sets and results are saved in the teacher's browser (`localStorage`). Finished sessions are deleted after 30 days (`keepSessionsDays` in `config.js`). **Download** a question set to back it up, or to share it with a colleague, who can **Import** it.

## Sharing question sets with other teachers

On the teacher home screen, **Download** saves a question set as a small `.pollercrowd` file (it also opens if renamed to `.json`). Email it to a colleague; they press **Import a set**.

## Updating the bundled libraries

`vendor/` holds `@supabase/supabase-js` 2.119.0, `pptxgenjs` 4.0.1 and `qrcode-generator` 2.0.4 (all MIT), plus the Firebase JS SDK 13.4.0 compat builds (`firebase-app.js`, `firebase-database.js`, Apache-2.0), which load only when a room uses Firebase. The fonts are Fredoka and Nunito (SIL Open Font License). Licenses are in `vendor/THIRD-PARTY-LICENSES.txt`. Everything is served from your own site, so school networks that block outside CDNs still work, and visitors' browsers don't contact Google Fonts.

## License

Poller Crowd is released under the MIT License (see `LICENSE`). It's provided as-is, without warranty.
