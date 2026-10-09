# Permanent render assets — served by the site, never by Supabase Storage

The studio and the worker fetch these from `https://pressing90.live/media/…`.

They used to live in the Supabase `media` bucket and the nightly `cleanup`
job deleted all six of them (it removes everything older than 7 days and only
spared names starting with an upper-case `P90-`). Goal animations then failed
at render — `asset p90-music-quake.mp3 fetch failed 400` — and the Barça news
reel lost its fallback image, so articles without a usable photo rendered
blank. Diagnosed 2026-10-09.

Served from here they are in git, free, permanent, and out of reach of both
the cleanup job and the Supabase quota.

| file | used by |
|---|---|
| `barca-news-fallback.jpg` | worker `barca-digest`, when an article photo is not a decodable JPEG/PNG |
| `sfx-goal-roar.mp3` | studio `goal-anim`, crowd roar at the goal |
| `barca-confetti-paper.mp4` | studio `goal-anim`, Barça celebration overlay |
| `barca-bokeh-paper.mp4` | studio, calm background loop |
| `music-quake-aavirall.mp3` | studio `goal-anim` — « Quake » by aavirall, Uppbeat, licence `UHBKKEMPL5OBSULI`. **To be re-downloaded from Mehdi's Uppbeat account: it has no copy in this repo.** The credit block in `worker/src/goalanim.ts` (`MUSIC_CREDIT`) is mandatory in every caption that uses it. |

Anything added here must keep its name: both the studio and the worker
reference these files by URL.

## Vidéos de promotion

| fichier | usage |
|---|---|
| `promo-pronostics-ar.mp4` | promo arabe des pronostics (09/10/2026), 1080×1920, 48,8 s. Publiée en reel Facebook via Make et servie au kit TikTok. **L'URL doit rester vivante tant que le kit est utilisé** — Make et TikTok vont chercher le fichier ici. |
