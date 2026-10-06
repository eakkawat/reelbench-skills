# The shape of shots.json

One level: **film → shots**. No sequences, no scenes. A shot breakdown takes apart a finished film,
and a finished film contains only shots.

```json
{
  "source": "demo-video.mp4",
  "title": "What Is AI",
  "lang": "en",
  "meta": { "durationSeconds": 202.9, "fps": 30, "width": 1680, "height": 720, "aspect": "7:3", "codec": "h264", "hasAudio": true },
  "params": { "sceneThreshold": 0.15, "minShotSeconds": 0.3 },
  "seedCuts": [0.9, 1.23, 2.97, "…every detected cut point"],
  "manualCuts": [63.5, 127.37],
  "cast": [ { "id": "P1", "name": "the old woman", "note": "protagonist" } ],
  "shots": [ { "…": "see below" } ]
}
```

## Machine fields: the model must not change them

`seed` and `recut` write these four groups. **Changing one is fabricating evidence:**

| field | source |
| --- | --- |
| `meta` | ffprobe |
| `seedCuts` | the raw cut points from ffmpeg scene detection (including fragments that were merged away, kept for reference) |
| `shot.start` / `shot.end` / `shot.seconds` | cut-point subtraction, two decimals |
| `shot.motion` | the median of per-frame differences over that interval (both ends trimmed, to avoid the spike at a cut) |

One route changes a boundary: **`recut --split` / `--merge`**. It renumbers, recomputes durations,
recomputes measured motion, and records the added cut in `manualCuts`. A hand edit always misses one
place, and a gate names it on the spot.

## shot

| field | type | notes |
| --- | --- | --- |
| `id` | string | Shot number `S01`: zero-padded to two digits, starting at 1, **consecutive in order**. It is also the key-frame file name (`S01a.jpg` / `S01b.jpg`) |
| `start` / `end` | number | Start and end in seconds, two decimals. **Neighbouring shots butt together**, the first starts at 0, the last ends at the film length |
| `seconds` | number | `end − start`. Stored redundantly so a gate can cross-check it |
| `motion` | number\|null | Median measured frame-to-frame change. A short shot may be null (not enough samples) |
| `size` | enum | Shot size — see `taxonomy.md`. Black frames and cards use `none` |
| `category` | enum | Shot category — what job this shot does |
| `camera` | enum | Camera move. **Cross-checked against `motion`**: a large move claimed with no measured motion stops the gate |
| `transitionIn` | enum | How this shot **comes in**; optional (means `cut`) |
| `subjects` | string[] | `cast` ids of the people in frame; an empty shot gets an empty array |
| `frame` | string | **Frame description.** Minimum `minFrameChars` non-whitespace characters; write what is visible. The puffery list and the filler openers are checked |
| `onscreenText` | string | On-screen text that is not dialogue: title, cards, UI text. May be empty. **Language: see Content language below** |
| `audio` | string | Dialogue, narration, key sound effects. **A burned-in dialogue subtitle counts as dialogue and goes here. Language: see Content language below** |
| `note` | string | Remark, optional. A shot shorter than `minShotSeconds` **must** have one (say whether it is a flash cut or a detection fragment) |

## Content language

Write `audio` and `onscreenText` in the language spoken or printed in the film. A Thai film gets Thai
dialogue; a Chinese film gets Chinese dialogue. The reader matches these strings to the burned-in
subtitle on screen, so the source text is the record.

- **Thai and English need no gloss.** Write them as they stand.
- Any other language: keep the source text, then add an English translation in parentheses, in one string:
  `老李给我拿着好猛的药 (Old Li keeps me on very strong medicine)`
- `frame`, `note`, `cast` names, the vocabulary labels and the report UI follow the report language
  (`--lang`, English by default). `--lang` never rewrites content.

## params

All optional; an omitted value takes its default. Only the first two are usually tuned per film.

| field | default | effect |
| --- | --- | --- |
| `sceneThreshold` | 0.3 | Scene-detection threshold. **Lower it for dark or slow films** (around 0.15); a fast-cut ad may go higher |
| `minShotSeconds` | 0.3 | A fragment shorter than this is merged into the previous shot during `seed` |
| `boundaryTolerance` | 0.05 | Tolerance for neighbouring shots butting together |
| `endTolerance` | 0.25 | Tolerance between the last shot's end and the film length |
| `cutTolerance` | 0.1 | Tolerance that aligns a shot boundary to `seedCuts` / `manualCuts` |
| `staticMaxMotion` | 1.5 | Below this the frame barely moved (the blocking line of the camera gate) |
| `busyMinMotion` | 12 | Above this the frame moves hard (a hint only, no block) |
| `motionGateMinSeconds` | 1 | Shots shorter than this are not checked by the camera gate (too few samples — one spike would overturn it) |
| `minFrameChars` | 12 | Minimum non-whitespace characters in a frame description. Tuned for Chinese; raise it for English |
| `trackHz` | 5 | Sampling rate of the motion curve |
| `frameDir` | `frames` | Key-frame directory |

## The motion curve track.json (a separate file)

```json
{ "hz": 5, "values": [7.4, 8.9, 14.4, "…one point every 0.2 seconds"] }
```

**It does not go into shots.json.** It holds thousands of numbers; inside a working draft it only gets
in the way and is easy to corrupt. `validate` and `render` attach it with `--track`. Without it they
**say plainly that the camera cross-check was skipped**, and the other gates run as normal.

What the curve means: the mean per-pixel difference between neighbouring sample frames after scaling
to 64×36. A larger value means a bigger picture change. **It does not separate camera movement from
subject movement**, so the gate blocks in one direction only (see the measured tiers in `taxonomy.md`).

## Key frames

Two per shot, both extracted by the `frames` command:

- `frames/S01a.jpg` — the shot's **opening** (15% in, past the transition frames)
- `frames/S01b.jpg` — the shot's **closing** (85% in)

**Read a and b together and you have the camera move**: the framing changed, that is a push, pull, pan
or track; the framing held and only a person moved, that is a locked camera. `sheet` tiles the a set
and the b set into contact sheets — two dozen shots on one screen, an order of magnitude faster than
one image at a time.
