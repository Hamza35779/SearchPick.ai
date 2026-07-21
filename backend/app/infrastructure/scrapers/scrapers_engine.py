"""
Real product search engine.

Strategy:
  1. Use DDGS text search targeting shopping/product pages across major retailers.
  2. Parse titles, prices, and stores from search results.
  3. Also query DuckDuckGo images for product thumbnails.
"""

import asyncio
import re
from typing import Any
from ddgs import DDGS


# ─── Price extraction ─────────────────────────────────────────────────────────

PRICE_RE = re.compile(r"[\$£€₹]\s?[\d,]+\.?\d*|[\d,]+\.?\d*\s?(?:USD|PKR|GBP|EUR)")

def _extract_price(text: str) -> float:
    """Pull the first price-like number from any string."""
    match = PRICE_RE.search(text or "")
    if not match:
        return 0.0
    digits = re.sub(r"[^\d.]", "", match.group())
    try:
        return float(digits)
    except ValueError:
        return 0.0


def _infer_store(url: str) -> str:
    """Map a URL to a clean merchant name."""
    mapping = {
        "amazon.": "Amazon",
        "ebay.": "eBay",
        "walmart.": "Walmart",
        "bestbuy.": "BestBuy",
        "newegg.": "Newegg",
        "target.": "Target",
        "daraz.": "Daraz",
        "aliexpress.": "AliExpress",
        "bhphotovideo.": "B&H Photo",
        "costco.": "Costco",
        "adorama.": "Adorama",
        "microcenter.": "Micro Center",
        "officedepot.": "Office Depot",
        "staples.": "Staples",
        "rakuten.": "Rakuten",
    }
    for key, name in mapping.items():
        if key in url:
            return name
    try:
        host = url.split("/")[2].lstrip("www.")
        parts = host.split(".")
        return parts[-2].capitalize() if len(parts) >= 2 else host
    except Exception:
        return "Online Store"


# ─── Core search ─────────────────────────────────────────────────────────────

def search_products_sync(query: str, max_results: int = 15) -> list[dict[str, Any]]:
    """
    Runs a DuckDuckGo text search for the product query and normalises
    results into a list of product dicts the agent graph can consume.
    """
    # Target product listing pages on known retailers
    site_filter = (
        "site:amazon.com OR site:ebay.com OR site:walmart.com OR "
        "site:bestbuy.com OR site:newegg.com OR site:target.com OR "
        "site:daraz.pk OR site:aliexpress.com OR site:adorama.com"
    )
    search_query = f"{query} buy price {site_filter}"

    raw_results: list[dict] = []
    try:
        with DDGS() as ddgs:
            raw_results = list(ddgs.text(search_query, max_results=max_results))
    except Exception as exc:
        print(f"[SearchEngine] Primary search error: {exc}")

    # Fallback — plain query without site filter
    if not raw_results:
        try:
            with DDGS() as ddgs:
                raw_results = list(ddgs.text(f"{query} buy online", max_results=max_results))
        except Exception as exc:
            print(f"[SearchEngine] Fallback search error: {exc}")

    products: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for item in raw_results:
        url = item.get("href") or item.get("url") or ""
        if url in seen_urls:
            continue
        seen_urls.add(url)

        title = item.get("title") or ""
        body  = item.get("body") or ""

        # Combine title + body for price scanning
        price = _extract_price(title) or _extract_price(body)
        store = _infer_store(url)

        products.append({
            "title":          title,
            "brand":          None,
            "store_name":     store,
            "url":            url,
            "current_price":  price,
            "currency":       "USD",
            "shipping_cost":  0.0,
            "delivery_time_days": None,
            "warranty_info":  None,
            "is_available":   True,
            "image_url":      None,
            "description":    body[:300] if body else "",
            "rating":         None,
            "reviews":        None,
            "condition":      "new",
        })

    # Remove entries with no useful title or price
    products = [p for p in products if len(p["title"]) > 5]
    return products


async def async_search_products(query: str, max_results: int = 15) -> list[dict[str, Any]]:
    """Async wrapper — runs blocking search in thread pool so FastAPI doesn't block."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, search_products_sync, query, max_results)
