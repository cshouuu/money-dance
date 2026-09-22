const COPY_SCENES = ['love', 'break', 'warmth', 'rest', 'celebrate', 'focus'];
function sanitizeBubbleTexts(value) {
  const result = {};
  for (const scene of COPY_SCENES) {
    result[scene] = Array.isArray(value?.[scene])
      ? value[scene].filter(text => typeof text === 'string').map(text => [...text.trim()].slice(0, 120).join('')).filter(Boolean).slice(0, 10)
      : [];
  }
  return result;
}
function bubbleText(settings, scene, fallback, random = Math.random) {
  const choices = settings.bubbleTexts?.[scene];
  return choices?.length ? choices[Math.floor(random() * choices.length)] : fallback;
}
module.exports = { COPY_SCENES, sanitizeBubbleTexts, bubbleText };
