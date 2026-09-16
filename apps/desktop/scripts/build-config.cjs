const { build: base } = require('../package.json');

function buildConfig(platform, arch) {
  if (!['win32', 'darwin'].includes(platform) || !['x64', 'arm64'].includes(arch)) throw new Error('Unsupported desktop target');
  const intelMac = platform === 'darwin' && arch === 'x64';
  const exclusions = [];
  for (const os of ['linux', 'win32', 'darwin']) {
    if (os !== platform || intelMac) exclusions.push(`!node_modules/onnxruntime-node/bin/napi-v6/${os}/**`);
    else exclusions.push(`!node_modules/onnxruntime-node/bin/napi-v6/${os}/${arch === 'x64' ? 'arm64' : 'x64'}/**`);
  }
  // Include just the Node CPU WASM entry and its loader/binary, not browser/GPU builds.
  const wasmFiles = ['ort.node.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];
  return {
    ...base,
    files: [...base.files, ...exclusions,
      intelMac ? '!node_modules/onnxruntime-web/dist/!(' + wasmFiles.join('|') + ')' : '!node_modules/onnxruntime-web/**'],
    mac: {
      category: 'public.app-category.productivity',
      icon: 'assets/icon.png',
      artifactName: 'MoneyDance-${version}-macos-${arch}.${ext}',
      minimumSystemVersion: '14.0.0',
      identity: '-',
      hardenedRuntime: false,
      notarize: false,
      gatekeeperAssess: false,
      entitlements: 'assets/entitlements.mac.plist',
      entitlementsInherit: 'assets/entitlements.mac.plist',
    },
    dmg: { sign: false },
  };
}

module.exports = { buildConfig };
