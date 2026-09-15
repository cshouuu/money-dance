const sharp = require('sharp');
const { unzipSync } = require('fflate');
const { createHash } = require('node:crypto');
const STATES = ['idle', 'working', 'slacking', 'overtime', 'rest', 'love', 'celebrate'];
const LIMIT = 25 * 1024 * 1024;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function fail(message) { throw new Error(`动作包：${message}`); }
function safePath(name) {
  return typeof name === 'string' && name.length <= 180 && !/[\\:\x00-\x1f]/.test(name)
    && !name.startsWith('/') && name.split('/').every(part => part && part !== '.' && part !== '..');
}
function bindingsFor(clips, input = {}) {
  if (!object(input)) fail('动作绑定必须是对象');
  const result = {};
  for (const state of STATES) {
    const key = input[state] ?? (Object.hasOwn(clips, state) ? state : 'idle');
    if (typeof key !== 'string' || !Object.hasOwn(clips, key)) fail(`${state} 绑定了不存在的动作`);
    result[state] = key;
  }
  result.idle = 'idle';
  return result;
}
function duration(value) {
  if (!Number.isInteger(value) || value < 40 || value > 10_000) fail('每帧时长需为 40～10000 毫秒');
  return value;
}
/** Decode only raster files in memory. ZIP entries are never written to filesystem paths. */
async function loadPack(input, progress = () => {}) {
  const bytes = Buffer.from(input);
  if (bytes.length > LIMIT) fail('ZIP 不能超过 25 MB');
  let files, total = 0, entries = 0;
  const names = new Set();
  try {
    files = unzipSync(bytes, { filter(entry) {
      const directory = entry.name.endsWith('/');
      const name = directory ? entry.name.slice(0, -1) : entry.name;
      if (!safePath(name)) fail('包含不安全的文件路径');
      if (++entries > 520) fail('文件数量超过 520 个');
      if (names.has(name.toLowerCase())) fail('包含重复文件名');
      names.add(name.toLowerCase());
      if (![entry.size, entry.originalSize].every(Number.isSafeInteger)) fail('ZIP 文件大小字段无效');
      // Stored entries use compressed size directly; do not trust an understated originalSize.
      total += Math.max(entry.size, entry.originalSize);
      if (Math.max(entry.size, entry.originalSize) > 15 * 1024 * 1024 || total > 80 * 1024 * 1024) fail('解压后的素材过大');
      if (directory) return false;
      if (!/\.(png|gif|webp|json|txt|md)$/i.test(name)) fail('只允许图片、JSON 和说明文件，不支持脚本');
      return true;
    } });
  } catch (error) { if (error.message.startsWith('动作包：')) throw error; fail('ZIP 损坏或格式不受支持'); }
  const manifests = Object.keys(files).filter(name => name === 'pet.json' || name.endsWith('/pet.json'));
  if (manifests.length !== 1) fail('需要且只能有一个 pet.json（支持外层文件夹）');
  const manifestPath = manifests[0], prefix = manifestPath.slice(0, -8);
  if (files[manifestPath].length > 64 * 1024) fail('pet.json 不能超过 64 KB');
  let manifest;
  try { manifest = JSON.parse(Buffer.from(files[manifestPath]).toString('utf8')); } catch { fail('pet.json 不是有效的 JSON'); }
  if (!object(manifest) || manifest.version !== 1) fail('仅支持 version: 1');
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 40) fail('请填写 1～40 字的角色名称');
  if (!object(manifest.animations) || !Object.hasOwn(manifest.animations, 'idle')) fail('animations 必须包含 idle 待机动作');
  const keys = Object.keys(manifest.animations);
  if (keys.length > 16 || keys.some(key => !/^[a-z][a-z0-9_-]{0,23}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key))) fail('动作名称需为英文小写开头的短名称，最多 16 组');
  const clips = {}, sheets = {}, warnings = [];
  let totalFrames = 0, outputBytes = 0;
  function read(file) {
    if (!safePath(file) || !/\.(png|gif|webp)$/i.test(file)) fail('素材必须是包内 PNG、GIF 或 WebP 相对路径');
    const data = files[prefix + file];
    if (!data) fail(`缺少素材 ${file}`);
    return Buffer.from(data);
  }
  async function meta(data) {
    const result = await sharp(data, { limitInputPixels: 40_000_000 }).metadata();
    const h = result.pageHeight || result.height;
    if (!['png', 'gif', 'webp'].includes(result.format) || !result.width || !h || result.width > 4096 || h > 4096
      || (result.pages || 1) > 120 || result.width * h * (result.pages || 1) > 40_000_000) fail('图片尺寸或帧数过大（单组最多 120 帧）');
    return result;
  }
  for (const key of keys) {
    progress(`正在检查并整理动作 ${key}（${Object.keys(clips).length + 1}/${keys.length}）…`);
    const spec = manifest.animations[key];
    if (!object(spec)) fail(`${key} 的动作配置无效`);
    const frames = [], delays = [];
    let sourceWidth, sourceHeight;
    const add = async (data, ms) => {
      const m = await meta(data);
      if (m.pages > 1) fail('连续帧或精灵图必须使用静态图片');
      if (sourceWidth && (m.width !== sourceWidth || m.height !== sourceHeight)) fail(`${key} 的各帧画布尺寸必须一致`);
      sourceWidth = m.width; sourceHeight = m.height;
      frames.push(data); delays.push(duration(ms));
    };
    if (Array.isArray(spec.frames)) {
      if (spec.frames.length < 1 || spec.frames.length > 120 || spec.file || spec.sheet) fail(`${key} 的连续帧配置无效`);
      for (const frame of spec.frames) {
        if (!object(frame)) fail('连续帧需要 file 和 durationMs');
        await add(read(frame.file), frame.durationMs ?? spec.frameDurationMs ?? 100);
      }
    } else if (object(spec.sheet)) {
      if (spec.file) fail('不能同时设置 file 和 sheet');
      const { file, frameWidth, frameHeight, count } = spec.sheet;
      if (![frameWidth, frameHeight, count].every(Number.isInteger) || frameWidth < 1 || frameHeight < 1 || count < 1 || count > 120) fail('精灵图尺寸和帧数无效');
      const data = read(file), m = await meta(data);
      if (m.pages > 1 || m.width % frameWidth || m.height % frameHeight || count > (m.width / frameWidth) * (m.height / frameHeight)) fail('精灵图必须可以按帧尺寸整齐切分');
      for (let i = 0; i < count; i++) {
        const png = await sharp(data).extract({ left: (i % (m.width / frameWidth)) * frameWidth, top: Math.floor(i / (m.width / frameWidth)) * frameHeight, width: frameWidth, height: frameHeight }).png().toBuffer();
        await add(png, spec.durationsMs?.[i] ?? spec.frameDurationMs ?? 100);
      }
      if (spec.durationsMs && (!Array.isArray(spec.durationsMs) || spec.durationsMs.length !== count)) fail('durationsMs 数量必须与精灵图帧数一致');
    } else if (typeof spec.file === 'string') {
      const data = read(spec.file), m = await meta(data);
      for (let i = 0; i < (m.pages || 1); i++) {
        const png = await sharp(data, { page: i, pages: 1, limitInputPixels: 40_000_000 }).png().toBuffer();
        await add(png, spec.frameDurationMs ?? Math.max(40, m.delay?.[i] || 100));
      }
    } else fail(`${key} 需要 file、frames 或 sheet`);
    totalFrames += frames.length;
    if (totalFrames > 420) fail('整个包最多 420 帧');
    const stillFrame = spec.stillFrame ?? 0;
    if (!Number.isInteger(stillFrame) || stillFrame < 0 || stillFrame >= frames.length) fail(`${key} 的 stillFrame 越界`);
    if (delays.reduce((a, b) => a + b, 0) > 60_000) fail(`${key} 一次播放不能超过 60 秒`);
    // Preserve each source canvas, including intentional movement and transparent margins.
    const scale = Math.min(1, 256 / sourceWidth, 256 / sourceHeight);
    const w = Math.max(1, Math.round(sourceWidth * scale)), h = Math.max(1, Math.round(sourceHeight * scale));
    const columns = Math.min(8, frames.length), rows = Math.ceil(frames.length / columns);
    const composite = [];
    let transparent = false, visible = false;
    for (let i = 0; i < frames.length; i++) {
      const png = await sharp(frames[i]).resize(w, h).ensureAlpha().png().toBuffer();
      const stats = await sharp(png).stats();
      transparent ||= stats.channels[3].min < 255;
      visible ||= stats.channels[3].max > 0;
      composite.push({ input: png, left: (i % columns) * w, top: Math.floor(i / columns) * h });
    }
    if (!visible) fail(`${key} 的图片完全透明`);
    if (!transparent) warnings.push(`${key} 没有透明背景，桌面上会显示图片底色。`);
    const sheet = await sharp({ create: { width: w * columns, height: h * rows, channels: 4, background: '#00000000' } }).composite(composite).png().toBuffer();
    outputBytes += sheet.length;
    if (outputBytes > 32 * 1024 * 1024) fail('处理后的动作包过大，请减少帧数或图片细节');
    sheets[key] = sheet;
    clips[key] = { width: w * columns, height: h * rows, frameWidth: w, frameHeight: h, columns, durations: delays, stillFrame };
  }
  return { id: createHash('sha256').update(bytes).digest('hex'), name: manifest.name.trim(), author: typeof manifest.author === 'string' ? manifest.author.slice(0, 80) : '',
    clips, bindings: bindingsFor(clips, manifest.bindings), warnings, sheets };
}
function publicPack(pack, inputBindings = pack.bindings) {
  return { id: pack.id, name: pack.name, author: pack.author, warnings: pack.warnings, bindings: bindingsFor(pack.clips, inputBindings),
    clips: Object.fromEntries(Object.entries(pack.clips).map(([key, clip]) => [key, { ...clip, src: `moneydance://app/pet-pack/${pack.id}/${key}.png` }])) };
}
module.exports = { loadPack, publicPack, bindingsFor, LIMIT, STATES };
