import { loadState, saveState, exportStateToFile, importStateFromFile } from "./storage.js";
import { el, showToast } from "./ui.js";
import { mountQuickAdd } from "./quick-add.js";
import { renderDeposits } from "./views/deposits.js";
import { renderSavings } from "./views/savings.js";
import { renderSalary } from "./views/salary.js";
import { renderExpenses } from "./views/expenses.js";
import { renderOverview } from "./views/overview.js";

const state = loadState();
let bankRates = null;
let rateHistory = null;
let activeTab = "overview";
let activeCharts = [];

const TABS = [
  { id: "overview", label: "Главная", render: renderOverview },
  { id: "deposits", label: "Вклады", render: renderDeposits },
  { id: "savings", label: "Накопления", render: renderSavings },
  { id: "salary", label: "Зарплата", render: renderSalary },
  { id: "expenses", label: "Траты", render: renderExpenses },
];

function persist() {
  saveState(state);
}

function render() {
  const nav = document.getElementById("tab-nav");
  nav.innerHTML = "";
  for (const tab of TABS) {
    nav.appendChild(
      el(
        "button",
        {
          type: "button",
          class: "tab" + (tab.id === activeTab ? " is-active" : ""),
          onClick: () => {
            activeTab = tab.id;
            render();
          },
        },
        tab.label
      )
    );
  }

  for (const chart of activeCharts) chart.destroy();
  activeCharts = [];

  const view = document.getElementById("view");
  view.innerHTML = "";

  const ctx = {
    state,
    persist,
    rerender: render,
    registerChart: (chart) => activeCharts.push(chart),
    currencies: state.currencies,
    bankRates,
    rateHistory,
  };

  const current = TABS.find((t) => t.id === activeTab);
  current.render(view, ctx);
}

function wireHeaderActions() {
  document.getElementById("export-btn").addEventListener("click", () => {
    exportStateToFile(state);
    showToast("Файл сохранён");
  });

  const importInput = document.getElementById("import-input");
  document.getElementById("import-btn").addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const imported = await importStateFromFile(file);
      const replace = window.confirm(
        "Импортировать данные? Нажмите «OK», чтобы заменить текущие данные, «Отмена» — чтобы объединить с текущими."
      );
      if (replace) {
        Object.assign(state, imported);
      } else {
        state.deposits.push(...imported.deposits);
        state.savingsGoals.push(...imported.savingsGoals);
        state.salary.push(...imported.salary);
        state.expenses.push(...imported.expenses);
        for (const c of imported.expenseCategories) {
          if (!state.expenseCategories.includes(c)) state.expenseCategories.push(c);
        }
      }
      persist();
      showToast("Данные импортированы");
      render();
    } catch (err) {
      console.error(err);
      showToast("Не удалось прочитать файл: " + err.message, "error");
    } finally {
      importInput.value = "";
    }
  });
}

async function loadBankRates() {
  try {
    const res = await fetch("data/bank-rates.json", { cache: "no-store" });
    if (res.ok) bankRates = await res.json();
  } catch {
    bankRates = null;
  }
  try {
    const res = await fetch("data/bank-rates-history.json", { cache: "no-store" });
    if (res.ok) rateHistory = await res.json();
  } catch {
    rateHistory = null;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // file:// and plain http (non-localhost) can't register a SW - fails silently, app still works.
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker not registered:", err));
}

async function init() {
  wireHeaderActions();
  registerServiceWorker();
  mountQuickAdd({ state, persist, currencies: state.currencies, onSaved: render });
  await loadBankRates();
  render();
}

init();
