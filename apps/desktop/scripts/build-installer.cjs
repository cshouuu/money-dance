const path = require('node:path');
const { build, Platform, Arch } = require('electron-builder');
const { buildConfig } = require('./build-config.cjs');

async function main() {
  const [platform, arch] = process.argv.slice(2);
  const config = buildConfig(platform, arch);
  if (process.env.MONEY_DANCE_ELECTRON_DIST) config.electronDist = path.resolve(process.env.MONEY_DANCE_ELECTRON_DIST);
  const target = platform === 'win32' ? Platform.WINDOWS : Platform.MAC;
  await build({ projectDir: path.resolve(__dirname, '..'), targets: target.createTarget(platform === 'win32' ? ['nsis'] : ['dmg', 'zip'], Arch[arch]), config, publish: 'never' });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
