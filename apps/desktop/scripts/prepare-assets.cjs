const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const MODEL_URL = 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx';
const MODEL_SHA256 = '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8';
async function prepare() {
  const modelPath = path.join(root, 'assets/u2netp.onnx');
  await fs.mkdir(path.dirname(modelPath), { recursive: true });
  let bytes;
  try { bytes = await fs.readFile(modelPath); } catch {}
  const valid = buffer => buffer && createHash('sha256').update(buffer).digest('hex') === MODEL_SHA256;
  if (!valid(bytes)) {
    console.log('Downloading U²-NetP (4.7 MB), for offline image extraction…');
    const response = await fetch(MODEL_URL, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Model download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (!valid(bytes)) throw new Error('Model checksum mismatch; refusing to package');
    await fs.writeFile(`${modelPath}.tmp`, bytes);
    await fs.rename(`${modelPath}.tmp`, modelPath);
  }
  await sharp(path.join(root, '../web/public/money-dance-icon.svg')).resize(1024, 1024).png().toFile(path.join(root, 'assets/icon.png'));
  const traySvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><path fill="black" d="M4 9 3 3l6 3h4l6-3-1 6c3 7-1 11-7 11S1 16 4 9Z"/><path fill="white" d="M6 11h2v2H6zm8 0h2v2h-2zm-4 4h2v2h-2z"/></svg>');
  await sharp(traySvg).png().toFile(path.join(root, 'assets/trayTemplate.png'));
  await sharp(traySvg).resize(44, 44).png().toFile(path.join(root, 'assets/trayTemplate@2x.png'));
  if (process.argv.includes('--copy-web')) {
    const webTarget = path.join(root, 'web');
    // Fixed, validated build output only. Never touch source or user data.
    if (path.resolve(webTarget) !== path.join(root, 'web')) throw new Error('Invalid build output');
    await fs.rm(webTarget, { recursive: true, force: true });
    await fs.cp(path.join(root, '../web/dist'), webTarget, { recursive: true });
    for (const file of await fs.readdir(path.join(webTarget, 'assets'))) {
      if (!file.endsWith('.css')) continue;
      const target = path.join(webTarget, 'assets', file);
      const css = await fs.readFile(target, 'utf8');
      // Desktop uses installed system fonts; no remote font requests.
      await fs.writeFile(target, css.replace(/@import\s*(?:url\([^)]*\)|"[^"]*"|'[^']*')\s*;/g, rule => rule.includes('fonts.googleapis.com') ? '' : rule));
    }
    await fs.copyFile(path.join(root, '../../THIRD_PARTY_NOTICES.md'), path.join(root, 'assets/THIRD_PARTY_NOTICES.md'));
  }
  console.log('Desktop assets verified; model and image processing are fully local.');
}
prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
