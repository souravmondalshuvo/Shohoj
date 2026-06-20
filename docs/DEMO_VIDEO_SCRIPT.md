# Shohoj — Demo Video Script & Storyboard

Production guide for the 45–60 second product walkthrough requested in
[#9](https://github.com/souravmondalshuvo/Shohoj/issues/9). This document is the
**deliverable an engineer can hand to a recorder** (or follow themselves). The
final video/GIF is a manual recording step — this script does not, by itself,
satisfy #9; the issue stays open until the rendered asset exists and is hosted.

---

## 1. Goal

Show a recruiter or portfolio viewer, in under a minute, that Shohoj is a real,
polished, multi-feature product solving genuine BRAC University student problems
— without requiring them to sign in. Lead with the live-data tools (the most
visually impressive and the hardest to fake), close on mobile + the engineering
story.

**Tone:** calm, confident, fast but not frantic. Let the UI do the talking.

---

## 2. Deliverable specs

| Property | Value |
|----------|-------|
| Target duration | **55 s** (hard ceiling 60 s) |
| Primary master | 1920×1080, 16:9, 30 fps, H.264 MP4 |
| Social variant (optional) | 1080×1080 (1:1) or 1080×1920 (9:16) crop for LinkedIn/IG |
| README preview | ≤ 8 MB looping MP4 **or** ≤ 5 MB GIF (640px wide, no audio) of the 3 best scenes |
| Audio | Optional soft voiceover **or** music bed at −18 LUFS; the video must read with **sound off** (captions carry everything) |
| Captions | Burned-in lower-thirds **and** a sidecar `.srt`/`.vtt` |

> Keep the master out of git. Host on YouTube (unlisted is fine), a LinkedIn
> post, or Cloudflare Stream/R2, and link it. Only the small README preview
> (GIF/short MP4) may live in the repo, and only if it stays within budget —
> see §9.

---

## 3. Pre-recording checklist

- [ ] Open the **live site** and click **"Try Demo Mode"** so sample academic
      data is loaded — no real student PII on screen.
- [ ] Confirm no real name/email/photo is visible anywhere (Profile/header). Use
      the demo identity only; never show a real BRACU account.
- [ ] Browser at 1920×1080, 100% zoom, bookmarks bar hidden, clean profile (no
      personal tabs/extensions visible).
- [ ] Light **or** dark theme chosen deliberately and kept consistent (dark
      reads best on video; flip to light only for the one "theme" beat if used).
- [ ] Seat Status / Free Rooms / Routine show **live feed data** loaded (do a
      dry run so the feed is warm and not mid-spinner on camera).
- [ ] Have a sample transcript PDF ready on the desktop for the import beat.
- [ ] Admin beat: be signed into the admin dashboard in a **separate** recording
      pass (don't show the sign-in itself; cut straight to the moderation view).
- [ ] Disable OS notifications / Do Not Disturb on.
- [ ] Mouse movements slow and deliberate; pre-plan each click.

---

## 4. Shot-by-shot storyboard

Times are cumulative. Each scene is a short hold + one deliberate action. Cut on
motion; no scene lingers. Captions are short lower-thirds (≤ 5 words).

| # | Time | Scene | On-screen action | Caption (lower-third) |
|---|------|-------|------------------|-----------------------|
| 1 | 0:00–0:04 | **Landing page** | Hero loads; slow scroll past the tagline | "University life, made simple." |
| 2 | 0:04–0:08 | **Demo Mode** | Click "Try Demo Mode"; sample data fills in | "No login — try it instantly" |
| 3 | 0:08–0:13 | **CGPA Calculator** | Type a grade; CGPA + meter update live | "Live CGPA, instantly" |
| 4 | 0:13–0:18 | **Transcript import** | Drag a transcript PDF in; semesters auto-fill | "Import your transcript (PDF)" |
| 5 | 0:18–0:22 | **Semester Planner** | Add a course; a prereq blocker flags red | "Prerequisite-aware planning" |
| 6 | 0:22–0:25 | **Degree Progress** | Progress rings/credits in view | "Track your degree progress" |
| 7 | 0:25–0:31 | **Routine Builder** | Auto-suggest; a clash-free grid appears | "Auto-build a clash-free routine" |
| 8 | 0:31–0:37 | **Seat Status + alerts** | Search a full section; click "Watch"; toast/notification | "Get alerted when a seat opens" |
| 9 | 0:37–0:41 | **Free Rooms** | Open Free Rooms; room status board | "Find an empty room, now" |
| 10 | 0:41–0:45 | **Faculty Reviews** | Open a course; 5-dimension ratings | "Real, pseudonymous faculty reviews" |
| 11 | 0:45–0:48 | **Past Papers** | Papers tab; preview a paper | "Shared past papers & notes" |
| 12 | 0:48–0:51 | **Admin moderation** | Admin dashboard; approve/delete row | "Moderated for quality" |
| 13 | 0:51–0:55 | **Mobile view** | Phone frame: tabs + one tool scroll | "Built for mobile too" |
| — | 0:55–0:58 | **Outro card** | Logo + URL + stack line | "Shohoj · HTML·CSS·JS·Firebase·Cloudflare" |

**If you must trim to fit 45 s:** drop or shorten scenes 6, 11, 12 first (they
read fine as a 1.5 s flash). Never cut 7–9 (the live-data tools are the
differentiator) or 13 (mobile).

---

## 5. Voiceover / narration transcript (optional)

Keep it sparse — the captions already carry the message. If narrating, ~95 words
at a calm pace fits 55 s:

> "This is Shohoj — university life, made simple, for BRAC University students.
> No login needed: try demo mode. Your CGPA updates live as you type, or import
> your whole transcript from a PDF. Plan next semester with prerequisite checks,
> and track your progress to graduation. Auto-build a clash-free class routine,
> watch a full section and get alerted the moment a seat opens, and find an empty
> room on campus right now. Read real, pseudonymous faculty reviews, share past
> papers — all moderated for quality. And it works just as well on your phone."

---

## 6. On-screen captions (sidecar list)

Use these as the `.vtt`/`.srt` cues (one per scene, timed to §4). Full caption
file is also the accessibility transcript — see §10.

```
1  00:00.0 → 00:04.0  University life, made simple.
2  00:04.0 → 00:08.0  No login — try Demo Mode.
3  00:08.0 → 00:13.0  Live CGPA, instantly.
4  00:13.0 → 00:18.0  Import your transcript from a PDF.
5  00:18.0 → 00:22.0  Prerequisite-aware semester planning.
6  00:22.0 → 00:25.0  Track your degree progress.
7  00:25.0 → 00:31.0  Auto-build a clash-free routine.
8  00:31.0 → 00:37.0  Watch a full section — get alerted when it opens.
9  00:37.0 → 00:41.0  Find an empty room, right now.
10 00:41.0 → 00:45.0  Real, pseudonymous faculty reviews.
11 00:45.0 → 00:48.0  Shared past papers & notes.
12 00:48.0 → 00:51.0  Community data, moderated for quality.
13 00:51.0 → 00:55.0  Built for mobile, too.
14 00:55.0 → 00:58.0  Shohoj — HTML · CSS · JS · Firebase · Cloudflare.
```

---

## 7. Recording tooling

- **Screen capture:** macOS — QuickTime or Screen Studio (auto-zoom + smooth
  cursor reads great); Windows/Linux — OBS Studio.
- **Mobile (scene 13):** record a real device via screen mirroring, or use the
  browser devtools device toolbar (iPhone 14 preset) for a clean phone frame.
- **Edit/caption:** DaVinci Resolve (free), CapCut, or Descript (auto-captions →
  export `.srt`). Export the burned-in master **and** the sidecar caption file.

---

## 8. Editing notes

- Cut on cursor motion; use 150–200 ms cross-dissolves only between major
  sections, hard cuts elsewhere.
- Add a subtle zoom-in on the exact element being acted on (CGPA number, the
  "Watch" button, the prereq blocker) so small UI reads on a thumbnail-sized
  player.
- Hold the final outro card ~3 s so the URL is screenshot-able.
- Respect reduced motion: keep zooms gentle, avoid rapid flashing.

---

## 9. README integration & hosting

1. Host the master (YouTube unlisted / LinkedIn / Cloudflare Stream). Copy the
   link.
2. Add a **"Demo"** block near the top of `README.md`, directly under the badges
   — a clickable thumbnail linking out, plus the inline preview if within budget:

   ```markdown
   ## 🎬 Demo

   [![Watch the 55-second Shohoj walkthrough](assets/screenshots/demo-thumb.png)](<HOSTED_VIDEO_URL>)

   <!-- Inline preview (≤5 MB GIF / ≤8 MB MP4 of scenes 3, 7, 8): -->
   ![Shohoj walkthrough preview](assets/demo-preview.gif)
   ```

3. Add a row to the **Documentation** table linking this script.
4. **Do not** commit a link until the asset is actually live, and **do not**
   commit the full-size master to git (see §2). The README must never show a
   broken/placeholder video link.

> Thumbnail: a 1280×720 still of scene 7 (the routine grid) or scene 8 (the seat
> alert), with the logo + "55s demo ▶" overlay, saved as
> `assets/screenshots/demo-thumb.png`.

---

## 10. Accessibility

- **Captions are mandatory**, not optional — many viewers watch muted, and they
  are the screen-reader/transcript path. Ship the `.vtt`/`.srt` from §6; on
  YouTube upload it as a caption track (don't rely on auto-captions alone).
- Provide the §5 narration text as a **plain-text transcript** beneath the video
  in the README/hosting description.
- Maintain ≥ 4.5:1 contrast on burned-in captions (dark pill behind text).
- Honor reduced-motion: no strobing, gentle zooms (§8).
- Don't encode meaning in color alone (the prereq-blocker beat should read via
  the icon/label, not just red).

> Automated checks can't judge whether the captions are accurate or the pacing
> is followable — a human must review the final cut for both.

---

## 11. Privacy guardrails (do not violate)

- Never show a real student's name, email, photo, ID, or grades — demo data only.
- Shohoj has **no BRACU CONNECT credential field**; there is nothing to redact
  there, and you must not stage a fake one.
- Blur or avoid any real email in the seat-alert/admin beats.

---

## 12. Definition of done for #9

- [ ] 45–60 s master rendered to spec (§2)
- [ ] Covers scenes 1–13 (or the documented 45 s trim)
- [ ] Burned-in captions + sidecar `.vtt`/`.srt` + text transcript
- [ ] Hosted at a stable URL
- [ ] README "Demo" block added with the **working** link + thumbnail
- [ ] (Optional) in-repo preview within size budget
- [ ] No real PII anywhere in frame

Only when the hosted asset and working README link exist should #9 be closed.
