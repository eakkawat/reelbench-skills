# Reading a batch of shots: what to look at, what to fill

One task covers one batch of shots (25 or fewer by default — exactly one contact sheet). You receive:
the shot draft for this batch (shot number, start, end, duration, measured motion — **all measured,
do not recompute**), the a/b contact sheets for this batch, and the vocabularies in `taxonomy.md`.
You produce: `size` / `category` / `camera` / `frame` filled for every shot in the batch, plus
`subjects` / `onscreenText` / `audio` where they apply.

## Read the contact sheet first, the single frame second

1. **Read the a sheet first** (the opening frame of each shot, row-major, S01 top left): one screen
   takes in the **content** of the batch — who is there, where, what this stretch is about.
2. **Read the b sheet next** (the closing frame of each shot, same order): compare the same cell
   before and after. **Whether the framing changed** is visible at a glance — that is the camera-move
   evidence.
3. Go back to a single frame (`frames/S07a.jpg`) **only for the shots you cannot call**. Watching a
   whole film one image at a time wastes the budget. The contact sheet exists so you do not have to.

## Fill order: shot size → category → camera → frame

1. **Shot size** is the most objective. Fix it first; the shape of the batch is then in your head.
2. **Category**: what job this shot does in the film (establishing? dialogue? insert?). The criteria
   are in `taxonomy.md`.
3. **Camera move**: read the a/b framing difference plus the measured motion value. When the two
   disagree, **trust the measurement**:
   - framing looks unchanged, measured 0.3 → `static`
   - framing clearly changed, measured 15 → pick push / pull / pan / truck / tracking by the direction
   - framing unchanged but measured 20 → most likely the subject is moving; still `static` (the gate
     does not block, the report prints a hint)
   - **measured near zero while you want to write a push, pull, pan or track → the call is wrong, and
     the gate will stop it**
4. **Frame description** last. One sentence, write what is visible. Then ask: from this sentence alone,
   could I find this shot in the film? For English, aim at 8 words or more — the 12-character gate
   floor does not bite on English (see `taxonomy.md`).

## Hard rules

1. **Durations are not estimates.** The seconds in the draft come from cut-point subtraction. **Do not
   change one character.** If a boundary looks wrong, go through `recut`; do not hand-edit
   `start` / `end`.
2. **Measured motion is not an opinion.** It is pixel evidence. Look at the number before you write a
   camera move.
3. **A dialogue shot must carry its line. A card must carry its on-screen text. A reaction shot must
   say who is reacting. An empty shot may contain no people.** The gates check each of these (see the
   evidence column in `taxonomy.md`).
4. **Two shots must not have identical frame descriptions.** Write the difference even for a
   same-position reverse shot.
5. **When a call is unclear, write `note`. Do not guess a confident value.**

## Missed cuts and extra cuts: the detector is not infallible

Scene detection cuts on rate of picture change, so it fails in two places for certain. **When you find
one, fix it with `recut`. Do not live with it:**

| symptom | cause | fix |
| --- | --- | --- |
| The a frame and the b frame of one shot are two different scenes | a cut was missed in between | `recut --split <seconds>` at the change |
| One shot is absurdly long (a dozen seconds of shot/reverse-shot dialogue) | a same-position, same-brightness switch is not detected | extract a few middle frames to locate it, then `--split` each |
| Black into black, end cards one after another, all merged into one shot | the change rate between black-backed pictures is low by nature | rerun with a lower `--threshold`, or `--split` each |
| One stable shot was chopped into three or four fragments | handheld shake, a flash, or a subtitle jump pushed the change rate up | `recut --merge <seconds>` to remove the extra cuts |
| In a dissolve the cut point lands on the semi-transparent frames | a dissolve has no single defining frame | take the dissolve midpoint as the cut, write `transitionIn: dissolve` |

**An added cut is recorded in `manualCuts` and the gate accepts it.** Merging only removes boundaries,
so it passes for free. A hand-edited boundary does not pass the `boundary` gate.

If you find at the start that the whole film cut into a dozen shots with an average length of a dozen
seconds, **the threshold was too high**. Do not add cuts one by one — rerun `seed --threshold 0.15`.

## The director's eye (no gate here, but this decides whether the breakdown is worth anything)

- **The pace strip says it faster than the numbers do.** Alternating depths and lengths is good
  rhythm. One flat colour and one flat width across the whole film means either the film is flat, or
  you filled every shot as medium and static.
- **Average shot length is this film's breathing.** 2–4 seconds for a short drama, 1–2 for an ad, 8 or
  more for an art film are all normal. What matters is **whether it matches the kind of film**, and
  **whether the climax changes speed**.
- **In a dialogue scene, read the reverse-shot ratio.** All one side means the other side is a prop.
  A high share of reaction shots means the feeling lands.
- **Insert close-ups are accents.** Count where they fall. On a key action, that is good editing.
  Scattered everywhere, that is panic.
- **A high share of static cameras is not a fault.** Restrained camera work is often steadier. The
  reverse is the warning: a film that is 70% push, pull, pan and track is usually using camera movement
  to cover for content.

## Common diseases

| disease | symptom | cure |
| --- | --- | --- |
| copy-paste | neighbouring frame descriptions are nearly identical | the dedup gate stops it. Write the difference in action progress even for the same position |
| puffery | "very cinematic mood", "great atmosphere" | the Chinese list stops Chinese puffery; English puffery passes, so you must stop it yourself. Write what is visible |
| camera hallucination | a person runs, so it is called tracking, but the camera never moved | read the measured value; `static` is the default, not the fallback |
| shot-size inflation | everything is a close-up | judge by how much of frame height a person fills; an OTS is usually medium-close |
| category coupling | every close-up written as `insert` | a talking close-up is `dialogue`; category reads the job, not the distance |
| subtitle misfiled | a dialogue subtitle recorded in `onscreenText` | if a person is saying it, it is dialogue — it goes in `audio` |
| forcing a size onto black | "wide" written on an end card over black | black frames and cards are always `none` |
| hand-edited boundary | moving a cut by editing `start` / `end` | the `boundary` gate stops it. Boundaries change only through `recut` |
| one pass and done | filled in and delivered without `validate` | the gates are code; a run takes milliseconds. Not running it means not doing it |
