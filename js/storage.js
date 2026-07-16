// Persistence: localStorage autosave + manual JSON export/import for cross-device sync.

const STORAGE_KEY = "finance-app-state-v1";
const SCHEMA_VERSION = 1;

export function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultState() {
  return {
    version: SCHEMA_VERSION,
    currencies: ["BYN", "USD", "EUR", "RUB"],
    expenseCategories: [],
    deposits: [],
    savingsGoals: [],
    salary: [],
    expenses: [],
  };
}

function migrate(state) {
  const base = defaultState();
  return {
    ...base,
    ...state,
    version: SCHEMA_VERSION,
    currencies: state.currencies?.length ? state.currencies : base.currencies,
  };
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (err) {
    console.error("Не удалось прочитать сохранённые данные, использую пустое состояние.", err);
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function exportStateToFile(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  a.href = url;
  a.download = `finance-data-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importStateFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (typeof parsed !== "object" || parsed === null) {
          throw new Error("Файл не содержит объект JSON.");
        }
        resolve(migrate(parsed));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}
