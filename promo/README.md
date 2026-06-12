# Pressing 90' — promo video

60-second motion-graphics promo, hand-crafted frame-by-frame. No AI,
no Lottie packs — every shape, transition, and easing curve is
explicit in `scene.html` and rendered deterministically by
`render.mjs` via headless Chromium + ffmpeg.

## Output

`pressing90-promo-final.mp4` · 1920×1080 · 30 fps · H.264 + AAC · ~4 MB

Includes stadium-crowd ambiance loop + English voice-over (Roger /
ElevenLabs) with sidechain ducking so the voice always sits on top.
Ready to upload to Facebook, Instagram (will be downscaled to
1080×1080 or 1080×1920 by their encoder — fine), Twitter/X, LinkedIn.

If you want the silent cut for adding your own music in iMovie /
Final Cut, use `pressing90-promo.mp4` (no audio track).

## Voice-over script

> The World Cup, twenty twenty-six, is here.
> One hundred and four matches. Thirty-nine days. One single hub.
> Every match — live. Refreshed every five seconds.
> Push alerts straight to your phone. Kickoff. Goals. Cards. Full time.
> Predict the entire tournament. Groups to the final. Share your bracket.
> Sixteen host venues. The photos, the climate, the matchups.
> Install it as an app. Two taps. That's it.
> Pressing ninety dot live. Just football.

## Structure

| # | Scene          | Frames     | Time    |
|---|----------------|------------|---------|
| 1 | Intro splash   | 0–149      | 0–5s    |
| 2 | Tagline        | 150–359    | 5–12s   |
| 3 | Live scores    | 360–659    | 12–22s  |
| 4 | Push alerts    | 660–959    | 22–32s  |
| 5 | Bracket        | 960–1259   | 32–42s  |
| 6 | Stadiums       | 1260–1499  | 42–50s  |
| 7 | Install as app | 1500–1679  | 50–56s  |
| 8 | CTA            | 1680–1799  | 56–60s  |

Between every scene: 8-frame (~0.27s) crossfade.

## Re-rendering after edits

```
cd promo
npm install   # first time only
node render.mjs
```

The render takes ~25s for screenshots + ~25s for ffmpeg encoding on
a 2021 M1/M2/Intel Mac. Output overwrites `pressing90-promo.mp4`.

## Inspecting a single frame

To debug visuals quickly, open `scene.html?frame=500&total=1800` in
any browser. The JS reads the frame number and renders the exact
state for that tick — same input, same pixel.

`sample.mjs` captures 8 hand-picked frames (one per scene mid-point)
into `sample-frames/` — faster than a full render when you just want
to check a layout tweak.

## Assets

- `assets/wc26-emblem.svg` — site emblem (copy of `public/wc26-emblem.svg`)
- `assets/referee-{red,yellow}-card.png` — push-notif icons (real ones)
- `assets/referee-offside-flag.png` — same
- `assets/estadio-azteca.jpg` — Wikipedia commons (Vista aérea del
  Estadio Azteca, 2026, public domain), resized to 1920px wide

## Why no Lottie?

The reference style (cradly's promo) uses CSS-driven motion: shapes
flying in, cards stacking, simple bezier easing. We get the same
quality with pure CSS transforms + JS-driven opacity, with zero
runtime dependency on lottie-web and no risk of a 200KB+ JSON file
not loading mid-render.

If a future scene needs something genuinely Lottie-shaped (e.g. a
3D ball spin), drop the JSON into `lottie/` and add an `<img
data-lottie="...">` slot in `scene.html` — lottie-web supports
`goToAndStop(frame, true)` for deterministic frame control.

## Add music in 30 seconds

Open `pressing90-promo.mp4` in iMovie or Final Cut, drag in an
upbeat 60s track (search "energetic 60 sec promo" on epidemic
sound or YouTube audio library), trim, export. The Facebook auto-
play default is muted anyway, so on-screen text is what carries
the message — music is the cherry on top for in-feed clicks.
