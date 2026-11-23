/* =========================================================
   POLLER CROWD SETTINGS
   This is the only file you need to edit. See README.md.
   ========================================================= */
window.POLLER_CROWD_CONFIG = {

  /* Your Supabase project (Project Settings > API Keys in the Supabase dashboard).
     Paste the Project URL and the publishable key (starts with sb_publishable_)
     or the legacy "anon public" key. Both are safe to put in a public website.
     Leave both empty to run in demo mode only (teacher and students in the
     same browser, for trying things out). Teachers can always connect their
     own Supabase project under Settings on the teacher screen. */
  supabaseUrl: "https://ljguezxzfojzekyfcbdh.supabase.co",
  supabaseKey: "sb_publishable_Kf6e1VZuBhlMUrys0WdveA_DMEK8SM5",

  /* Or use Firebase instead (free plan: 100 devices at once). Paste your
     Realtime Database URL, e.g. https://my-project-default-rtdb.firebaseio.com,
     and leave the two Supabase lines above empty. See setup.html for the
     database rules to paste into Firebase. */
  firebaseUrl: "",

  /* GoatCounter visitor counts. Put just your site code, e.g. "collegetowns"
     for https://collegetowns.goatcounter.com. Leave empty to turn counting off.
     Room codes are never sent; only the page name (like /join.html) is counted. */
  goatcounterCode: "collegetowns",

  /* Where the Feedback / bug box sends email. Lightly encoded so it is not
     scraped by spam bots: it is the address written backwards, then base64.
     To change it, run this in your browser console and paste the result:
       btoa("you@example.com".split("").reverse().join(""))            */
  feedbackTo: "bW9jLmxpYW1nQGR3b3JjcmVsbG9wKzU1NW5lbGxhbW5heXI=",

  /* Links in the footer */
  homeUrl: "https://www.collegetowns.org",
  appLockerUrl: "https://claude.ai/artifact/NhTddo5GfhgAziLNw1sgbS",

  /* How long finished sessions stay on the teacher's computer before they are
     deleted automatically (days). Nothing is ever stored on the server. */
  keepSessionsDays: 30
};
