const clamp = (value, low, high) => Math.max(low, Math.min(value, Math.max(low, high)));
function sanitizeMetrics(value) {
  if (!value || typeof value !== 'object') throw new Error('无效的桌宠布局');
  const result = {};
  for (const [key, max] of Object.entries({ bodyWidth: 360, bodyHeight: 440, panelWidth: 320, panelHeight: 400 })) {
    if (!Number.isFinite(value[key]) || value[key] < (key.startsWith('body') ? 40 : 0) || value[key] > max) throw new Error('无效的桌宠尺寸');
    result[key] = Math.ceil(value[key]);
  }
  return result;
}
/** Position is the body's bottom centre in screen DIPs, independent of transient panels. */
function layoutPet(position, areas, metrics) {
  const m = sanitizeMetrics(metrics);
  const valid = Number.isFinite(position?.x) && Number.isFinite(position?.y);
  const distance = a => valid ? Math.hypot(position.x - clamp(position.x, a.x, a.x + a.width), position.y - clamp(position.y, a.y, a.y + a.height)) : 0;
  const area = [...areas].sort((a, b) => distance(a) - distance(b))[0];
  const w = Math.min(m.bodyWidth, area.width), h = Math.min(m.bodyHeight, area.height);
  const x = Math.round(clamp(valid ? position.x - w / 2 : area.x + area.width - w, area.x, area.x + area.width - w));
  const y = Math.round(clamp(valid ? position.y - h : area.y + area.height - h, area.y, area.y + area.height - h));
  const body = { x, y, width: w, height: h };
  let panel = null, placement = 'above';
  if (m.panelWidth && m.panelHeight) {
    const pw = Math.min(m.panelWidth, area.width), ph = Math.min(m.panelHeight, area.height), gap = 8;
    let px = clamp(x + w / 2 - pw / 2, area.x, area.x + area.width - pw), py;
    if (y - gap - ph >= area.y) py = y - gap - ph;
    else if (y + h + gap + ph <= area.y + area.height) { py = y + h + gap; placement = 'below'; }
    else if (x + w + gap + pw <= area.x + area.width) { px = x + w + gap; py = clamp(y, area.y, area.y + area.height - ph); placement = 'right'; }
    else if (x - gap - pw >= area.x) { px = x - gap - pw; py = clamp(y, area.y, area.y + area.height - ph); placement = 'left'; }
    else { py = clamp(y - gap - ph, area.y, area.y + area.height - ph); placement = 'overlay'; }
    panel = { x: Math.round(px), y: Math.round(py), width: pw, height: ph };
  }
  const left = Math.min(x, panel?.x ?? x), top = Math.min(y, panel?.y ?? y);
  const right = Math.max(x + w, panel ? panel.x + panel.width : x + w), bottom = Math.max(y + h, panel ? panel.y + panel.height : y + h);
  return {
    bounds: { x: left, y: top, width: right - left, height: bottom - top },
    anchor: { x: x + w / 2, y: y + h },
    body: { ...body, x: x - left, y: y - top },
    panel: panel ? { ...panel, x: panel.x - left, y: panel.y - top } : null,
    placement,
  };
}
module.exports = { layoutPet, sanitizeMetrics };
