#!/usr/bin/env node
// video-shots 自测：不调模型、不花额度、不碰 ffmpeg。
// 14 道质量门每一道都有**击穿用例**——证明它真的会拦，不是摆设。

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEFAULT_PARAMS, SHOT_SIZES, SHOT_CATEGORIES, CAMERA_MOVES, TRANSITIONS, VAGUE_WORDS,
  buildSeed, recut, validate, stats, medianMotion, fmtTime, shotNo, renderMd, renderHtml, paramsOf,
} from './video-shots.mjs';

let passed = 0;
const failures = [];

function ok(cond, label) {
  if (cond) passed += 1;
  else failures.push(label);
}
const eq = (got, want, label) => ok(Object.is(got, want), `${label} (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`);

/** 某道门是否红了。 */
function gateOf(doc, id, ctx = {}) {
  return validate(doc, ctx).gates.find((g) => g.id === id);
}
const fails = (doc, id, label, ctx = {}) => {
  const g = gateOf(doc, id, ctx);
  ok(g && !g.ok && !g.skipped, `${label} — the ${id} gate should block it`);
};
const holds = (doc, id, label, ctx = {}) => {
  const g = gateOf(doc, id, ctx);
  ok(g && g.ok, `${label} — the ${id} gate should not block (${g?.issues?.join('; ')})`);
};

/* ------------------------------------------------------------------ */
/* 夹具                                                                */
/* ------------------------------------------------------------------ */

const baseDoc = () => ({
  source: 't.mp4',
  title: '测试片',
  lang: 'zh',
  meta: { durationSeconds: 10, fps: 25, width: 1920, height: 1080, aspect: '16:9', hasAudio: true },
  params: {},
  seedCuts: [4, 7],
  manualCuts: [],
  cast: [{ id: 'P1', name: '老太太' }],
  shots: [
    {
      id: 'S01', start: 0, end: 4, seconds: 4, size: 'wide', category: 'establishing', camera: 'static',
      transitionIn: 'cut', subjects: [], frame: '雪地上一排木架挂着冻肉，远处山坡发灰', onscreenText: '', audio: '', motion: 0.5,
    },
    {
      id: 'S02', start: 4, end: 7, seconds: 3, size: 'close', category: 'dialogue', camera: 'handheld',
      transitionIn: 'cut', subjects: ['P1'], frame: '老太太侧脸贴着柜台，嘴张开还在往下说', onscreenText: '', audio: '老太太：给我拿药', motion: 2,
    },
    {
      id: 'S03', start: 7, end: 10, seconds: 3, size: 'medium', category: 'empty', camera: 'push-in',
      transitionIn: 'cut', subjects: [], frame: '空院子里晾着一条毛巾，被风吹得贴在绳上', onscreenText: '', audio: '', motion: 5,
    },
  ],
});

/** 10 秒 / 5Hz：S01 区间 0.5，S02 区间 2，S03 区间 5。 */
const baseTrack = () => {
  const values = new Array(50).fill(0.5);
  for (let i = 22; i <= 33; i += 1) values[i] = 2;
  for (let i = 37; i <= 48; i += 1) values[i] = 5;
  return { hz: 5, values };
};
const CTX = () => ({ track: baseTrack() });

/* ------------------------------------------------------------------ */
/* 0. 基线：干净的稿子一道门都不响                                       */
/* ------------------------------------------------------------------ */
{
  const v = validate(baseDoc(), CTX());
  ok(v.ok, `Baseline doc should pass every gate (failed: ${v.failed.map((g) => g.id).join(', ')})`);
  eq(v.gates.length, 14, 'There are 14 gates in total');
  eq(v.hints.length, 0, 'Baseline produces no hints');
  eq(new Set(v.gates.map((g) => g.id)).size, 14, 'Gate ids are unique');
}

/* ------------------------------------------------------------------ */
/* 1. 时间轴连续                                                        */
/* ------------------------------------------------------------------ */
{
  const gap = baseDoc();
  gap.shots[1].start = 4.5;
  gap.shots[1].seconds = 2.5;
  fails(gap, 'timeline', 'Gap of half a second between two shots');

  const overlap = baseDoc();
  overlap.shots[1].start = 3.5;
  overlap.shots[1].seconds = 3.5;
  fails(overlap, 'timeline', 'Two shots overlap');

  const late = baseDoc();
  late.shots[0].start = 0.5;
  late.shots[0].seconds = 3.5;
  fails(late, 'timeline', 'First shot does not start at 0');

  const short = baseDoc();
  short.shots[2].end = 9;
  short.shots[2].seconds = 2;
  fails(short, 'timeline', 'Last shot does not reach the end of the video');

  const tiny = baseDoc();
  tiny.shots[2].end = 9.9;
  tiny.shots[2].seconds = 2.9;
  holds(tiny, 'timeline', 'Last shot short by 0.1 s stays inside the tolerance');

  const empty = baseDoc();
  empty.shots = [];
  fails(empty, 'timeline', 'No shots at all');
}

/* ------------------------------------------------------------------ */
/* 2. 时长自洽                                                          */
/* ------------------------------------------------------------------ */
{
  const wrong = baseDoc();
  wrong.shots[1].seconds = 5;
  fails(wrong, 'duration', 'seconds does not match end minus start');

  const flash = baseDoc();
  flash.shots[1].end = 4.2;
  flash.shots[1].seconds = 0.2;
  flash.shots[2].start = 4.2;
  flash.shots[2].seconds = 5.8;
  fails(flash, 'duration', 'A 0.2 s flash cut has no note');

  const flashNoted = JSON.parse(JSON.stringify(flash));
  flashNoted.shots[1].note = '闪切，一帧插入';
  holds(flashNoted, 'duration', 'A flash cut with a note passes');
}

/* ------------------------------------------------------------------ */
/* 3. 镜号纪律                                                          */
/* ------------------------------------------------------------------ */
{
  const jump = baseDoc();
  jump.shots[1].id = 'S05';
  fails(jump, 'numbering', 'Shot numbering skips a number');

  const low = baseDoc();
  low.shots[0].id = 'S1';
  fails(low, 'numbering', 'Shot id is not zero-padded');

  eq(shotNo(0), 'S01', 'shotNo starts at S01');
  eq(shotNo(11), 'S12', 'shotNo zero-pads to two digits');
}

/* ------------------------------------------------------------------ */
/* 4–6. 三张词表                                                        */
/* ------------------------------------------------------------------ */
{
  for (const [field, id, bad] of [['size', 'size', 'closeup'], ['category', 'category', 'b-roll'], ['camera', 'camera', 'zoom']]) {
    const doc = baseDoc();
    doc.shots[0][field] = bad;
    fails(doc, id, `${field}=${bad} is not in the vocabulary`);
    const blank = baseDoc();
    blank.shots[0][field] = '';
    fails(blank, id, `${field} is empty`);
  }
  ok(SHOT_SIZES.none && SHOT_SIZES['extreme-close'], 'Size table includes none and extreme-close');
  ok(SHOT_CATEGORIES['text-card'].evidence === 'onscreenText', 'Text-card evidence field is onscreenText');
  eq(CAMERA_MOVES.static.motion, 'still', 'static belongs to the still band');
  eq(CAMERA_MOVES['push-in'].motion, 'strong', 'push-in belongs to the strong band');
  eq(CAMERA_MOVES.handheld.motion, 'subtle', 'handheld belongs to the subtle band');
}

/* ------------------------------------------------------------------ */
/* 7. 转场枚举                                                          */
/* ------------------------------------------------------------------ */
{
  const bad = baseDoc();
  bad.shots[1].transitionIn = 'flash';
  fails(bad, 'transition', 'Transition word not in the table');

  const omitted = baseDoc();
  delete omitted.shots[1].transitionIn;
  holds(omitted, 'transition', 'The transition field may be omitted');
  ok(TRANSITIONS.dissolve && TRANSITIONS['match-cut'], 'Transition table includes dissolve and match-cut');
}

/* ------------------------------------------------------------------ */
/* 8. 画面描述可核对                                                    */
/* ------------------------------------------------------------------ */
{
  const blank = baseDoc();
  blank.shots[0].frame = '';
  fails(blank, 'frame-text', 'Frame description is empty');

  const tooShort = baseDoc();
  tooShort.shots[0].frame = '老太太说话';
  fails(tooShort, 'frame-text', 'Frame description is too short');

  for (const word of ['氛围感', '视觉冲击', '令人']) {
    const vague = baseDoc();
    vague.shots[0].frame = `雪地上的木架很有${word}，挂着几条冻肉在那里`;
    fails(vague, 'frame-text', `Frame description contains the vague word ${word}`);
  }

  const filler = baseDoc();
  filler.shots[0].frame = '这个镜头拍的是雪地里的木架，上面挂着冻肉';
  fails(filler, 'frame-text', 'Frame description starts with a filler opener');

  ok(VAGUE_WORDS.length >= 10, 'Vague-word list has at least 10 words');
}

/* ------------------------------------------------------------------ */
/* 9. 画面描述不重复                                                    */
/* ------------------------------------------------------------------ */
{
  const copy = baseDoc();
  copy.shots[1].frame = copy.shots[0].frame;
  fails(copy, 'dedup', 'Second shot copies the first shot frame description');

  const nearly = baseDoc();
  nearly.shots[1].frame = `${nearly.shots[0].frame}，机位比上一镜更近`;
  holds(nearly, 'dedup', 'A description that states the difference passes');
}

/* ------------------------------------------------------------------ */
/* 10. 主体对账                                                         */
/* ------------------------------------------------------------------ */
{
  const ghost = baseDoc();
  ghost.shots[1].subjects = ['P9'];
  fails(ghost, 'subjects', 'P9 is not in cast');

  const noCast = baseDoc();
  noCast.cast = [];
  const g = gateOf(noCast, 'subjects');
  ok(g.skipped && g.ok, 'Missing cast is reported as skipped and treated as pass');
}

/* ------------------------------------------------------------------ */
/* 11. 类别要有证据                                                     */
/* ------------------------------------------------------------------ */
{
  const noLine = baseDoc();
  noLine.shots[1].audio = '';
  fails(noLine, 'category-evidence', 'Dialogue shot records no line');

  const card = baseDoc();
  card.shots[0].category = 'text-card';
  card.shots[0].size = 'none';
  fails(card, 'category-evidence', 'Text card records no onscreen text');

  const cardOk = JSON.parse(JSON.stringify(card));
  cardOk.shots[0].onscreenText = '十分钟前';
  holds(cardOk, 'category-evidence', 'A text card with onscreen text passes');

  const reaction = baseDoc();
  reaction.shots[0].category = 'reaction';
  fails(reaction, 'category-evidence', 'Reaction shot does not say who reacts');

  const crowdedEmpty = baseDoc();
  crowdedEmpty.shots[2].subjects = ['P1'];
  fails(crowdedEmpty, 'category-evidence', 'Empty shot lists a person');
}

/* ------------------------------------------------------------------ */
/* 12. 运镜实测对账                                                     */
/* ------------------------------------------------------------------ */
{
  const still = baseDoc();
  const ctx = CTX();
  // S01 区间实测 0.5，把它说成「推」——摄影机动了像素不可能不动
  still.shots[0].camera = 'push-in';
  fails(still, 'motion', 'Claims a push-in but measured motion is near zero', ctx);

  const tracking = baseDoc();
  tracking.shots[0].camera = 'tracking';
  fails(tracking, 'motion', 'Claims a tracking shot but measured motion is near zero', ctx);

  holds(baseDoc(), 'motion', 'S03 measured motion 5 supports a push-in', ctx);

  const noTrack = baseDoc();
  noTrack.shots[0].camera = 'push-in';
  const skipped = gateOf(noTrack, 'motion');
  ok(skipped.skipped && skipped.ok, 'Missing --track is reported as skipped');

  // 短镜采样点太少，不设门
  const shortShot = baseDoc();
  shortShot.shots[0].end = 0.8;
  shortShot.shots[0].seconds = 0.8;
  shortShot.shots[0].camera = 'push-in';
  shortShot.shots[0].note = '闪切';
  shortShot.shots[1].start = 0.8;
  shortShot.shots[1].seconds = 6.2;
  shortShot.seedCuts = [0.8, 7];
  holds(shortShot, 'motion', 'A 0.8 s shot is not checked for a camera move', ctx);

  // 反方向：说固定、实测很动 —— 只提示不拦（主体在动也会这样）
  const busy = baseDoc();
  busy.shots[2].camera = 'static';
  const v = validate(busy, ctx);
  const mg = v.gates.find((g) => g.id === 'motion');
  ok(mg.ok, 'Static with high measured motion is not blocked');
  const busyTrack = baseTrack();
  for (let i = 37; i <= 48; i += 1) busyTrack.values[i] = 30;
  const v2 = validate(busy, { track: busyTrack });
  ok(v2.gates.find((g) => g.id === 'motion').ok, 'A moving subject does not block a static claim');
  ok(v2.hints.some((h) => h.includes('S03')), 'But a hint is emitted');
}

/* ------------------------------------------------------------------ */
/* 13. 边界来自检测                                                     */
/* ------------------------------------------------------------------ */
{
  const moved = baseDoc();
  moved.shots[0].end = 5;
  moved.shots[0].seconds = 5;
  moved.shots[1].start = 5;
  moved.shots[1].seconds = 2;
  fails(moved, 'boundary', 'Cut moved off any detected cut point');

  const declared = JSON.parse(JSON.stringify(moved));
  declared.manualCuts = [5];
  holds(declared, 'boundary', 'A cut declared in manualCuts is accepted');

  const merged = baseDoc();
  merged.shots = [
    { ...merged.shots[0], end: 7, seconds: 7, frame: '雪地木架上挂着冻肉，镜头一直没动过' },
    { ...merged.shots[2], id: 'S02' },
  ];
  holds(merged, 'boundary', 'Merging only removes boundaries, so it passes');

  const noSeed = baseDoc();
  delete noSeed.seedCuts;
  const g = gateOf(noSeed, 'boundary');
  ok(g.skipped && g.ok, 'Missing seedCuts is reported as skipped');
}

/* ------------------------------------------------------------------ */
/* 14. 关键帧齐全                                                       */
/* ------------------------------------------------------------------ */
{
  const dir = mkdtempSync(join(tmpdir(), 'vshots-'));
  const frames = join(dir, 'frames');
  mkdirSync(frames);
  writeFileSync(join(frames, 'S01a.jpg'), 'x');
  writeFileSync(join(frames, 'S02a.jpg'), 'x');
  fails(baseDoc(), 'frames', 'Keyframe for S03 is missing', { frameDir: frames });
  writeFileSync(join(frames, 'S03a.jpg'), 'x');
  holds(baseDoc(), 'frames', 'All three keyframes present passes', { frameDir: frames });
  const g = gateOf(baseDoc(), 'frames', { frameDir: join(dir, '不存在') });
  ok(g.skipped && g.ok, 'A missing frame directory is reported as skipped');
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ */
/* buildSeed：切点 → 工作底稿                                           */
/* ------------------------------------------------------------------ */
{
  const meta = { durationSeconds: 10, fps: 25, width: 640, height: 360, aspect: '16:9', hasAudio: false };
  const doc = buildSeed(meta, [3, 3.1, 6], null, { source: 'a.mp4' });
  eq(doc.shots.length, 3, 'The 0.1 s fragment at 3.1 s is merged away');
  eq(doc.shots[0].id, 'S01', 'Seed numbers shots from S01');
  eq(doc.shots[0].end, 3, 'First cut lands at 3 s');
  eq(doc.shots[2].end, 10, 'Last shot ends at the end of the video');
  eq(doc.seedCuts.length, 3, 'seedCuts keeps every original cut point, including merged ones');
  eq(doc.shots[1].frame, '', 'Seed leaves frame descriptions empty');
  eq(doc.shots[0].size, '', 'Seed leaves shot sizes empty');
  ok(validate(doc).failed.some((g) => g.id === 'size'), 'A fresh seed fails the size gate — nothing is filled in yet');

  const clamped = buildSeed(meta, [0.05, 9.98], null, {});
  eq(clamped.shots.length, 1, 'A fragment flush with the head or tail does not become a shot');

  const withTrack = buildSeed(meta, [5], baseTrack(), {});
  ok(withTrack.shots[0].motion != null, 'A supplied track writes measured motion');

  eq(paramsOf({ params: { minShotSeconds: 1 } }).minShotSeconds, 1, 'params override the defaults');
  eq(paramsOf({}).trackHz, DEFAULT_PARAMS.trackHz, 'Missing params fall back to the defaults');
}

/* ------------------------------------------------------------------ */
/* recut：补刀与并刀                                                    */
/* ------------------------------------------------------------------ */
{
  const split = recut(baseDoc(), { splits: [2], track: baseTrack() });
  eq(split.shots.length, 4, 'One split adds one shot');
  eq(split.shots.map((s) => s.id).join(','), 'S01,S02,S03,S04', 'Ids are renumbered after a split');
  eq(split.shots[0].end, 2, 'The new boundary lands at 2 s');
  eq(split.shots[1].seconds, 2, 'The split-off second half is 2 s');
  eq(split.shots[0].frame, '', 'Annotations of the split shot are cleared');
  ok(split.shots[0].note.includes('S01'), 'The note states where the shot came from');
  eq(split.shots[2].frame, baseDoc().shots[1].frame, 'Untouched shots keep their annotations');
  eq(split.manualCuts.join(','), '2', 'The split is recorded in manualCuts');
  ok(validate(split, CTX()).gates.find((g) => g.id === 'boundary').ok, 'The boundary gate still passes after a split');
  ok(split.shots[0].motion != null, 'New shots get measured motion recomputed');

  const merged = recut(baseDoc(), { merges: [4], track: baseTrack() });
  eq(merged.shots.length, 2, 'One merge removes one shot');
  eq(merged.shots[0].seconds, 7, 'The merged shot is 7 s');
  eq(merged.shots[0].frame, '', 'Annotations of the merged shot are cleared');
  eq(merged.shots[1].frame, baseDoc().shots[2].frame, 'Later untouched shots are unaffected');

  const both = recut(baseDoc(), { splits: [8.5], merges: [4] });
  eq(both.shots.length, 3, 'One run merges and splits at once');

  const dropped = recut({ ...baseDoc(), manualCuts: [4] }, { merges: [4] });
  eq(dropped.manualCuts.length, 0, 'A merged cut is removed from manualCuts');

  let threw = 0;
  try { recut(baseDoc(), { splits: [4.02] }); } catch { threw += 1; }
  try { recut(baseDoc(), { splits: [12] }); } catch { threw += 1; }
  try { recut(baseDoc(), { merges: [5.5] }); } catch { threw += 1; }
  eq(threw, 3, 'Duplicate split, out-of-range split, and merge with no cut all throw');
}

/* ------------------------------------------------------------------ */
/* 统计与格式化                                                         */
/* ------------------------------------------------------------------ */
{
  const st = stats(baseDoc());
  eq(st.count, 3, '3 shots');
  eq(st.totalSeconds, 10, 'Total duration is 10 s');
  eq(st.avgSeconds, 3.33, 'Average shot length rounds to two decimals');
  eq(st.medianSeconds, 3, 'Median shot length is 3 s');
  eq(st.minSeconds, 3, 'Shortest shot is 3 s');
  eq(st.maxSeconds, 4, 'Longest shot is 4 s');
  eq(st.cutsPerMinute, 18, '18 cuts per minute');
  eq(st.sizes[0].key, 'wide', 'Sizes sort by screen time; wide comes first');
  eq(st.sizes[0].seconds, 4, 'wide holds 4 s');
  eq(st.categories.length, 3, 'Three categories');

  eq(fmtTime(0), '00:00.00', 'Zero point');
  eq(fmtTime(9.5), '00:09.50', 'Under one minute');
  eq(fmtTime(75.25), '01:15.25', 'Past one minute');
  eq(fmtTime(-1), '00:00.00', 'Negative input clamps to zero');

  const track = baseTrack();
  eq(medianMotion(track, 0, 4), 0.5, 'Median over the range');
  eq(medianMotion(track, 7, 10), 5, 'A second range');
  eq(medianMotion(null, 0, 4), null, 'A null track returns null');
  eq(medianMotion(track, 5, 5), null, 'A zero-length range returns null');
  const spike = baseTrack();
  spike.values[20] = 200; // 切点那一帧
  spike.values[21] = 200;
  eq(medianMotion(spike, 4, 7), 2, 'Cut-point spikes stay out of the range');
}

/* ------------------------------------------------------------------ */
/* 报告                                                                */
/* ------------------------------------------------------------------ */
const cfgOf = (html) => JSON.parse(html.split('\n').find((l) => l.startsWith('const CFG=')).slice('const CFG='.length, -1));
{
  const md = renderMd(baseDoc(), CTX());
  ok(md.includes('S01') && md.includes('S03'), 'Markdown lists every shot');
  ok(md.includes('00:04.00'), 'Markdown uses timecodes');
  ok(md.includes('全景') && md.includes('手持微晃'), 'Markdown follows lang:zh from the JSON');
  ok(renderMd(baseDoc(), { lang: 'en' }).includes('Shot list'), '--lang en switches the interface');

  // 界面语言的优先级：--lang > JSON 顶层 lang > 默认英文
  const enDoc = { ...baseDoc(), lang: 'en' };
  const noLangDoc = { ...baseDoc() }; delete noLangDoc.lang;
  ok(cfgOf(renderHtml(enDoc, CTX())).words.pageShots === 'Shots', 'lang:en in the JSON gives English');
  ok(cfgOf(renderHtml(enDoc, { ...CTX(), lang: 'zh' })).words.pageShots === '镜头明细', '--lang overrides the JSON lang');
  ok(cfgOf(renderHtml(noLangDoc, CTX())).words.pageShots === 'Shots', 'neither given means English');
  // 切的只是标签：模型写的正文一个字都不动
  ok(renderHtml(enDoc, CTX()).includes(baseDoc().shots[0].frame), 'frame descriptions stay verbatim under an English interface');
  ok(cfgOf(renderHtml(enDoc, CTX())).labels.sizes.wide === 'wide', 'the vocabulary labels follow the interface language');
}

/*
 * HTML 报告是「壳 + 资产 + 数据」三层：壳由 renderHtml 生成，样式与交互是
 * scripts/report.css 与 report.js 两份可直接编辑的资产，页面内容由 report.js
 * 从 DOC 与 CFG 算出来。所以这里查的是**契约**，不是某一段 HTML 长什么样。
 */
{
  const doc = baseDoc();
  doc.shots[0].frame = '窗台上放着 <script>alert(1)</script> 的纸盒，边角磨白了';
  const html = renderHtml(doc, CTX());

  ok(!html.includes('<script>alert(1)</script>'), 'Tags inside a frame description never reach the page raw');
  ok(html.includes('\\u003cscript'), 'Embedded JSON escapes < so the script block cannot be cut short');
  ok(html.includes('createReportPlayer'), 'report.js is inlined');
  ok(html.includes('.shot-card'), 'report.css is inlined');
  ok(!/\$\{/.test(html.slice(0, html.indexOf('const DOC='))), 'The shell has no unreplaced template placeholders');
  ok(html.includes('id="report-video"'), 'A player is present');
  ok(html.includes('id="timeline"') && html.includes('id="cards"') && html.includes('id="distributions"'), 'All four containers are present');
  eq((html.match(/<li class="(ok|bad|skip)"/g) ?? []).length, 14, 'All 14 gates are listed on the page');
  ok(html.includes('00:00') && html.includes('00:10.00'), 'Timeline ticks round down and end with the duration');

  const cfg = cfgOf(html);
  eq(Object.keys(cfg.labels.sizes).length, Object.keys(SHOT_SIZES).length, 'The full size vocabulary reaches the page');
  eq(Object.keys(cfg.labels.cams).length, Object.keys(CAMERA_MOVES).length, 'The full camera vocabulary reaches the page, not only the used entries');
  eq(Object.keys(cfg.colors).length, Object.keys(SHOT_SIZES).length, 'Every size has a color');
  eq(cfg.filters[0][0], 'all', 'The first filter entry is all');
  ok(cfg.filters.some(([k]) => k === 'dialogue'), 'Categories in use appear in the filter bar');
  eq(cfg.exportName, 't-shots.json', 'The export file name follows the title');

  // report.js 里引用的每一个文案键都必须存在——写漏一个，页面上就是 undefined
  const source = readFileSync(new URL('./report.js', import.meta.url), 'utf8');
  const keys = [...new Set([...source.matchAll(/\bW\.([A-Za-z]+)/g)].map((m) => m[1]))];
  ok(keys.length > 20, `report.js references at least 20 copy keys (actual ${keys.length})`);
  for (const lang of ['zh', 'en']) {
    const words = cfgOf(renderHtml(baseDoc(), { ...CTX(), lang })).words;
    const missing = keys.filter((k) => words[k] === undefined);
    ok(missing.length === 0, `The ${lang} word table is missing: ${missing.join(', ')}`);
  }
}

{
  // 关键帧：有就嵌，没有就明说，绝不摆一个会 404 的 img
  const cfg = cfgOf(renderHtml(baseDoc(), { ...CTX(), frameRel: 'frames', frameExists: { S01a: true, S01b: true, S02a: true } }));
  eq(cfg.frames.S01, 'ab', 'Both frames present');
  eq(cfg.frames.S02, 'a', 'Only the first frame present');
  eq(cfg.frames.S03, '', 'No frames present');
  eq(cfg.frameDir, 'frames', 'The frame directory reaches the page');

  const bare = cfgOf(renderHtml(baseDoc(), CTX()));
  eq(Object.values(bare.frames).join(''), '', 'Without extracted frames nothing is claimed');
}

{
  // 人物头像取「只有他一个人 + 景别最近 + 出场最早」的那一镜
  const doc = baseDoc();
  doc.cast = [{ id: 'P1', name: '老太太' }];
  doc.shots[0].subjects = ['P1'];          // S01 全景，同框只有他
  doc.shots[1].subjects = ['P1'];          // S02 特写，同框只有他
  doc.shots[2].subjects = ['P1'];
  doc.shots[2].category = 'subject';
  const all = { S01a: true, S02a: true, S03a: true };
  eq(cfgOf(renderHtml(doc, { ...CTX(), frameExists: all })).portraits.P1, 'S02', 'The closest shot is picked for the portrait');
  eq(cfgOf(renderHtml(doc, { ...CTX(), frameExists: { S01a: true } })).portraits.P1, 'S01', 'A single usable frame is used');
  eq(cfgOf(renderHtml(doc, CTX())).portraits.P1, undefined, 'No frames means no portrait, no forced fallback');

  const noCast = baseDoc();
  noCast.cast = [];
  ok(!renderHtml(noCast, CTX()).includes('id="cast-grid"'), 'No cast means no cast section');
  ok(renderHtml(baseDoc(), CTX()).includes('id="cast-grid"'), 'A cast produces the cast section');
}

{
  // 提示里点名的镜号做成按钮，点一下能跳过去
  const doc = baseDoc();
  doc.shots[2].camera = 'static';
  const busy = baseTrack();
  for (let i = 37; i <= 48; i += 1) busy.values[i] = 30;
  const html = renderHtml(doc, { track: busy });
  ok(html.includes('data-shot="S03"'), 'A shot id named in a hint becomes a clickable button');
  ok(html.includes('class="hint"'), 'Hints render as their own block');

  const broken = baseDoc();
  broken.shots[1].size = 'closeup';
  const bad = renderHtml(broken, CTX());
  ok(bad.includes('quality-banner bad'), 'The banner turns red when a gate fails');
  ok(bad.includes('<li class="bad"'), 'Each failed gate is marked red');
}

{
  // 播放器指哪条片子
  ok(renderHtml(baseDoc(), { ...CTX(), video: '../demo.mp4' }).includes('src="../demo.mp4"'), '--video sets the source video path');
  ok(renderHtml(baseDoc(), CTX()).includes('src="t.mp4"'), 'Without it the source field from the JSON is used');
  const posterless = renderHtml(baseDoc(), CTX());
  ok(!posterless.includes('poster='), 'No extracted frames means no poster');
  ok(renderHtml(baseDoc(), { ...CTX(), frameExists: { S01a: true } }).includes('poster="frames/S01a.jpg"'), 'The first frame becomes the poster');
}

/* ------------------------------------------------------------------ */
/* 自带样例：既是质量基准，也是夹具                                      */
/* ------------------------------------------------------------------ */
{
  const url = new URL('../examples/demo-shots.json', import.meta.url);
  const trackUrl = new URL('../examples/demo-track.json', import.meta.url);
  const doc = JSON.parse(readFileSync(url, 'utf8'));
  const track = JSON.parse(readFileSync(trackUrl, 'utf8'));
  const v = validate(doc, { track });
  ok(v.ok, `The example must pass every gate (failed: ${v.failed.map((g) => g.id).join(', ')})`);
  eq(doc.shots.length, 53, 'The example has 53 shots');
  eq(stats(doc).totalSeconds, doc.meta.durationSeconds, 'Example shot durations sum to the video duration');
  ok(v.hints.length >= 1, 'The example keeps one motion hint as a sample');
  ok(doc.shots.every((s) => s.frame.length >= 12), 'Every example shot has a proper frame description');
}

/* ------------------------------------------------------------------ */

if (failures.length) {
  process.stderr.write(`\n${failures.length} assertions failed:\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.stderr.write(`\nPassed ${passed}/${passed + failures.length}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`✅ All ${passed} assertions passed (every one of the 14 gates has a test that breaks it)\n`);
}
