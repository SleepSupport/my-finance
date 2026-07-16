// Small shared DOM/formatting helpers used across all views.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null) {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

const MONEY_FORMATTERS = new Map();
export function formatMoney(amount, currency) {
  if (!MONEY_FORMATTERS.has(currency)) {
    MONEY_FORMATTERS.set(
      currency,
      new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 2 })
    );
  }
  try {
    return MONEY_FORMATTERS.get(currency).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDate(value) {
  return new Date(value).toLocaleDateString("ru-RU");
}

export function formatMonthAxis(timestamp) {
  return new Date(timestamp).toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

export function currencySelect(currencies, selected) {
  return el(
    "select",
    { class: "input", name: "currency" },
    currencies.map((c) => el("option", { value: c, selected: c === selected ? "selected" : undefined }, c))
  );
}

let toastTimer = null;
export function showToast(message, tone = "info") {
  let node = document.getElementById("toast");
  if (!node) {
    node = el("div", { id: "toast", class: "toast" });
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.className = `toast toast--${tone} is-visible`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("is-visible"), 2600);
}

export function confirmDialog(message) {
  return window.confirm(message);
}
