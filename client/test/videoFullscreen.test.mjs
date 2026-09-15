import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoFullscreen } from '../src/utils/videoFullscreen.js';

function fixture(native = false) {
  const doc = new EventTarget();
  const video = new EventTarget();
  let exits = 0;
  function start() {
    if (native) {
      video.webkitDisplayingFullscreen = true;
      video.dispatchEvent(new Event('webkitbeginfullscreen'));
    } else {
      doc.fullscreenElement = video;
      doc.dispatchEvent(new Event('fullscreenchange'));
    }
  }
  function stop() {
    exits++;
    if (native) {
      video.webkitDisplayingFullscreen = false;
      video.dispatchEvent(new Event('webkitendfullscreen'));
    } else {
      doc.fullscreenElement = null;
      doc.dispatchEvent(new Event('fullscreenchange'));
    }
  }
  if (native) {
    video.webkitEnterFullscreen = start;
    video.webkitExitFullscreen = stop;
  } else {
    video.requestFullscreen = async () => start();
    doc.exitFullscreen = async () => stop();
  }
  return { doc, video, start, stop, exits: () => exits };
}

for (const native of [false, true]) {
  const name = native ? 'iOS native' : 'standard';
  test(`${name}: rejects unrequested fullscreen and allows the settings action`, async () => {
    const f = fixture(native);
    const controller = createVideoFullscreen(f.video, f.doc);
    f.start();
    assert.equal(f.exits(), 1);
    assert.equal(await controller.enter(), true);
    assert.equal(f.exits(), 1);
    f.stop();
    f.start();
    assert.equal(f.exits(), 3, 'leaving fullscreen clears the authorization');
    controller.dispose();
    f.start();
    assert.equal(f.exits(), 3, 'listeners are removed');
    assert.equal(await controller.enter(), false);
  });
  test(`${name}: replacing the video exits its fullscreen`, async () => {
    const f = fixture(native);
    const controller = createVideoFullscreen(f.video, f.doc);
    await controller.enter();
    controller.dispose();
    assert.equal(f.exits(), 1);
  });
}

test('unsupported browsers do not request fullscreen', async () => {
  const controller = createVideoFullscreen(new EventTarget(), new EventTarget());
  assert.equal(controller.supported, false);
  assert.equal(await controller.enter(), false);
  controller.dispose();
});

test('a failed request clears authorization', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const f = fixture();
  f.video.requestFullscreen = async () => { throw new Error('Denied'); };
  const controller = createVideoFullscreen(f.video, f.doc);
  assert.equal(await controller.enter(), false);
  f.start();
  assert.equal(f.exits(), 1);
  controller.dispose();
});
