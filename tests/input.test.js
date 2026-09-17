// Regression test for the visibilitychange/blur crash: bindBattleInput must
// never throw from its window/document listeners, even if `getActive` hands
// back a falsy-but-not-nullish value (as `screen() === "game" && match()`
// used to, outside the battle screen) instead of a proper match or null/undefined.
import test from "node:test";
import assert from "node:assert/strict";
import { bindBattleInput } from "../src/ui/input.js";

function fakeDom() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        listeners: {},
        dataset: {},
        style: {},
        open: false,
        addEventListener(type, fn) {
          (this.listeners[type] ||= []).push(fn);
        },
        setPointerCapture() {},
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
      });
    }
    return elements.get(id);
  };
  const windowListeners = {};
  const documentListeners = {};
  const fakeWindow = {
    addEventListener(type, fn) {
      (windowListeners[type] ||= []).push(fn);
    },
  };
  const fakeDocument = {
    hidden: false,
    addEventListener(type, fn) {
      (documentListeners[type] ||= []).push(fn);
    },
    querySelectorAll: () => [],
  };
  return { $: element, element, windowListeners, documentListeners, fakeWindow, fakeDocument };
}

test("battle input listeners never throw when there is no active match, however getActive reports it", () => {
  const { $, element, windowListeners, documentListeners, fakeWindow, fakeDocument } = fakeDom();
  const realWindow = globalThis.window,
    realDocument = globalThis.document;
  globalThis.window = fakeWindow;
  globalThis.document = fakeDocument;
  try {
    let paused = false;
    for (const inactiveValue of [null, undefined, false]) {
      bindBattleInput({
        $,
        getActive: () => inactiveValue,
        getPaused: () => paused,
        setPaused: (value) => (paused = value),
      });
    }
    assert.doesNotThrow(() => windowListeners.blur.forEach((fn) => fn()));
    assert.doesNotThrow(() => windowListeners.orientationchange.forEach((fn) => fn()));
    assert.doesNotThrow(() =>
      windowListeners.keyup.forEach((fn) => fn({ key: "ArrowLeft", code: "ArrowLeft" })),
    );
    assert.doesNotThrow(() =>
      windowListeners.keyup.forEach((fn) => fn({ key: " ", code: "Space", preventDefault() {} })),
    );
    assert.doesNotThrow(() => documentListeners.visibilitychange.forEach((fn) => fn()));
    assert.doesNotThrow(() => (element("help").onclick ?? (() => {}))());
  } finally {
    globalThis.window = realWindow;
    globalThis.document = realDocument;
  }
});
