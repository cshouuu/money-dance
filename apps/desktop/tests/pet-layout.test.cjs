const { test } = require('node:test');
const assert = require('node:assert/strict');
const { layoutPet, sanitizeMetrics } = require('../src/pet-layout.cjs');
const area = { x: 0, y: 0, width: 1920, height: 1040 };
const metrics = { bodyWidth: 160, bodyHeight: 189, panelWidth: 280, panelHeight: 70 };
const bodyRect = l => ({ x: l.bounds.x + l.body.x, y: l.bounds.y + l.body.y, width: l.body.width, height: l.body.height });
test('pet can touch left, right, top and bottom without reserving a 320x360 window', () => {
  for (const bodyWidth of [120, 160, 200]) {
    const m = { ...metrics, bodyWidth, bodyHeight: bodyWidth + 29 };
    for (const x of [-100, 2020]) for (const y of [-100, 1140]) {
      const l = layoutPet({ x, y }, [area], m), b = bodyRect(l);
      assert.equal(x < 0 ? b.x : b.x + b.width, x < 0 ? 0 : 1920);
      assert.equal(y < 0 ? b.y : b.y + b.height, y < 0 ? 0 : 1040);
      assert.ok(l.bounds.x >= 0 && l.bounds.y >= 0);
      assert.ok(l.bounds.x + l.bounds.width <= 1920 && l.bounds.y + l.bounds.height <= 1040);
    }
  }
});
test('bubble sits 8px above the body, flips below at the top edge, and never moves the pet', () => {
  const idle = layoutPet({ x: 1800, y: 900 }, [area], { ...metrics, panelHeight: 0 });
  const speech = layoutPet(idle.anchor, [area], metrics);
  assert.deepEqual(bodyRect(idle), bodyRect(speech));
  assert.equal(speech.body.y - speech.panel.y - speech.panel.height, 8);
  const top = layoutPet({ x: 80, y: 189 }, [area], metrics);
  assert.equal(top.placement, 'below');
  assert.equal(top.panel.y - top.body.y - top.body.height, 8);
  assert.equal(top.bounds.x, 0, 'panel aligns inside screen at left edge');
  const menu = layoutPet(speech.anchor, [area], { ...metrics, panelWidth: 194, panelHeight: 300 });
  assert.deepEqual(bodyRect(speech), bodyRect(menu));
});
test('only current content determines native window size; size changes retain bottom anchor', () => {
  const idle = layoutPet({ x: 600, y: 900 }, [area], { ...metrics, panelHeight: 0 });
  assert.equal(idle.bounds.width, 160); assert.equal(idle.bounds.height, 189);
  const resized = layoutPet(idle.anchor, [area], { bodyWidth: 200, bodyHeight: 229, panelWidth: 0, panelHeight: 0 });
  assert.deepEqual(resized.anchor, idle.anchor);
});
test('negative monitor coordinates, disconnected screens and small work areas stay reachable', () => {
  const left = { x: -1280, y: 0, width: 1280, height: 720 };
  const placed = layoutPet({ x: -1200, y: 720 }, [area, left], metrics);
  assert.equal(placed.bounds.x, -1280);
  assert.equal(placed.anchor.y, 720);
  const recovered = layoutPet(placed.anchor, [area], metrics);
  assert.equal(bodyRect(recovered).x, 0);
  const small = layoutPet(null, [{ x: 0, y: 0, width: 800, height: 400 }], { ...metrics, panelHeight: 300 });
  assert.equal(small.placement, 'left');
  assert.ok(small.bounds.height <= 400 && small.bounds.width <= 800);
});
test('rejects forged non-finite, negative and oversized layout requests', () => {
  for (const bodyWidth of [NaN, Infinity, -1, 10000]) assert.throws(() => sanitizeMetrics({ ...metrics, bodyWidth }), /无效/);
});
