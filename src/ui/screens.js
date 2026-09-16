export function createScreenController({ $, getSession }) {
  const get = () => document.body.dataset.screen;
  const set = (name) => {
    const session = getSession();
    document.body.dataset.screen = name;
    $("headerStatus").lastChild.textContent =
      name === "home" ? " SẢNH CHỜ" : name === "room" ? ` PHÒNG ${session.id}` : ` ĐANG ĐẤU · PHÒNG ${session.id}`;
    $("turnHint").textContent = name === "home" ? "Sảnh chờ" : name === "room" ? "Chuẩn bị" : "Vào trận";
  };
  return { get, set };
}
