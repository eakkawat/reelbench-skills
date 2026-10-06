---
name: video-shots
description: |
  Shot breakdown: turns one finished video into a shot-by-shot analysis table — duration,
  shot size, category, camera move, frame description. The division of labour is built in: code measures
  everything measurable (cut points from ffmpeg scene detection, durations from cut subtraction, motion as
  the median per-frame difference), the model judges only the four things it should judge (size /
  category / camera / frame), and code audits every claim against the measurement — a shot that claims a
  push, pull, pan or tracking move while measured motion is near zero fails the gate on the spot. Viewing
  goes through contact sheets: the opening frame and the closing frame of every shot, tiled into two large
  images, and the a/b difference is the camera-move evidence. Missed or spurious cuts are fixed with
  recut --split / --merge, which renumbers and re-measures. Output: shots.json, a Markdown shot table, and
  a single-file interactive HTML report (synced player, pace strip, searchable and sortable table,
  distributions, cast, quality-gate results). 14 deterministic quality gates. No npm dependencies, no API
  keys — only node and ffmpeg.
whenToUse: |
  Use when the user asks for a shot breakdown, a shot list from a video, shot count, average shot
  length, cuts-per-minute statistics, shot size or camera-move analysis, or an editable, checkable
  analysis of how a film, ad, or short is cut. Needs node >= 18 and ffmpeg / ffprobe on PATH.
---

## video-shots

Break a finished film into shots — for every shot: **duration, shot size, category, camera move, frame**.

**The premise is built in: shot boundaries are measured, not eyeballed.** The least reliable thing a model
does when it watches video is report time — "about 3 seconds" and "2.97 seconds" differ by more than
precision; they decide whether the table is usable. So the line is drawn here:

| who decides | what | how |
| --- | --- | --- |
| **code** | cut points, durations, film length, frame rate | ffmpeg scene detection + ffprobe, two decimals |
| **code** | measured motion per shot | the median of the per-frame difference curve over the interval (both ends trimmed, away from the cut spike) |
| **the model** | shot size, category, camera move, frame | judged from key frames — **these four are the model's only job** |
| **code** | whether those judgements hold | 14 quality gates, each claim cross-checked |

The hardest gate is the **camera cross-check**: if the camera really moved, the pixels cannot have stayed
still. So "claims push/pull/pan/track while measured frame-to-frame change is near zero" is blocked
outright — the most common hallucination when a model breaks down a film. The reverse (claims static,
measured high) is **not blocked**, only hinted: a dancer in front of a locked camera also blows up the
frame difference.

### How to run this under DSH (read this first)

DSH does not substitute `{baseDir}`. **This skill's directory is the absolute path below**, and every
command uses it directly:

```
SKILL_DIR = ~/.dsh/skills/video-shots
the tool  = ~/.dsh/skills/video-shots/scripts/video-shots.mjs
```

Tool mapping (do not call the tool names the upstream skill uses):

| to do | DSH tool |
| --- | --- |
| run scripts, run ffmpeg | `bash` |
| look at key frames and contact sheets | `read_image` (**not** `read` — `read` handles UTF-8 text only) |
| read shots.json or references/*.md | `read` |
| write and change files | `write` / `edit` |
| find files | `glob` |

Four facts about this environment:

- **Every `bash` call is a new shell**; variables do not survive between calls. Either set a variable and
  chain with `&&` inside one call, or write absolute paths. `~` expands in bash, so it is usable.
- **Write only inside the current session's working directory** (file policy workspace-write). Put output
  in a relative directory such as `pull/`. Reading scripts and references under `~/.dsh/skills/...` is
  allowed.
- **`read_image` downscales large images.** A big contact sheet arrives resampled and detail is lost. So
  read the whole sheet to scope the batch, then **go back to single frames for the shots you cannot call**
  (`--width 480` as a floor; re-extract wider when you need detail).
- **The tool speaks English everywhere**: CLI usage, gate names, error text, and the report. Nothing
  needs translating. `--lang zh` is the only way to get Chinese output.

**Out of scope:** no speech transcription (no ASR — lines are read off burned-in subtitles, left empty
and explained when absent), no face recognition and no automatic cast merging (`cast` ids are assigned by
hand), no judgement of whether the film is good (the report gives facts and statistics), no editing or
clip export, no object detection inside a shot.

---

### Step 0 — Fix the input and the range

One video file is all it needs. Settle two things first; if you cannot, take the default and say so in
the report:

- **the whole film or one stretch**: the whole film is the default. When only one stretch matters, cut it
  out with ffmpeg first and break that down — do not mark half a film on a whole-film table.
- **what the breakdown is for**: a reference for imitation (weight picture and camera move), an editing
  rhythm analysis (weight duration and category), an inventory of ad material (weight product shots and
  cards). The purpose changes what `note` should carry — **the table structure stays the same**.

### Step 1 — Seed the working draft ⛔ the cut points are fixed here

```bash
mkdir -p pull && cd pull
node ~/.dsh/skills/video-shots/scripts/video-shots.mjs seed <video> \
  --track track.json --title "<title>" > shots.json
```

stderr reports: film length, frame rate, resolution, how many cut points were detected, how many shots
survive merging. **Read that line before going on:**

- average shot length of a dozen seconds, shot count clearly low → the threshold is too high, rerun with
  `--threshold 0.15` (dark scenes, slow films, and films heavy on same-position dialogue all need it lower)
- shot count well above what you can count by eye → the threshold is too low, move toward `0.4`, or merge
  in Step 4 with `recut --merge`
- a 3-minute film finishes in a few seconds. **Running it twice beats living with a bad draft.**

The draft fills `start` / `end` / `seconds` / `motion` and leaves `size` / `category` / `camera` / `frame`
empty — **those empty cells are the model's job.**

### Step 2 — Extract key frames and contact sheets

```bash
node ~/.dsh/skills/video-shots/scripts/video-shots.mjs frames shots.json --video <video>
node ~/.dsh/skills/video-shots/scripts/video-shots.mjs sheet shots.json --cols 4 --rows 6
node ~/.dsh/skills/video-shots/scripts/video-shots.mjs sheet shots.json --cols 4 --rows 6 --pick b
```

Two frames per shot: `frames/S01a.jpg` (15% in) and `S01b.jpg` (85% in). The `sheet` command tiles them
into large images (row-major, S01 top left). **The a sheet carries content, the b sheet carries camera
move** — the same cell before and after shows whether the framing changed.

**Read the contact sheet first, the single frame second.** Watching a whole film one image at a time
wastes the budget: one sheet is two dozen shots. Go back to single frames only for the shots you cannot
call — `read_image` on the absolute path of `pull/frames/S07a.jpg`.

### Step 3 — Fill the four fields, one batch at a time

One batch is 25 shots or fewer (exactly one contact sheet). Each batch gets:

- `~/.dsh/skills/video-shots/references/taxonomy.md` (the four vocabularies and the criteria —
  **fill from it**) and `~/.dsh/skills/video-shots/references/analysis-pass.md` (how to look, common
  diseases)
- the shot draft for this batch (number, start, end, duration, **measured motion**)
- the a / b sheets for this batch

Fill in this order: **shot size → category → camera move → frame**. Read the camera move off the a/b
framing difference plus the measured motion value; when the two disagree, **trust the measurement**.
Record `subjects` / `onscreenText` / `audio` as you go — **a dialogue subtitle burned into the picture
counts as dialogue**: it goes in `audio` with the speaker. Titles, cards, and UI text go in
`onscreenText`.

When you edit `shots.json`, **touch only those fields**. `start` / `end` / `seconds` / `motion` /
`seedCuts` / `meta` are machine fields — changing one fabricates evidence, and a gate names it.

Edit the JSON field by field with `edit`. Do not rewrite the whole file with `write`: a full rewrite is
the easiest way to mistype a machine field.

### Step 4 — Add cuts and merge cuts (fix what you find, do not live with it)

Scene detection fails in two places for certain: dissolves and dark-into-dark **miss cuts**; handheld
shake and flashes **add cuts**. An a frame and a b frame that are two different scenes is proof of a
missed cut.

```bash
node ~/.dsh/skills/video-shots/scripts/video-shots.mjs recut shots.json --track track.json \
  --split 63.5 --split 127.37 --merge 45.97 > shots.new.json && mv shots.new.json shots.json
```

It renumbers, recomputes durations and measured motion, and records the added cuts in `manualCuts` (the
`boundary` gate accepts them). **Shots whose boundaries did not move keep their annotations unchanged;
shots that were split or merged have their annotations cleared and their origin written in `note`** —
whether the two halves are the same thing needs a fresh look at the picture. Do not carry an old
description over.

Then re-extract the frames for those shots (`frames` rewrites the whole directory, so rerun it) and fill
the cleared cells.

### Step 5 — Validate ⛔ never skip

```bash
node ~/.dsh/skills/video-shots/scripts/video-shots.mjs validate shots.json --track track.json --frames frames
```

All 14 gates are code: timeline continuity (in order, butting together, 0 to the end), duration
self-consistency (`seconds` = `end − start`, a short shot must carry a note), shot-number discipline,
**the shot-size / category / camera vocabularies**, the transition enum, **frame description checkability**
(a minimum length + a puffery list + no "this shot…" opener), **frame descriptions not repeated**,
subjects cross-checked against `cast`, **category needs evidence** (dialogue needs a line, a card needs
on-screen text, a reaction must say who, an empty shot may hold no people), **the camera cross-check**,
**boundaries come from detection** (a cut you added must be declared in `manualCuts`), key frames present.

**Fix each violation, rerun, and keep going until it passes.** A skipped gate says why (no `--track`, no
`cast`, the key-frame directory does not exist) — **skipped is not passed**, and the report must say so.

The "hints (not blocking)" list is not a set of errors. Those are the places that need a human: a high
measured motion against a static claim is usually a moving subject, but it may also be a slow push you
missed — go look at that shot.

### Step 6 — Render and report

```bash
node ~/.dsh/skills/video-shots/scripts/video-shots.mjs render shots.json --md --track track.json > shots.md
node ~/.dsh/skills/video-shots/scripts/video-shots.mjs render shots.json --html --track track.json \
  --video <path to the source, relative to the report> > shots-report.html
```

`--video` points the player at the source (it defaults to `source` in the JSON; the viewer can also pick
a local file in the page). **The report language defaults to English**; `--lang zh` switches it to
Chinese. `render` looks for key frames in `frames/`, so **extract frames
before you render**; a missing image is reported, never replaced with a placeholder.

The report is a **single-file interactive page** (its style and behaviour come from `scripts/report.css`
and `report.js`, inlined whole at render time; these three files must be copied together):

- **player**: playback highlights the current shot and fills the timeline; clicking any shot or timeline
  segment jumps there
- **pace strip**: one segment per shot, width = share of duration, colour depth = shot-size distance
- **shot table**: list and card views, opening and closing key frames side by side (read together, that
  is the camera move), searchable (shot number, frame, dialogue, person), filterable by category,
  sortable by duration; click a key frame for the lightbox
- **distributions / cast / quality checks**: collapsed by default; click a person card to filter their shots
- the header states the verdict in one line (`14 passed · 1 hint`), and a shot id named in a hint is a
  button that jumps there

Report in one line: **how many shots, average shot length, cuts per minute, the dominant sizes and camera
moves, where the longest and shortest shots are, and the report path.** State which cuts you added and
merged, which gates were skipped, and which hints need a human.

Final output (all inside the session working directory):

```
pull/
├── shots.json              ← the breakdown itself
├── track.json              ← motion curve (machine evidence, do not hand-edit)
├── shots.md
├── shots-report.html       ← double-click to open
├── frames/                 ← S01a.jpg / S01b.jpg …
└── sheets/                 ← sheet-a01.jpg / sheet-b01.jpg … (contact sheets)
```

---

## Boundaries

- **No speech transcription.** Lines come only from burned-in subtitles. A film without subtitles has a
  largely empty `audio`, which is normal; in that case judging `dialogue` as `subject` is the honest call
  — the category-evidence gate forces you to make it
- **Measured motion does not separate camera movement from subject movement.** So the camera gate blocks
  one direction only ("claims motion, measured none"); the reverse is a hint. Tune
  `params.staticMaxMotion` / `busyMinMotion` to change the tightness
- **Scene detection does not recognise a dissolve.** The cut point in a dissolve is its midpoint, and
  `transitionIn` is `dissolve`
- **The shot count you can handle depends on patience, not on the script.** A 90-minute film is possible,
  but that is dozens of contact sheets; for a feature, cut it into chapters and break each down separately
- The report UI is bilingual (`--lang`, **English by default**). **The vocabulary labels follow the UI
  language; the frame descriptions do not** — those are content, not labels
- Watching the report needs the source: point `--video` at it, or pick the file in the page. The report
  itself embeds no video data

## Self-test

```bash
node ~/.dsh/skills/video-shots/scripts/selftest.mjs
```

160 assertions. No model, no cost, no ffmpeg. **Every one of the 14 gates has a case that breaks it** —
proof that it really blocks. Run this first after any change to the scripts.

## Bundled sample

`~/.dsh/skills/video-shots/examples/demo-shots.json` + `demo-track.json`: a complete breakdown of a
202.9-second AI short — 53 shots, average shot length 3.83 seconds, 15.7 cuts per minute; dialogue 58%,
static cameras 55%; the shortest shot 0.33 seconds (a flash cut in the snow run), the longest 16.06
seconds (the long take under the shaft of light at the end). Beyond `seedCuts` it adds 10 cuts (half
dissolves, half end cards), all recorded in `manualCuts`. All 14 gates pass, and one motion hint is kept
as an example. It is the quality baseline and the selftest fixture. **Its content is Chinese** — the
film is Chinese and the file sets `"lang": "zh"`. It exists to test the tool, not to show what your
English output should look like.
