const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// A resized/moved transparent window can have no compositor surface yet on a
// hosted Windows desktop. Keep the screenshot mandatory, but wait for a frame
// and retry that specific transient capture error instead of failing on timing.
async function capturePage(win) {
  let lastError;
  for (let attempt = 0; attempt < 10; attempt++) {
    await delay(250);
    try {
      const image = await win.webContents.capturePage();
      if (image.isEmpty()) throw new Error('Empty screenshot');
      return image;
    } catch (error) {
      if (!/UnknownVizError|Empty screenshot/.test(error.message)) throw error;
      lastError = error;
      console.log(`Waiting for compositor capture (${attempt + 1}/10): ${error.message}`);
    }
  }
  throw new Error(`Screenshot failed after compositor retries: ${lastError.message}`);
}
module.exports = { capturePage };
