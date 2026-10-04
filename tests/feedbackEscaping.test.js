import test from 'node:test';
import assert from 'node:assert/strict';
import { escHtml } from '../js/core/helpers.js';

test('the legacy feedback board escapes stored content, types and action IDs', async () => {
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  const elements = new Map(['feedbackModal', 'feedbackModalCard', 'feedbackModalContent', 'fbContent']
    .map((id) => [id, { style: {}, innerHTML: '' }]));
  const item = {
    id: 'bad" data-action="injected" title="',
    type: '<svg onload="alert(1)">',
    text: ['<img src=x onerror="alert(2)">'],
    context: { tab: ['<iframe src="javascript:alert(3)">'] },
  };
  try {
    globalThis.document = {
      documentElement: { dataset: {} },
      getElementById: (id) => elements.get(id) ?? null,
      addEventListener: () => {},
    };
    globalThis.window = {
      _shohoj_currentUid: () => 'viewer',
      _shohoj_isAdmin: () => true,
      _shohoj_fetchAllFeedback: async () => [item],
      _shohoj_fetchAllUpvotes: async () => [],
    };
    globalThis.requestAnimationFrame = (callback) => callback();
    const { openFeedbackModal } = await import('../js/ui/feedback.js');
    openFeedbackModal();
    window._shohoj_fbTab('board');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const html = elements.get('fbContent').innerHTML;
    for (const value of [item.type, item.text, item.context.tab]) {
      assert.ok(html.includes(escHtml(value)), `escaped content: ${String(value)}`);
      assert.ok(!html.includes(String(value)), 'no attacker-controlled HTML survives');
    }
    assert.equal(html.split(`data-id="${escHtml(item.id)}"`).length - 1, 2);
    assert.ok(!html.includes('data-action="injected"'));
    assert.ok(html.includes('data-action="fb:adminDel"'));
    assert.ok(html.includes('data-action="fb:upvote"'));
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
