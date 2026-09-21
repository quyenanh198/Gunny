import { PET_SPECIES } from "../core/pet.js";
import { ENHANCE_CONFIG, WeaponForge, ELEMENTAL_GEMS } from "../core/forge.js";
import { MERCENARY_CATALOG, OUTPOST_CATALOG, PersonalFortress } from "../core/fortress.js";
import { DUNGEON_TEMPLATES } from "../core/dungeon.js";
import { apiUrl } from "../base-url.js";
import { ensureIdentity } from "../session-identity.js";

const DEFAULT_PROFILE = {
  wallet: { gold: 800, stones: 10, gems: ["ruby", "topaz"], eggs: ["common_egg"] },
  activePetId: null,
  pets: [],
  weapons: {
    carrot: { level: 3, pityLuck: 0, sockets: [null, null, null] },
    acorn: { level: 0, pityLuck: 0, sockets: [null, null, null] },
    honey: { level: 0, pityLuck: 0, sockets: [null, null, null] },
    bubble: { level: 0, pityLuck: 0, sockets: [null, null, null] },
    fish: { level: 0, pityLuck: 0, sockets: [null, null, null] },
    star: { level: 0, pityLuck: 0, sockets: [null, null, null] },
    "void-prism": { level: 0, pityLuck: 0, sockets: [null, null, null] },
  },
  fortress: {
    level: 1,
    hp: 1000,
    maxHp: 1000,
    mercenaries: [],
    lastYieldClaim: Date.now(),
  },
};

export class MmoHubController {
  constructor({ $, audio = null, onStartDungeon = null } = {}) {
    this.$ = $;
    this.audio = audio;
    this.onStartDungeon = onStartDungeon;
    this.profile = null;
    this.currentTab = "pets";
    this.selectedWeapon = "carrot";
    this.initProfile();
  }

  // Load from local storage or server
  async initProfile() {
    try {
      // Không có phiên thì mọi thao tác MMO đều 401 và tiến trình chỉ nằm trong
      // localStorage của đúng máy đó — dựng phiên trước khi hỏi hồ sơ.
      await ensureIdentity().catch(() => {});
      const res = await fetch(apiUrl("api/mmo/profile"), { credentials: "same-origin" });
      if (res.ok) {
        this.profile = await res.json();
        return;
      }
    } catch {}

    // Fallback to local persistence
    try {
      const saved = localStorage.getItem("gunny-mmo-profile");
      if (saved) {
        this.profile = JSON.parse(saved);
        return;
      }
    } catch {}

    this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    this.saveLocal();
  }

  saveLocal() {
    if (this.profile) {
      try {
        localStorage.setItem("gunny-mmo-profile", JSON.stringify(this.profile));
      } catch {}
    }
  }

  // Open the MMO Hub Modal
  async open() {
    await this.initProfile();
    const dialog = this.$("mmoHubDialog");
    if (!dialog) return;
    this.render();
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "true");
    }
  }

  close() {
    const dialog = this.$("mmoHubDialog");
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    // Câu báo của thao tác trước không còn liên quan ở tab mới.
    this.feedback = null;
    this.render();
  }

  // Render modal content based on current tab
  render() {
    const dialog = this.$("mmoHubDialog");
    if (!dialog || !this.profile) return;

    // Currency bar
    const gold = this.profile.wallet.gold || 0;
    const stones = this.profile.wallet.stones || 0;
    const eggs = this.profile.wallet.eggs?.length || 0;

    let contentHtml = `
      <div class="mmo-hub-header">
        <div class="mmo-title-bar">
          <h2>⚔️ KHU VỰC MMO-LITE</h2>
          <button type="button" id="closeMmoHub" class="subtle mmo-close-btn">&times;</button>
        </div>
        <div class="mmo-currency-bar">
          <span>💰 <b>${gold.toLocaleString()}</b> Vàng</span>
          <span>💎 <b>${stones}</b> Đá Rèn</span>
          <span>🥚 <b>${eggs}</b> Trứng</span>
        </div>
        <nav class="mmo-tabs">
          <button type="button" class="mmo-tab-btn ${this.currentTab === "pets" ? "active" : ""}" data-tab="pets">🐾 Thú Cưng</button>
          <button type="button" class="mmo-tab-btn ${this.currentTab === "forge" ? "active" : ""}" data-tab="forge">🔨 Tiệm Rèn (+12)</button>
          <button type="button" class="mmo-tab-btn ${this.currentTab === "fortress" ? "active" : ""}" data-tab="fortress">🏰 Pháo Đài</button>
          <button type="button" class="mmo-tab-btn ${this.currentTab === "dungeon" ? "active" : ""}" data-tab="dungeon">🗺️ Phó Bản PvE</button>
        </nav>
      </div>
      <div class="mmo-tab-content">
    `;

    if (this.currentTab === "pets") contentHtml += this.renderPetsTab();
    else if (this.currentTab === "forge") contentHtml += this.renderForgeTab();
    else if (this.currentTab === "fortress") contentHtml += this.renderFortressTab();
    else if (this.currentTab === "dungeon") contentHtml += this.renderDungeonTab();

    contentHtml += `</div><div id="mmoFeedback" class="mmo-feedback"></div>`;
    dialog.innerHTML = contentHtml;
    // Mọi thao tác đều gọi render() ngay sau khi viết câu báo kết quả, mà render()
    // dựng lại cả dialog — viết xong là mất. Giữ câu báo ở đây rồi vẽ lại sau.
    const feedbackBox = this.$("mmoFeedback");
    if (feedbackBox && this.feedback) {
      feedbackBox.replaceChildren(Object.assign(document.createElement("span"), {
        className: `mmo-${this.feedback.kind}`,
        textContent: this.feedback.text,
      }));
    }

    this.bindEvents();
  }

  /** Câu báo kết quả sống qua lần render kế tiếp. kind: "ok" | "fail" | "info". */
  setFeedback(kind, text) {
    this.feedback = { kind, text };
  }

  // --- TAB 1: PETS ---
  renderPetsTab() {
    const activePet = this.profile.pets?.find((p) => p.id === this.profile.activePetId);
    let html = `<div class="mmo-pets-view">`;

    if (activePet) {
      html += `
        <div class="mmo-card active-pet-card">
          <div class="pet-header">
            <span class="pet-badge">ĐỒNG HÀNH XUẤT TRẬN</span>
            <h3>${activePet.name} <small>(${activePet.speciesName} - Cấp ${activePet.level})</small></h3>
          </div>
          <p class="pet-stat">⭐ <b>Kinh nghiệm:</b> ${activePet.exp} / ${activePet.level * 100} XP</p>
          <p class="pet-passive">✨ <b>Hào quang nội tại:</b> ${activePet.passiveDesc}</p>
          <p class="pet-ultimate">💥 <b>Tuyệt kỹ tích nộ:</b> ${activePet.ultimateDesc}</p>
        </div>
      `;
    } else {
      html += `
        <div class="mmo-card empty-card">
          <p>Chưa trang bị Thú Cưng nào. Hãy ấp một quả trứng bên dưới để sở hữu linh thú đầu tiên!</p>
        </div>
      `;
    }

    // Hatching section
    const eggCount = this.profile.wallet.eggs?.length || 0;
    html += `
      <div class="mmo-card">
        <h3>ẤP TRỨNG LINH THÚ</h3>
        <p>Có 4 chủng loài: <b>Rồng Lửa</b> (Công), <b>Mầm Cây</b> (Máu), <b>Kiến Vàng</b> (Thủ), <b>Băng Linh</b> (Nhanh nhẹn).</p>
        <div class="row mmo-form-row">
          <input id="petCustomName" class="pet-name-input" placeholder="Đặt tên thú cưng (tùy chọn)" maxlength="16" />
          <button type="button" id="hatchEggBtn" class="primary">
            🥚 Ấp Trứng (${eggCount > 0 ? "Dùng 1 Trứng" : "400 Vàng"})
          </button>
        </div>
      </div>
    `;

    // Owned pets list
    if (this.profile.pets && this.profile.pets.length > 0) {
      html += `<h3>BỘ SƯU TẬP THÚ CƯNG (${this.profile.pets.length})</h3><div class="pet-grid">`;
      for (const pet of this.profile.pets) {
        const isEquipped = pet.id === this.profile.activePetId;
        html += `
          <div class="pet-item ${isEquipped ? "equipped" : ""}">
            <strong>${pet.name}</strong>
            <small>${pet.speciesName} · Lv.${pet.level}</small>
            ${isEquipped ? "<span>(Đang dùng)</span>" : `<button type="button" class="subtle equip-pet-btn" data-pet="${pet.id}">Chọn</button>`}
          </div>
        `;
      }
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  // --- TAB 2: SAFE FORGE ---
  renderForgeTab() {
    const weapons = this.profile.weapons || {};
    const currentWeapon = weapons[this.selectedWeapon] || { level: 0, pityLuck: 0, sockets: [null, null, null] };
    const level = currentWeapon.level || 0;
    const isMax = level >= 12;
    const nextConfig = isMax ? null : ENHANCE_CONFIG[level + 1];
    const floor = WeaponForge.getMilestoneFloor(level);
    const aura = WeaponForge.getAura(level);
    const pity = currentWeapon.pityLuck || 0;
    const totalRate = nextConfig ? Math.min(100, Math.round((nextConfig.baseRate + pity) * 100)) : 100;

    let auraName = "Chưa có hào quang";
    if (aura === "flame") auraName = "🔥 Lửa Vàng (+7)";
    else if (aura === "thunder") auraName = "⚡ Sấm Sét Tím (+10)";
    else if (aura === "cosmic") auraName = "🌌 Vòng Sáng Vũ Trụ (+12)";

    let html = `
      <div class="mmo-forge-view">
        <div class="weapon-selector row">
          <label>CHỌN VŨ KHÍ: </label>
          <select id="forgeWeaponSelect">
            ${Object.keys(weapons).map((wId) => `<option value="${wId}" ${wId === this.selectedWeapon ? "selected" : ""}>${wId.toUpperCase()} (+${weapons[wId].level || 0})</option>`).join("")}
          </select>
        </div>
        <div class="mmo-card forge-card">
          <div class="forge-header">
            <h3>VŨ KHÍ: +${level} ${isMax ? "★ TỐI ĐA" : ""}</h3>
            <span class="aura-badge">${auraName}</span>
          </div>
          <div class="forge-safety-banner">
            🛡️ <b>Mốc an toàn khóa vĩnh viễn: +${floor}</b> (Thất bại không bao giờ rớt dưới +${floor})
          </div>
          ${!isMax ? `
            <div class="forge-stats">
              <p>🎯 <b>Tỉ lệ thành công:</b> ${totalRate}% <small>(Cơ bản: ${Math.round(nextConfig.baseRate * 100)}% + May mắn tích lũy: +${Math.round(pity * 100)}%)</small></p>
              <p>💰 <b>Chi phí:</b> ${nextConfig.costGold} Vàng & ${nextConfig.costStones} Viên Đá Rèn</p>
            </div>
            <button type="button" id="enhanceWeaponBtn" class="primary enhance-action-btn">
              🔨 CƯỜNG HÓA LÊN +${level + 1}
            </button>
          ` : `
            <p class="max-badge">✨ VŨ KHÍ ĐÃ ĐẠT ĐỈNH CAO HOÀN MỸ +12! ✨</p>
          `}
        </div>

        <div class="mmo-card socket-card">
          <h3>KHẢM NGỌC NGUYÊN TỐ (3 Ô)</h3>
          <p>Tăng cường hiệu ứng đòn đánh: <b>Ruby</b> (Đốt đất DoT), <b>Topaz</b> (Sét lan), <b>Emerald</b> (Xuyên gió).</p>
          <div class="socket-slots">
            ${[0, 1, 2].map((slotIdx) => {
              const gem = currentWeapon.sockets ? currentWeapon.sockets[slotIdx] : null;
              return `
                <div class="socket-slot">
                  <span>Ô ${slotIdx + 1}: <b>${gem ? gem.toUpperCase() : "Trống"}</b></span>
                  ${!gem && this.profile.wallet.gems?.length > 0 ? `
                    <select class="socket-gem-select" data-slot="${slotIdx}">
                      <option value="">-- Chọn ngọc khảm --</option>
                      ${this.profile.wallet.gems.map((g) => `<option value="${g}">${g.toUpperCase()}</option>`).join("")}
                    </select>
                  ` : ""}
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </div>
    `;
    return html;
  }

  // --- TAB 3: FORTRESS ---
  renderFortressTab() {
    const fort = this.profile.fortress || { level: 1, defenseHp: 600, garrison: [] };
    const level = fort.level || 1;
    const isMax = level >= 10;
    const nextCost = level * 500;
    const garrison = fort.garrison || fort.mercenaries || [];

    let html = `
      <div class="mmo-fortress-view">
        <div class="mmo-card fortress-card">
          <div class="fortress-header">
            <h3>🏰 THÀNH TRÌ CẤP ${level}</h3>
            <span>Máu: ${fort.defenseHp || level * 600} HP · Đồn trú: ${garrison.length}/${Math.min(6, 2 + Math.floor(level / 2))}</span>
          </div>
          <p>Mỗi giờ sản sinh <b>${level * 80} Vàng</b> và <b>${Math.floor(level / 2)} Đá Rèn</b>.</p>
          <button type="button" id="claimYieldBtn" class="primary">
            🌾 THU HOẠCH THUẾ ĐỊA PHẬN
          </button>
          ${!isMax ? `
            <button type="button" id="upgradeFortressBtn" class="subtle mmo-btn-inline">
              ⭐ Nâng cấp Thành Cấp ${level + 1} (${nextCost} Vàng)
            </button>
          ` : ""}
        </div>

        <div class="mmo-card mercenaries-card">
          <h3>ĐỘI QUÂN BOT ĐÁNH THUÊ ("Mỗi người là một bang chủ")</h3>
          <p>Chiêu mộ bot thiện chiến trấn giữ cứ điểm và phòng thủ khi bạn offline:</p>
          <div class="merc-grid">
            ${MERCENARY_CATALOG.map((merc) => {
              const count = garrison.filter((m) => (typeof m === "string" ? m : m.id) === merc.id).length;
              return `
                <div class="merc-item">
                  <strong>${merc.name}</strong>
                  <small>${merc.desc}</small>
                  <p>Đang có: <b>${count}</b> bot</p>
                  <button type="button" class="subtle recruit-merc-btn" data-merc="${merc.id}">
                    Thuê (${merc.costGold} Vàng)
                  </button>
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <div class="mmo-card siege-card">
          <h3>🗺️ BẢN ĐỒ THẾ GIỚI & CÔNG THÀNH CHIẾN (PvP / PvE Asymmetric)</h3>
          <p>Mang đội quân bot đi công phá các cứ điểm để đoạt quyền lãnh chúa và cướp thuế tài nguyên:</p>
          <div class="territory-list">
            <div class="territory-item">
              <div>
                <strong>🥇 Mỏ Vàng Hoàng Kim</strong>
                <small>Sản lượng: +120 Vàng/giờ · Phòng thủ: 2,000 HP</small>
              </div>
              <button type="button" class="primary raid-territory-btn" data-territory="territory_gold_mine">
                ⚔️ Công Thành
              </button>
            </div>
            <div class="territory-item">
              <div>
                <strong>💎 Hầm Đá Rèn Hắc Diệu</strong>
                <small>Sản lượng: +2 Đá Rèn/giờ · Phòng thủ: 3,000 HP</small>
              </div>
              <button type="button" class="primary raid-territory-btn" data-territory="territory_stone_forge">
                ⚔️ Công Thành
              </button>
            </div>
            <div class="territory-item">
              <div>
                <strong>🌌 Pháo Đài Không Gian</strong>
                <small>Sản lượng: +250 Vàng & +3 Đá Rèn/giờ · Phòng thủ: 5,000 HP</small>
              </div>
              <button type="button" class="primary raid-territory-btn" data-territory="territory_sky_citadel">
                ⚔️ Công Thành
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    return html;
  }

  // --- TAB 4: PVE DUNGEON ---
  renderDungeonTab() {
    const dConfig = DUNGEON_TEMPLATES.ANT_CAVERN;
    let html = `
      <div class="mmo-dungeon-view">
        <div class="mmo-card dungeon-card">
          <h3>🗺️ PHÓ BẢN: ĐẠI CHIẾN HOÀNG GIA</h3>
          <p>Chuỗi 3 ải liên hoàn thử thách kỹ năng bắn góc và sức gió:</p>
          <ol class="dungeon-stages">
            <li><b>Ải 1: Minion Wave</b> — Dọn dẹp bầy Gà Đột Biến đào bới công phá đảo.</li>
            <li><b>Ải 2: Hazard Arena</b> — Vượt hiểm địa bão gió xoáy và hố axit.</li>
            <li><b>Ải 3: Boss Raid</b> — Đại chiến Vua Gà Hoàng Gia đa điểm chạm (Weakpoint Lõi 2x sát thương).</li>
          </ol>
          <div class="dungeon-rewards">
            🎁 <b>Phần thưởng rương báu:</b> 1,500 Vàng, 5 Viên Đá Rèn, và Cơ hội nhận Trứng Pet Cổ Xưa!
          </div>
          <div class="row mmo-actions-row">
            <button type="button" id="startSoloDungeonBtn" class="primary">
              ⚔️ BẮT ĐẦU VƯỢT ẢI (SOLO)
            </button>
            <button type="button" id="startCoopDungeonBtn" class="subtle">
              👥 TỔ ĐỘI CO-OP (2–4 Người)
            </button>
          </div>
        </div>
      </div>
    `;
    return html;
  }

  // Bind interactive DOM events
  bindEvents() {
    if (typeof document === "undefined") return;
    const $ = this.$;

    // Close button
    const closeBtn = $("closeMmoHub");
    if (closeBtn) closeBtn.onclick = () => this.close();

    // Tab buttons
    const tabs = document.querySelectorAll(".mmo-tab-btn");
    tabs.forEach((tab) => {
      tab.onclick = () => this.switchTab(tab.dataset.tab);
    });

    // Weapon select in Forge
    const wSelect = $("forgeWeaponSelect");
    if (wSelect) {
      wSelect.onchange = (e) => {
        this.selectedWeapon = e.target.value;
        this.render();
      };
    }

    // Enhance action
    const enhanceBtn = $("enhanceWeaponBtn");
    if (enhanceBtn) {
      enhanceBtn.onclick = async () => {
        enhanceBtn.disabled = true;
        try {
          const res = await fetch(apiUrl("api/mmo/forge/enhance"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weaponId: this.selectedWeapon }),
          });
          const data = await res.json();
          if (data.success) {
            this.setFeedback("ok", `🎉 ${data.message}`);
            this.profile.weapons[this.selectedWeapon] = data.weapon;
            this.profile.wallet = data.wallet;
          } else {
            this.setFeedback("fail", `❌ ${data.reason || "Cường hóa thất bại!"}`);
          }
        } catch {
          // Offline fallback
          const w = this.profile.weapons[this.selectedWeapon];
          const result = WeaponForge.enhance(w, {
            gold: this.profile.wallet.gold,
            stones: this.profile.wallet.stones,
          });
          if (result.success || result.spentGold) {
            this.profile.wallet.gold -= result.spentGold;
            this.profile.wallet.stones -= result.spentStones;
          }
          this.setFeedback(result.success ? "ok" : "fail", result.success
            ? `🎉 ${result.message}`
            : `❌ ${result.reason || "Cường hóa thất bại!"}`);
        }
        this.saveLocal();
        this.render();
      };
    }

    // Hatch Egg action
    const hatchBtn = $("hatchEggBtn");
    if (hatchBtn) {
      hatchBtn.onclick = async () => {
        const customName = $("petCustomName")?.value?.trim() || null;
        hatchBtn.disabled = true;
        try {
          const res = await fetch(apiUrl("api/mmo/pets/hatch"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eggType: "common_egg", customName }),
          });
          const data = await res.json();
          if (data.success) {
            this.setFeedback("ok", `🐣 Ấp thành công ${data.pet.name}!`);
            this.profile.pets.push(data.pet);
            this.profile.activePetId = data.activePetId;
            this.profile.wallet = data.wallet;
          } else {
            this.setFeedback("fail", `❌ ${data.reason}`);
          }
        } catch {
          this.setFeedback("fail", "❌ Không gọi được máy chủ, chưa ấp được trứng.");
        }
        this.saveLocal();
        this.render();
      };
    }

    // Equip Pet action
    const equipBtns = document.querySelectorAll(".equip-pet-btn");
    equipBtns.forEach((btn) => {
      btn.onclick = async () => {
        const petId = btn.dataset.pet;
        try {
          await fetch(apiUrl("api/mmo/pets/equip"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ petId }),
          });
        } catch {}
        this.profile.activePetId = petId;
        this.saveLocal();
        this.render();
      };
    });

    // Claim Tax action
    const claimBtn = $("claimYieldBtn");
    if (claimBtn) {
      claimBtn.onclick = async () => {
        claimBtn.disabled = true;
        try {
          const res = await fetch(apiUrl("api/mmo/fortress/claim"), { method: "POST" });
          const data = await res.json();
          if (data.claimed) {
            this.setFeedback("ok", `🌾 Đã thu hoạch +${data.gold} Vàng và +${data.stones} Đá rèn!`);
            this.profile.wallet = data.wallet;
          } else {
            this.setFeedback("info", "⏳ Thuế đang tích lũy, vui lòng quay lại sau ít phút.");
          }
        } catch {
          this.setFeedback("info", "⏳ Không gọi được máy chủ, chưa thu hoạch được.");
        }
        this.saveLocal();
        this.render();
      };
    }

    // Upgrade Fortress action
    const upgradeFortBtn = $("upgradeFortressBtn");
    if (upgradeFortBtn) {
      upgradeFortBtn.onclick = async () => {
        try {
          const res = await fetch(apiUrl("api/mmo/fortress/upgrade"), { method: "POST" });
          const data = await res.json();
          if (data.success) {
            this.setFeedback("ok", `🏰 Pháo đài đã thăng cấp ${data.level}!`);
            this.profile.fortress = data.fortress;
            this.profile.wallet = data.wallet;
          } else {
            this.setFeedback("fail", `❌ ${data.reason}`);
          }
        } catch {}
        this.saveLocal();
        this.render();
      };
    }

    // Recruit Mercenary action
    const recruitBtns = document.querySelectorAll(".recruit-merc-btn");
    recruitBtns.forEach((btn) => {
      btn.onclick = async () => {
        const mercId = btn.dataset.merc;
        try {
          const res = await fetch(apiUrl("api/mmo/fortress/recruit"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mercenaryId: mercId }),
          });
          const data = await res.json();
          if (data.success) {
            this.setFeedback("ok", `🛡️ Đã chiêu mộ bot bảo vệ thành trì!`);
            this.profile.fortress = data.fortress;
            this.profile.wallet = data.wallet;
          } else {
            this.setFeedback("fail", `❌ ${data.reason}`);
          }
        } catch {}
        this.saveLocal();
        this.render();
      };
    });

    // Start Solo Dungeon action
    const soloBtn = $("startSoloDungeonBtn");
    if (soloBtn) {
      soloBtn.onclick = () => {
        this.close();
        if (this.onStartDungeon) this.onStartDungeon({ mode: "solo" });
      };
    }

    // Start Co-op Dungeon action
    const coopBtn = $("startCoopDungeonBtn");
    if (coopBtn) {
      coopBtn.onclick = () => {
        this.close();
        if (this.onStartDungeon) this.onStartDungeon({ mode: "coop" });
      };
    }

    // Raid Territory action
    const raidBtns = document.querySelectorAll(".raid-territory-btn");
    raidBtns.forEach((btn) => {
      btn.onclick = async () => {
        const territoryId = btn.dataset.territory;
        btn.disabled = true;
        try {
          const res = await fetch(apiUrl("api/siege/raid"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ territoryId, weaponLevel: this.profile.weapons?.carrot?.level || 0 }),
          });
          const data = await res.json();
          if (data.success && data.victory) {
            this.setFeedback("ok", `👑 THẮNG LỢI! Bạn đã chiếm được ${data.territoryName}, cướp được +${data.plunderedGold} Vàng & +${data.plunderedStones} Đá Rèn!`);
            if (data.wallet) this.profile.wallet = data.wallet;
          } else if (data.success && !data.victory) {
            this.setFeedback("fail", `⚔️ THẤT BẠI! Đội phòng thủ cứ điểm quá kiên cố sau ${data.rounds} hiệp.`);
          } else {
            this.setFeedback("fail", `❌ ${data.reason}`);
          }
        } catch {
          this.setFeedback("fail", "❌ Không gọi được máy chủ, chưa đánh được cứ điểm.");
        }
        this.saveLocal();
        this.render();
      };
    });
  }
}
