const { parentPort, workerData } = require('node:worker_threads');
const { loadPack } = require('./pet-pack.cjs');
loadPack(workerData.bytes, progress => parentPort.postMessage({ progress }))
  .then(pack => parentPort.postMessage({ pack }))
  .catch(error => parentPort.postMessage({ error: error.message.startsWith('动作包：') ? error.message : '动作包：无法解码素材，请检查图片是否损坏。' }));
