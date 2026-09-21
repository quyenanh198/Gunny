import test from "node:test";
import assert from "node:assert/strict";
import { MmoHubController } from "../src/ui/mmo-hub.js";

/** DOM giả đủ cho render(): dialog + ô báo kết quả. */
const setup = () => {
  const spans = [];
  globalThis.document = {
    createElement: () => ({ className: "", textContent: "" }),
    // bindEvents() chỉ chạy khi có document, nên stub phải đủ cho nó đi qua.
    querySelectorAll: () => [],
  };
  const feedbackBox = { children: [], replaceChildren(node) { this.children = [node]; spans.push(node); } };
  const dialog = { innerHTML: "", open: false, showModal() { this.open = true; }, close() { this.open = false; } };
  const elements = { mmoHubDialog: dialog, mmoFeedback: feedbackBox };
  const controller = new MmoHubController({ $: (id) => elements[id] });
  return { controller, feedbackBox, dialog, spans };
};

test("câu báo kết quả không bị lần render ngay sau đó xoá mất", async () => {
  const { controller, feedbackBox } = setup();
  await controller.open();

  // Đúng thứ tự mà mọi thao tác trong hub đang làm: viết câu báo rồi render lại.
  controller.setFeedback("ok", "🐣 Ấp thành công Mực!");
  controller.render();

  assert.equal(feedbackBox.children.length, 1);
  assert.equal(feedbackBox.children[0].textContent, "🐣 Ấp thành công Mực!");
  assert.equal(feedbackBox.children[0].className, "mmo-ok");
});

test("thất bại thì tô đỏ, thông báo trung tính thì không đỏ không xanh", async () => {
  const { controller, feedbackBox } = setup();
  await controller.open();

  controller.setFeedback("fail", "❌ Không đủ vàng.");
  controller.render();
  assert.equal(feedbackBox.children[0].className, "mmo-fail");

  controller.setFeedback("info", "⏳ Thuế đang tích lũy.");
  controller.render();
  assert.equal(feedbackBox.children[0].className, "mmo-info");
});

test("đổi tab thì bỏ câu báo của thao tác trước", async () => {
  const { controller, feedbackBox } = setup();
  await controller.open();
  controller.setFeedback("ok", "🎉 Cường hoá thành công!");
  controller.render();
  assert.equal(feedbackBox.children.length, 1);

  feedbackBox.children = [];
  controller.switchTab("forge");
  assert.equal(controller.feedback, null);
  assert.equal(feedbackBox.children.length, 0, "tab mới không đeo theo câu báo cũ");
});
