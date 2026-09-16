const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
async function main() {
  const root = path.resolve(__dirname, '../release');
  const files = (await fs.readdir(root)).filter(file => /\.(exe|dmg|zip)$/.test(file));
  if (!files.length) throw new Error('No installers were produced');
  for (const file of files) {
    const digest = createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex');
    await fs.writeFile(path.join(root, `${file}.sha256`), `${digest}  ${file}\n`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
