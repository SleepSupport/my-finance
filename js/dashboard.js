// Helpers for the Overview dashboard: category icons, a unified recent-
// activity feed across all 4 sections, and simple month-over-month deltas.

const CATEGORY_ICON_RULES = [
  { keywords: ["еда", "продукт", "кафе", "ресторан", "food"], icon: "🍽️" },
  { keywords: ["транспорт", "такси", "бензин", "авто", "метро"], icon: "🚗" },
  { keywords: ["жиль", "квартир", "аренда", "коммунал"], icon: "🏠" },
  { keywords: ["развлеч", "кино", "игр", "хобби"], icon: "🎮" },
  { keywords: ["здоров", "аптека", "врач", "медицин"], icon: "💊" },
  { keywords: ["одежд", "обув", "шоппинг", "shopping"], icon: "👕" },
  { keywords: ["связь", "интернет", "телефон", "мобильн"], icon: "📱" },
  { keywords: ["образован", "курс", "книг", "школ"], icon: "📚" },
  { keywords: ["путешеств", "отпуск", "поездк", "билет"], icon: "✈️" },
  { keywords: ["подар", "gift"], icon: "🎁" },
  { keywords: ["спорт", "фитнес", "зал"], icon: "🏋️" },
  { keywords: ["кофе", "пит"], icon: "☕" },
];
const FALLBACK_CATEGORY_ICONS = ["🏷️", "🧩", "📦", "🔖", "🗂️"];

export function categoryIcon(category) {
  if (!category) return "🏷️";
  const lower = category.toLowerCase();
  for (const rule of CATEGORY_ICON_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.icon;
  }
  let hash = 0;
  for (let i = 0; i < lower.length; i++) hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
  return FALLBACK_CATEGORY_ICONS[hash % FALLBACK_CATEGORY_ICONS.length];
}

export const TYPE_ICON = { deposit: "🏦", saving: "🐷", salary: "💰", expense: "🧾" };
export const TYPE_LABEL = { deposit: "Вклад", saving: "Накопление", salary: "Зарплата", expense: "Трата" };

/** Unified, newest-first feed of everything that happened in `currency`. */
export function buildRecentActivity(state, currency, limit = 8) {
  const items = [];
  for (const d of state.deposits) {
    if (d.currency !== currency) continue;
    items.push({
      id: `dep-${d.id}`,
      date: d.startDate,
      type: "deposit",
      icon: TYPE_ICON.deposit,
      title: `Вклад: ${d.bank}`,
      subtitle: d.product || "",
      amount: d.principal,
      currency: d.currency,
      direction: "in",
    });
  }
  for (const g of state.savingsGoals) {
    if (g.currency !== currency) continue;
    for (const e of g.entries || []) {
      items.push({
        id: `sav-${e.id}`,
        date: e.date,
        type: "saving",
        icon: TYPE_ICON.saving,
        title: `Накопление: ${g.name}`,
        subtitle: e.note || "",
        amount: e.amount,
        currency: g.currency,
        direction: e.amount >= 0 ? "in" : "out",
      });
    }
  }
  for (const s of state.salary) {
    if (s.currency !== currency) continue;
    items.push({
      id: `sal-${s.id}`,
      date: s.date,
      type: "salary",
      icon: TYPE_ICON.salary,
      title: s.source || "Доход",
      subtitle: s.note || "",
      amount: s.amount,
      currency: s.currency,
      direction: "in",
    });
  }
  for (const e of state.expenses) {
    if (e.currency !== currency) continue;
    items.push({
      id: `exp-${e.id}`,
      date: e.date,
      type: "expense",
      icon: categoryIcon(e.category),
      title: e.category || "Трата",
      subtitle: e.note || "",
      amount: e.amount,
      currency: e.currency,
      direction: "out",
    });
  }
  return items.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

/** Sums `amount` for entries in the current vs previous calendar month. */
export function monthOverMonth(entries, currency) {
  const now = new Date();
  const curKey = monthKey(now);
  const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  let current = 0;
  let previous = 0;
  for (const e of entries) {
    if (e.currency !== currency) continue;
    const key = monthKey(e.date);
    if (key === curKey) current += e.amount;
    else if (key === prevKey) previous += e.amount;
  }
  const deltaPct = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : current !== 0 ? 100 : 0;
  return { current, previous, deltaPct };
}
