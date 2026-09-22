const STORAGE_KEY = "tasks-calendar-v1";

const DEFAULT_SETTINGS = {
  rotationStart: "2026-09-23", // 9/22 休、9/23-24 上班，做二休二循環
  workDays: 2,
  offDays: 2,
  creditCardDay: 15,
};

let state = loadState();
let viewYear, viewMonth; // viewMonth is 0-11

(function initView() {
  const today = new Date();
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
})();

function todayStr() {
  return formatDate(new Date());
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { settings: { ...DEFAULT_SETTINGS }, events: {} };
    const parsed = JSON.parse(raw);
    return {
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
      events: parsed.events || {},
    };
  } catch (e) {
    return { settings: { ...DEFAULT_SETTINGS }, events: {} };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("無法儲存到 localStorage", e);
  }
}

function isWorkday(dateStr) {
  const cycle = state.settings.workDays + state.settings.offDays;
  if (cycle <= 0) return false;
  const start = new Date(state.settings.rotationStart + "T00:00:00");
  const cur = new Date(dateStr + "T00:00:00");
  const diffDays = Math.floor((cur - start) / 86400000);
  const mod = ((diffDays % cycle) + cycle) % cycle;
  return mod < state.settings.workDays;
}

function isCreditCardDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDate() === Number(state.settings.creditCardDay);
}

function getEvent(dateStr) {
  return state.events[dateStr] || {};
}

function setEvent(dateStr, patch) {
  const cur = { ...getEvent(dateStr), ...patch };
  // 清掉空值，避免資料越存越肥
  Object.keys(cur).forEach((k) => {
    if (cur[k] === "" || cur[k] === false || cur[k] == null) delete cur[k];
  });
  if (Object.keys(cur).length === 0) {
    delete state.events[dateStr];
  } else {
    state.events[dateStr] = cur;
  }
  saveState();
}

const MONTH_NAMES = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];
const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

function render() {
  renderHeader();
  renderGrid();
  renderSettingsForm();
}

function renderHeader() {
  document.getElementById("monthLabel").textContent = `${viewYear} ${MONTH_NAMES[viewMonth]}`;
}

function renderGrid() {
  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  WEEKDAY_NAMES.forEach((w) => {
    const el = document.createElement("div");
    el.className = "weekday-label";
    el.textContent = w;
    grid.appendChild(el);
  });

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  for (let i = 0; i < startOffset; i++) {
    const filler = document.createElement("div");
    filler.className = "day-cell day-cell--empty";
    grid.appendChild(filler);
  }

  const today = todayStr();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(viewYear, viewMonth, day));
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day-cell";
    if (dateStr === today) cell.classList.add("day-cell--today");

    const holiday = TW_HOLIDAYS[dateStr];
    const work = isWorkday(dateStr);
    cell.classList.add(work ? "day-cell--work" : "day-cell--off");
    // 上班日以上班底色為主，假日只用點點標示，避免蓋掉「今天要上班」的資訊
    if (holiday && !work) cell.classList.add("day-cell--holiday");

    const ev = getEvent(dateStr);

    const num = document.createElement("div");
    num.className = "day-num";
    num.textContent = day;
    cell.appendChild(num);

    if (holiday) {
      const h = document.createElement("div");
      h.className = "day-holiday";
      h.textContent = holiday;
      cell.appendChild(h);
    }

    if (ev.majorEvent) {
      const e = document.createElement("div");
      e.className = "day-preview day-preview--event";
      e.textContent = ev.majorEvent;
      cell.appendChild(e);
    }
    if (ev.task) {
      const t = document.createElement("div");
      t.className = "day-preview day-preview--task";
      t.textContent = ev.task;
      cell.appendChild(t);
    }

    const dots = document.createElement("div");
    dots.className = "day-dots";
    if (holiday) dots.appendChild(makeDot("dot--holiday", `國定假日：${holiday}`));
    if (ev.overtime) dots.appendChild(makeDot("dot--overtime", "加班"));
    if (ev.majorEvent) dots.appendChild(makeDot("dot--event", `重大事件：${ev.majorEvent}`));
    if (ev.task) dots.appendChild(makeDot("dot--task", `任務：${ev.task}`));
    if (ev.dividend) dots.appendChild(makeDot("dot--dividend", `除權息：${ev.dividend}`));
    if (isCreditCardDay(dateStr)) dots.appendChild(makeDot("dot--card", "信用卡繳款"));
    cell.appendChild(dots);

    cell.addEventListener("click", () => openDayModal(dateStr));
    grid.appendChild(cell);
  }
}

function makeDot(cls, title) {
  const d = document.createElement("span");
  d.className = `dot ${cls}`;
  d.title = title;
  return d;
}

function openDayModal(dateStr) {
  const ev = getEvent(dateStr);
  const modal = document.getElementById("dayModal");
  const d = new Date(dateStr + "T00:00:00");
  const holiday = TW_HOLIDAYS[dateStr];

  document.getElementById("modalDateLabel").textContent =
    `${dateStr}（週${WEEKDAY_NAMES[d.getDay()]}）` + (holiday ? ` · ${holiday}` : "");
  document.getElementById("modalWorkStatus").textContent = isWorkday(dateStr) ? "班表：上班" : "班表：休假";

  document.getElementById("inputOvertime").checked = !!ev.overtime;
  document.getElementById("inputMajorEvent").value = ev.majorEvent || "";
  document.getElementById("inputTask").value = ev.task || "";
  document.getElementById("inputDividend").value = ev.dividend || "";
  document.getElementById("inputNote").value = ev.note || "";

  modal.dataset.date = dateStr;
  modal.classList.add("open");
}

function closeDayModal() {
  document.getElementById("dayModal").classList.remove("open");
}

function saveDayModal() {
  const modal = document.getElementById("dayModal");
  const dateStr = modal.dataset.date;
  setEvent(dateStr, {
    overtime: document.getElementById("inputOvertime").checked,
    majorEvent: document.getElementById("inputMajorEvent").value.trim(),
    task: document.getElementById("inputTask").value.trim(),
    dividend: document.getElementById("inputDividend").value.trim(),
    note: document.getElementById("inputNote").value.trim(),
  });
  closeDayModal();
  render();
}

function renderSettingsForm() {
  document.getElementById("settingRotationStart").value = state.settings.rotationStart;
  document.getElementById("settingWorkDays").value = state.settings.workDays;
  document.getElementById("settingOffDays").value = state.settings.offDays;
  document.getElementById("settingCreditCardDay").value = state.settings.creditCardDay;
}

function saveSettings() {
  state.settings.rotationStart = document.getElementById("settingRotationStart").value || todayStr();
  state.settings.workDays = Math.max(0, Number(document.getElementById("settingWorkDays").value) || 0);
  state.settings.offDays = Math.max(0, Number(document.getElementById("settingOffDays").value) || 0);
  state.settings.creditCardDay = Math.min(31, Math.max(1, Number(document.getElementById("settingCreditCardDay").value) || 1));
  saveState();
  closeSettingsModal();
  render();
}

function openSettingsModal() {
  document.getElementById("settingsModal").classList.add("open");
}
function closeSettingsModal() {
  document.getElementById("settingsModal").classList.remove("open");
}

function changeMonth(delta) {
  viewMonth += delta;
  if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
  if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
  render();
}

function goToday() {
  const t = new Date();
  viewYear = t.getFullYear();
  viewMonth = t.getMonth();
  render();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("prevMonthBtn").addEventListener("click", () => changeMonth(-1));
  document.getElementById("nextMonthBtn").addEventListener("click", () => changeMonth(1));
  document.getElementById("todayBtn").addEventListener("click", goToday);

  document.getElementById("settingsBtn").addEventListener("click", openSettingsModal);
  document.getElementById("settingsCancelBtn").addEventListener("click", closeSettingsModal);
  document.getElementById("settingsSaveBtn").addEventListener("click", saveSettings);

  document.getElementById("modalCancelBtn").addEventListener("click", closeDayModal);
  document.getElementById("modalSaveBtn").addEventListener("click", saveDayModal);

  render();
});
