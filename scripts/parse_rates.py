"""
Parses deposit interest rates for Belarusian banks from the myfin.by aggregator
(one well-structured source covering all major banks, instead of scraping each
bank's own site separately) and writes them to ../data/bank-rates.json.

Usage:
    pip install -r requirements.txt
    python parse_rates.py

Re-run whenever you want fresh rates; the finance app reads data/bank-rates.json
directly and never fetches the network itself.
"""
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}

SOURCES = {
    "BYN": "https://myfin.by/vklady",
    "USD": "https://myfin.by/vklady/v-dollarah",
    "EUR": "https://myfin.by/vklady/v-evro",
}

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "bank-rates.json"

TERM_UNIT_DAYS = {"дн": 1, "мес": 30, "год": 365, "лет": 365}


def parse_term_to_months(text):
    """'38 мес.' -> 38, '45 дн.' -> 1 (rounded), '2 года' -> 24."""
    m = re.search(r"(\d+)\s*([а-я]+)", text or "", re.IGNORECASE)
    if not m:
        return None
    value, unit = int(m.group(1)), m.group(2).lower()
    for prefix, days in TERM_UNIT_DAYS.items():
        if unit.startswith(prefix):
            months = round(value * days / 30)
            return max(months, 1)
    return None


def parse_percent(text):
    m = re.search(r"(\d+(?:[.,]\d+)?)", text or "")
    if not m:
        return None
    return float(m.group(1).replace(",", "."))


def first_own_text(tag):
    """Text of a tag's direct NavigableString children only (skips nested tags
    like tooltips or 'rate after N days' footnotes that sit inside the same div)."""
    if tag is None:
        return ""
    parts = [c for c in tag.find_all(string=True, recursive=False)]
    return " ".join(p.strip() for p in parts if p.strip())


def parse_bank_name(card):
    div = card.select_one(".products__product-bank-name")
    if div is None:
        return ""
    text = first_own_text(div)
    if text:
        return text
    # fallback: full text minus the rating number
    rating = div.select_one(".products__product-rating")
    full = div.get_text(" ", strip=True)
    if rating:
        full = full.replace(rating.get_text(strip=True), "", 1).strip()
    return full


def parse_card(card, currency):
    link_holder = card.select_one("[data-product-link]")
    link = link_holder["data-product-link"] if link_holder else ""
    bank_slug_m = re.search(r"/bank/([a-z0-9\-]+)/", link)
    bank_slug = bank_slug_m.group(1) if bank_slug_m else None

    name_el = card.select_one(".products__product-product-name a")
    product_name = name_el.get_text(strip=True) if name_el else ""

    bank_name = parse_bank_name(card)

    rate = term_months = yield_total = None
    for data_div in card.select("[class*='products__product-data']"):
        subtitle_el = data_div.select_one(".products__product-subtitle")
        accent_el = data_div.select_one(".products__product-accent")
        if not subtitle_el or not accent_el:
            continue
        subtitle = subtitle_el.get_text(strip=True).lower()
        accent_text = first_own_text(accent_el) or accent_el.get_text(strip=True)
        if "став" in subtitle:
            rate = parse_percent(accent_text)
        elif "срок" in subtitle:
            term_months = parse_term_to_months(accent_text)
        elif "доход" in subtitle:
            yield_total = parse_percent(accent_text)

    tags = [t.get_text(strip=True) for t in card.select(".products__product-tag")]

    if not bank_name or rate is None:
        return None

    return {
        "bank": bank_name,
        "bankSlug": bank_slug,
        "product": product_name,
        "currency": currency,
        "rate": rate,
        "termMonths": term_months,
        "yieldTotal": yield_total,
        "capitalization": any("капитал" in t.lower() for t in tags),
        "tags": tags,
        "url": f"https://myfin.by{link}" if link.startswith("/") else link,
    }


def fetch_currency(currency, url):
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "lxml")
    cards = soup.select(".products__product")
    offers = []
    for card in cards:
        offer = parse_card(card, currency)
        if offer:
            offers.append(offer)
    return offers


def main():
    all_offers = []
    for currency, url in SOURCES.items():
        try:
            offers = fetch_currency(currency, url)
            print(f"{currency}: {len(offers)} offers from {url}")
            all_offers.extend(offers)
        except requests.RequestException as exc:
            print(f"WARNING: failed to fetch {currency} ({url}): {exc}", file=sys.stderr)

    if not all_offers:
        print("No offers parsed - aborting write so the old file isn't clobbered.", file=sys.stderr)
        sys.exit(1)

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "myfin.by",
        "count": len(all_offers),
        "offers": all_offers,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(all_offers)} offers to {OUT_PATH}")


if __name__ == "__main__":
    main()
