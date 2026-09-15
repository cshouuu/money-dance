const sharp = require('sharp');
const { loadInference } = require('./inference.cjs');
/** Local U²-NetP salient-object extraction. User images never leave this process. */
async function extract(bytes, mode, modelPath, progress = () => {}, backend) {
  sharp.cache(false); sharp.concurrency(2);
  progress('正在读取图片…');
  const input = sharp(bytes, { limitInputPixels: 25_000_000, animated: false });
  const metadata = await input.metadata();
  if (!['png', 'jpeg', 'webp'].includes(metadata.format)) throw new Error('仅支持 PNG、JPG 和 WebP 图片');
  if (mode === 'transparent' && !metadata.hasAlpha) throw new Error('这张图片没有透明通道，请使用自动提取主体');
  const { data, info } = await input.rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let rgba = Buffer.from(data);
  if (mode === 'extract') {
    progress('正在识别主体，第一次可能需要稍等…');
    const { ort, options } = loadInference(backend);
    const rgb = await sharp(rgba, { raw: { width, height, channels: 4 } }).removeAlpha().resize(320, 320, { fit: 'fill' }).raw().toBuffer();
    const tensor = new Float32Array(3 * 320 * 320);
    let max = 1;
    for (const value of rgb) max = Math.max(max, value);
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (let i = 0; i < 320 * 320; i++) for (let c = 0; c < 3; c++) tensor[c * 320 * 320 + i] = (rgb[i * 3 + c] / max - mean[c]) / std[c];
    // Electron's fs reads ASAR assets; native ONNX fopen cannot open paths inside ASAR.
    const model = await require('node:fs/promises').readFile(modelPath);
    const session = await ort.InferenceSession.create(model, options);
    try {
      const output = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, 320, 320]) });
      const mask = output[session.outputNames[0]].data;
      let low = Infinity, high = -Infinity;
      for (const value of mask) { low = Math.min(low, value); high = Math.max(high, value); }
      if (!Number.isFinite(high) || high - low < 1e-6) throw new Error('没有识别到清晰主体，请换一张背景更简单的图片');
      const normalized = Buffer.from(mask.map(value => Math.round((value - low) / (high - low) * 255)));
      const alpha = await sharp(normalized, { raw: { width: 320, height: 320, channels: 1 } }).resize(width, height).toColourspace('b-w').raw().toBuffer();
      for (let i = 0; i < width * height; i++) rgba[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * alpha[i] / 255);
    } finally { await session.release(); }
  }
  progress('正在整理透明边缘…');
  let left = width, top = height, right = -1, bottom = -1, transparent = false;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = rgba[(y * width + x) * 4 + 3];
    if (alpha < 240) transparent = true;
    if (alpha > 30) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  }
  if (right < left || (right - left + 1) * (bottom - top + 1) < 64) throw new Error('主体太小或图片完全透明，请换一张图片');
  if (mode === 'transparent' && !transparent) throw new Error('图片背景并不透明，请选择自动提取主体');
  return sharp(rgba, { raw: { width, height, channels: 4 } }).extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true }).extend({ top: 12, bottom: 12, left: 12, right: 12, background: '#00000000' }).png().toBuffer();
}
module.exports = { extract };
