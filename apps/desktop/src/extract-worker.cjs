const { parentPort, workerData } = require('node:worker_threads');
const { extract } = require('./extract.cjs');
extract(Buffer.from(workerData.bytes), workerData.mode, workerData.modelPath, progress => parentPort.postMessage({ progress }))
  .then(png => parentPort.postMessage({ png }))
  .catch(error => parentPort.postMessage({ error: `无法制作桌宠：${error.message}` }));
