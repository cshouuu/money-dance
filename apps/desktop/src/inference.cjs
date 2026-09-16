const path = require('node:path');
const fs = require('node:fs');

function inferenceBackend(platform = process.platform, arch = process.arch) {
  return platform === 'darwin' && arch === 'x64' ? 'wasm' : 'native';
}

function loadInference(backend = inferenceBackend()) {
  if (backend === 'native') return { ort: require('onnxruntime-node'), options: { executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1 } };
  if (backend !== 'wasm') throw new Error('Unknown inference backend');
  // ORT 1.24+ no longer ships Intel macOS binaries. Keep the current runtime
  // using its CPU WASM build, inside our existing worker, entirely offline.
  const entry = require.resolve('onnxruntime-web').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  const ort = require(entry);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmBinary = fs.readFileSync(path.join(path.dirname(entry), 'ort-wasm-simd-threaded.wasm'));
  return { ort, options: { executionProviders: ['wasm'] } };
}

module.exports = { inferenceBackend, loadInference };
