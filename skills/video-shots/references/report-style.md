# Design rules for shots-report.html

Read this before you change any styling. Do not improvise by feel.

## Three layers: shell + assets + data

The report is not one large string. Three things are assembled:

| layer | where | changing it changes |
| --- | --- | --- |
| **shell** | `renderHtml()` in `scripts/video-shots.mjs` | the page skeleton: header, statistics bar, table of contents, player, four sections, footer |
| **style** | `scripts/report.css` | **the design of the report itself.** Edit this file to change how the report looks; no JS, no generator |
| **interaction** | `scripts/report.js` | list rendering, search / filter / sort, the timeline, playback sync, the lightbox, export |
| **data** | the inlined `DOC` and `CFG` | `DOC` is shots.json verbatim; `CFG` carries the vocabularies, the colour ramp, the filter chips, which frame each portrait uses, which key frames exist, and the UI strings |

At render time both assets are **inlined whole** into the HTML. The product stays **a single file, no
external dependency, openable offline by double-click**. `report.js` is generic: a different film or a
different language changes not one character of it — **every number on the page is computed from `DOC`**,
nothing is written at generation time.

**The three files must be copied together.** If `report.css` or `report.js` is missing from `scripts/`,
`render --html` fails with an error.

## The CFG contract

`renderHtml` computes it, `report.js` consumes it. Neither side may assume details about the other:

| field | content |
| --- | --- |
| `frameDir` / `frames` | the key-frame directory, and **which frames each shot actually has** (`'ab'` / `'a'` / `''`) — a missing image gets a placeholder, never an `<img>` that will 404 |
| `labels` | the **complete** English and Chinese label sets for shot size / category / camera move / transition, following `--lang` |
| `colors` | the shot-size colour ramp, taken from the `color` field of `SHOT_SIZES`; the timeline and the legend share it |
| `filters` | the filter chips: the four categories by shot count, plus All, plus Other |
| `portraits` | which frame supplies each person's portrait: **fewest people in frame → closest shot size → earliest appearance**; no frame, no portrait |
| `words` | the UI strings. **Every key `report.js` references is cross-checked by the selftest**; one missing key fails on the spot |

## Tone

- paper white `#f7f8f4` + deep green `#285444` + light green `#dceba7`; body text 13px, every number
  uses `tabular-nums`
- `.content` controls the margins and the maximum width; at phone width (~400px) no horizontal scroll
- every character the model produced passes through `esc()` — once at generation, again inside
  `report.js`; a `<` inside the embedded JSON becomes `<` so `</script` cannot truncate it

## Section order

header (title · parameters · gate verdict · export) → table of contents → statistics bar →
**shot detail** (player + pace strip + shot table) → distributions → cast → quality checks → footer.

The last three are `<details>`, collapsed by default. **The shot table is where a shot breakdown
lives**; open the rest on demand.

## The player: the report plays as a film

A `<video>` carries the source (point at it with `--video`, otherwise `source` is used; the viewer can
also pick a local file in the page). During playback three things follow: the current shot's
information, the highlighted shot row, and the progress fill on the timeline.

- the shot lookup uses **binary search** (`shotAtTime`), not a linear scan — 53 shots and 5300 shots
  cost the same
- frames are followed with `requestVideoFrameCallback`, falling back to `requestAnimationFrame`
- **during playback only classes and progress values change; rows are never rebuilt** — a rebuild
  jitters the scroll position and steals focus
- if the video cannot load, or its duration does not match the report, the page **says so**. It does
  not pretend nothing is wrong

## The pace strip

One segment per shot: **segment width = share of duration, colour depth = shot-size distance** (the
ramp is in `CFG.colors`). Click a segment to jump to that shot; during playback the current segment
fills with playback progress. Tick marks step in **round intervals**, five of them, then the film
length — nobody can read a scale like `01:21`.

## The shot table: list view and card view

List view is the default: one row per shot, **the opening and closing key frames side by side**
(read them together and you have the camera move) + time / duration + size / category / camera +
frame description + text and sound. Card view suits a fast look through the pictures.

- the search box matches shot number, frame description, dialogue, person name; the chips filter by
  category; sorting can order by duration
- clicking a row jumps to that shot (the player follows); clicking a key frame opens the lightbox
  (← → switch the opening and closing frame, ESC closes)
- every shot `id` is an anchor, so `#S07` deep-links straight to that shot

## Quality gates and hints

- a gate has three states: pass / fail / **skipped**. Skipped is not a pass, and **the reason is
  printed on the card**
- hints (not blocking) form their own block: things that **need a human to judge**, such as a high
  measured motion against a static claim, live there and are not mixed into the gates. A shot id named
  in a hint is a button; clicking it jumps to that shot
- the header carries one line of verdict: `14 passed · 1 hint`

## UI language

`--lang zh|en` **switches UI labels only** (precedence: the `--lang` flag > the top-level `lang` field
in the JSON > **English by default**).

- what switches: the statistics bar, section titles, buttons, player status, and the vocabulary labels
  for shot size / category / camera move / transition
- **what does not switch: content.** Frame descriptions, dialogue, on-screen text, person names, notes —
  that is prose the model wrote, and it stays as it is
- every string goes through `CFG.words`; `report.js` contains no hardcoded Chinese. **Every key it
  references must exist in both the Chinese and the English table**, and the selftest checks each one
  (a missing key prints `undefined` on the page, so this gate is hard)

## What the selftest guards is the contract, not the pixels

`selftest.mjs` does not compare what the HTML looks like — that kind of assertion breaks on every style
change. It checks: whether the assets were inlined, whether the shell left an unreplaced template
placeholder, whether `<` in `DOC` was escaped, whether every gate is listed, whether the `CFG`
vocabularies are complete, whether the portrait choice is right, whether missing frames are declared
honestly, and **whether every UI string key `report.js` references exists in both the Chinese and the
English table**.
