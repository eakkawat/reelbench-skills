# Vocabularies: shot size / category / camera move / transition

Four tables. Every one is an **enum**, and `validate` checks each value against it. A word that is
not in a table fails on the spot. A shot table has value because it can be aggregated. A table where
every analyst invents their own wording aggregates to nothing.

When a call is unclear, pick the **most conservative** value using the criteria below, then write the
uncertainty into `note`. **Guessing a confident value is worse than writing a hedged one**: the first
one becomes a fact downstream; the second one at least keeps the doubt visible.

The enum keys below are what goes into `shots.json`. Under `--lang en` the report prints each value
with the English label defined in `scripts/video-shots.mjs` (mostly the key with spaces: `close` →
close-up, `none` → n/a, `pov` → POV). The 中文 column is the label the report prints by default.

---

## 1. Shot size (`size`)

Judge by **how much of the frame a person fills**, not by focal length. When no person is in frame,
convert from an object at the same distance.

| value | 中文 | criteria |
| --- | --- | --- |
| `none` | 无景别 | Black frame, title card only, graphics only — no photographed space in the frame. **Use it for every card and every black frame.** Do not force a shot size onto it |
| `extreme-wide` | 大远景 | A person is under 1/4 of frame height, or cannot be found at all: mountains, cityscapes, wide aerials |
| `wide` | 全景 | A person fills 1/3 of frame height up to the full body with the environment, feet inside frame |
| `medium-wide` | 中远景 | Knees up to full body, the environment still takes most of the frame |
| `medium` | 中景 | Waist up, the environment is still readable |
| `medium-close` | 中近景 | Chest up, the background starts to fall out of focus — **the default size of a dialogue scene** |
| `close` | 特写 | Shoulders up, the face takes most of the frame; an object close-up sits at the same level |
| `extreme-close` | 大特写 | Part of a face, a finger, the detail of an object — one thing left in the frame |

**Two common misjudgments:**

- **Judging an over-the-shoulder shot (OTS) as `wide`.** The shoulder in the foreground is only an
  occlusion. Judge by how much of the frame **the person being filmed** fills — usually `medium-close`.
- **Treating shallow depth of field as a close-up.** Background blur has nothing to do with shot size.
  Look at how much of the frame the person fills.

## 2. Category (`category`): what job this shot does in the film

Shot size answers "how close". Category answers "why does this shot exist". **One shot gets one
category.** When it does two jobs at once, pick the one **the editor would mourn first if it were cut**.

| value | 中文 | the job it does | evidence it must produce (checked by a gate) |
| --- | --- | --- | --- |
| `establishing` | 定场 | States where this is, who is there, what time. Usually the first shot after a location change | — |
| `subject` | 主体 | Ordinary narrative coverage that follows a person or a thing | — |
| `dialogue` | 对话 | Someone is speaking; either side of a shot/reverse-shot | `audio` non-empty |
| `reaction` | 反应 | No speech — only listening, watching, freezing. **The cheapest drama in a short drama** | `subjects` non-empty |
| `insert` | 插入特写 | One action or detail lifted out as an accent: a hand pressing a lid down, a knife landing on bone | — |
| `pov` | 主观 | The frame is what a specific person's eyes see | — |
| `empty` | 空镜 | No person in frame — environment, weather, objects only | `subjects` must be empty |
| `product` | 产品展示 | A product or an interface presented as the protagonist (the workhorse of ads and selling videos) | — |
| `text-card` | 字卡 | The frame is text: a title, a caption card, end credits | `onscreenText` non-empty |
| `transition` | 转场镜头 | The shot itself is a transition: black, white flash, scenery placed there to join two scenes | — |
| `archive` | 引用素材 | Screen recordings, news footage, someone else's clip, older flashback material | — |

**Category and shot size are not the same axis. Do not couple them.** A close-up is not automatically
`insert` (a talking close-up is `dialogue`), and a wide shot is not automatically `establishing`
(a wide fight is `subject`).

## 3. Camera move (`camera`)

**Ask one question first: did the whole frame move?** If the frame did not move and only a person
moved inside it, that is `static`. This is the most frequently miswritten field.

| value | 中文 | measured tier | criteria |
| --- | --- | --- | --- |
| `static` | 固定 | still | The camera does not move. A person running across the frame is still `static` |
| `push-in` | 推 | strong | The whole camera moves toward the subject; background perspective changes with it |
| `pull-out` | 拉 | strong | The whole camera moves back |
| `zoom-in` / `zoom-out` | 变焦推 / 变焦拉 | strong | Focal length changes, **perspective does not** — the difference from a push/pull is whether the background "comes forward" |
| `pan-left` / `pan-right` | 左摇 / 右摇 | strong | The camera position holds; the camera rotates horizontally |
| `tilt-up` / `tilt-down` | 上摇 / 下摇 | strong | The camera position holds; the camera rotates vertically |
| `truck-left` / `truck-right` | 左移 / 右移 | strong | The camera translates horizontally |
| `pedestal-up` / `pedestal-down` | 升 / 降 | strong | The camera translates vertically |
| `tracking` | 跟拍 | strong | Follows a moving subject; the subject keeps roughly the same position in frame |
| `arc` | 环绕 | strong | Circles around the subject |
| `whip-pan` | 甩镜 | strong | A pan fast enough to pull motion blur; often doubles as a transition |
| `handheld` | 手持微晃 | subtle | Composition holds, the frame breathes in small continuous motion — **the main source of a documentary feel** |
| `shake` | 剧烈晃动 | strong | Large-amplitude shaking: an explosion, a run, a camera that pretends to be shoved |
| `rack-focus` | 变焦点 | subtle | Camera and composition hold; focus moves between foreground and background |
| `micro-push` | 微推 | subtle | An extremely slow push, a small travel over several seconds — common in emotional shots |
| `roll` | 旋转 | strong | The frame rotates around the lens axis |
| `drone` | 航拍移动 | strong | Overall displacement of an aerial camera position |

**The measured tier (`motion`) is the trace this camera move must leave in the pixels.** The camera
gate checks exactly that:

- `strong`: the whole frame must move. **If measured frame-to-frame change is near zero, the call is
  wrong** — the gate stops it here.
- `still`: the camera position holds. When the measurement is high the gate **does not stop it**, it
  only emits a hint — a dancer in front of a locked camera also blows up the frame difference.
- `subtle`: the change is too small or too local for the measurement to separate. **No gate.** The
  number is shown to the human.

What if the camera move changes inside one shot: **write the dominant one**, and put the other in
`note` ("tracking in the first half, locked off in the second"). If both halves are long enough and
important enough, that is a sign the shot needs a cut (`recut --split`).

## 4. Transition (`transitionIn`): how this shot **comes in**

Optional. Omitting it means `cut`.

| value | 中文 | criteria |
| --- | --- | --- |
| `cut` | 硬切 | The picture changes inside one frame. Most shots are this |
| `dissolve` | 叠化 | Two pictures overlap for a few frames to tens of frames. **The detector misses cuts here most often**; the cut point is the midpoint of the dissolve |
| `fade-in` | 淡入 | The picture fades up from black (or white) |
| `fade-out` | 淡出 | The picture fades down to black (or white). When a black frame is a shot of its own, its entry point is `fade-out` |
| `whip` | 甩切 | Joined by the blur of one whip pan |
| `match-cut` | 匹配剪辑 | The cut happens only after the shape or the action of the two shots lines up |
| `wipe` | 划像 | An edge pushes across the frame |
| `morph` | 特效转场 | Morph, particles, template motion |

---

## Frame description (`frame`): it must be checkable

One sentence. Write **what is visible**: who is where in the frame, what they are doing, where the
light comes from, what sits in the foreground and the background. Then ask yourself:
**from this sentence alone, could I find this shot in the film?**

The gate counts non-whitespace characters and requires `params.minFrameChars` (default 12). That floor
is tuned for Chinese, where 12 characters is a real phrase. **In English 12 characters is about two
words, so the gate does not bite.** Treat the English floor as 8 words or more, and raise
`params.minFrameChars` (for example 60) if you want the machine to enforce it.

The puffery blacklist and the filler-opener check are **Chinese-only** (`VAGUE_WORDS` and
`FILLER_OPENERS` in `scripts/video-shots.mjs`: 氛围感, 高级感, 视觉冲击, 令人, 唯美, 美不胜收,
大气磅礴, 震撼人心, 画面感十足, 很美, 非常美, 精美绝伦, 赏心悦目, 引人入胜). English puffery —
"cinematic", "moody", "stunning", "beautiful shot" — passes the gate. Nothing will stop it, so the
rule is yours to hold.

Do not open with "this shot …" either. Every row of a shot table is a shot.

| bad | good |
| --- | --- |
| Very cinematic mood, feels like a film | Backlit doorway of an earth-walled house; an old woman grips the doorframe leaning out, the door plank and the stove blurred in the foreground |
| An old woman is talking | An old woman leans on the counter, one hand flat on the top, her mouth still open mid-sentence, snow light from the window behind |
| Close-up of a hand | An old book and a magnifier beside a candle; a thin hand pushes paper forward an inch at a time |

**Two shots must not have identical frame descriptions** (checked by a gate). If the same camera
position really repeats, still write the difference: the camera is closer, how far the action has
progressed, whether the light changed.

## Where subtitles, dialogue, and on-screen text go

One rule, no wrangling:

- **`audio`**: **what is spoken** — dialogue, voice-over, narration, plus key sound effects and music
  ("a door is shoved open", "a suona starts"). A dialogue subtitle burned into the picture **counts as
  dialogue**: put it here, with the speaker. Quote it as it appears on screen; add an English
  translation in parentheses when it is not English.
- **`onscreenText`**: **on-screen text that is not someone speaking** — the title, cards, time marks
  ("ten minutes earlier"), road signs, text inside a phone UI, end credits.

When you cannot tell, ask: **is a person saying this line?** Yes → `audio`. No → `onscreenText`.

## Subjects (`subjects`)

Write the ids from the top-level `cast` (`P1`, `P2`, …), not names — names change, ids do not. List
whoever is in frame. **A person speaking off screen does not count** (their words go in `audio`,
marked "(off screen)"). An empty shot gets an empty array.

Do not build `cast` on the first pass. Write people as "the old woman" or "the old doctor" inside the
frame description. After the whole film is through, once you know who is who and who appears only
once, go back and assign ids. **`cast` is optional.** Without it the subject gate is skipped, but you
lose the "who carries the most screen time" statistics.
