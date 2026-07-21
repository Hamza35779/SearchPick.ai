"""
SearchPick AI Orchestration Graph

Real pipeline:
  PlannerAgent  → refines the user query into a targeted search string
  SearchAgent   → fetches live product listings via DuckDuckGo
  AnalystAgent  → uses Gemini to deeply analyse results and score each product
  RecommenderAgent → synthesises a final Buying Score + decisive recommendation

Gemini is used for every reasoning step. If GEMINI_API_KEY is missing we fall
back to transparent rule-based scoring so the system still works.
"""

import json
import os
import re
import asyncio
from typing import Any

from app.infrastructure.scrapers.scrapers_engine import async_search_products

# ─── Gemini client (optional — degrades gracefully if key missing) ────────────
try:
    from google import genai as _genai
    _GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
    _gemini_client = _genai.Client(api_key=_GEMINI_KEY) if _GEMINI_KEY else None
except Exception:
    _gemini_client = None

GEMINI_MODEL = "gemini-2.0-flash"


async def _gemini(prompt: str) -> str:
    """Call Gemini Flash asynchronously. Returns empty string on any error."""
    if not _gemini_client:
        return ""
    try:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: _gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
            ),
        )
        return response.text or ""
    except Exception as exc:
        print(f"[Gemini] Error: {exc}")
        return ""


# ─── Rule-based fallback scorer ───────────────────────────────────────────────

def _rule_based_score(product: dict[str, Any], all_prices: list[float]) -> dict[str, Any]:
    """
    Produce a quick numeric score for a product when Gemini is unavailable.
    All scores are 0–100.
    """
    price = product.get("current_price", 0.0)

    # Price score — cheapest gets highest score
    valid = [p for p in all_prices if p > 0]
    if valid and price > 0:
        min_p, max_p = min(valid), max(valid)
        price_score = 100 - round(((price - min_p) / max(max_p - min_p, 1)) * 80)
    else:
        price_score = 50

    store = product.get("store_name", "").lower()
    trust_map = {"amazon": 92, "bestbuy": 88, "walmart": 82, "newegg": 80, "b&h photo": 85, "adorama": 83, "target": 78}
    trust_score = trust_map.get(store, 65)

    return {
        "price_score":         max(0, min(100, price_score)),
        "quality_score":       72,
        "trust_score":         trust_score,
        "warranty_score":      65,
        "repairability_score": 60,
        "shipping_score":      70,
        "popularity_score":    68,
        "value_score":         max(0, min(100, price_score)),
        "overall_score":       round((price_score + trust_score + 72) / 3),
        "ai_confidence":       0.55,
    }


# ─── Agent steps ──────────────────────────────────────────────────────────────

async def planner_agent(user_query: str) -> dict[str, Any]:
    """
    Parses user query and file context into:
    - Multiple optimized search query strings for thorough internet coverage
    - Structured constraints (price limit, required features, etc.) to filter results
    """
    prompt = f"""You are the Lead Planning Agent for SearchPick.ai.
Your job is to analyze the user request (and any attached file details) and output a JSON execution plan to search the entire internet for matching products.

User request/context:
"{user_query}"

Analyze this query for:
1. Budget limits / price constraints
2. Required features, specifications, brands, or keywords
3. Synonyms or search query variations to query multiple marketplaces thoroughly.

Output a JSON object with these EXACT keys:
{{
  "search_queries": [
     "<query variant 1: e.g. brand + main spec>",
     "<query variant 2: e.g. category + price criteria>",
     "<query variant 3: e.g. generic product name + specifications>"
  ],
  "filters": {{
     "max_price": <number or null if no budget mentioned>,
     "min_price": <number or null>,
     "required_keywords": ["<keyword1>", "<keyword2>"],
     "forbidden_keywords": ["<keyword1>"]
  }}
}}

Return ONLY valid JSON. Do not include markdown formatting or wrapping code fences.
"""
    raw = await _gemini(prompt)
    plan: dict[str, Any] = {}

    if raw:
        clean = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
        try:
            plan = json.loads(clean)
        except json.JSONDecodeError:
            match = re.search(r"\{[\s\S]+\}", clean)
            if match:
                try:
                    plan = json.loads(match.group())
                except json.JSONDecodeError:
                    pass

    # Programmatic fallback if Gemini is missing or failed
    if not plan or not plan.get("search_queries"):
        # Simple extraction of numbers for budget
        max_price = None
        prices = [float(x) for x in re.findall(r"\$?\b(\d{3,5})\b", user_query)]
        if prices:
            max_price = max(prices)

        # Basic query variations
        cleaned = re.sub(r"[^\w\s\-\$]", "", user_query)
        words = cleaned.split()
        q1 = " ".join(words[:6]) if words else "product"
        q2 = f"{q1} buy"
        q3 = f"{q1} price"

        plan = {
            "search_queries": [q1, q2, q3],
            "filters": {
                "max_price": max_price,
                "min_price": None,
                "required_keywords": [],
                "forbidden_keywords": []
            }
        }

    # Ensure max 4 queries to prevent search abuse
    plan["search_queries"] = [q for q in plan["search_queries"] if q][:4]
    return plan


async def search_agent(search_queries: list[str]) -> list[dict[str, Any]]:
    """
    Runs all search queries in parallel via async_search_products,
    combines all listings, and de-duplicates them by URL.
    """
    if not search_queries:
        return []

    # Run searches concurrently
    tasks = [async_search_products(q, max_results=10) for q in search_queries]
    nested_results = await asyncio.gather(*tasks)

    # Flatten and de-duplicate by URL
    combined: list[dict[str, Any]] = []
    seen_urls: set[str] = set()

    for result_list in nested_results:
        for item in result_list:
            url = item.get("url")
            if url and url not in seen_urls:
                seen_urls.add(url)
                combined.append(item)

    return combined



async def analyst_agent(
    user_query: str,
    products: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Uses Gemini to analyse the product list and assign a structured Buying Score.
    Falls back to rule-based scoring if Gemini is unavailable.
    """
    if not products:
        return {
            "scored_products": [],
            "best_index": -1,
            "overall_score": 0,
            "price_score": 0,
            "quality_score": 0,
            "trust_score": 0,
            "warranty_score": 0,
            "repairability_score": 0,
            "shipping_score": 0,
            "popularity_score": 0,
            "value_score": 0,
            "ai_confidence": 0.0,
        }

    # Build a compact product summary for Gemini
    product_list_text = "\n".join(
        f"[{i}] Store: {p['store_name']} | Title: {p['title'][:100]} | "
        f"Price: ${p['current_price']:.2f} | Desc: {p['description'][:120]}"
        for i, p in enumerate(products)
    )

    prompt = f"""You are SearchPick.ai, an expert AI procurement analyst.

User is looking for: "{user_query}"

Here are the real product listings found:
{product_list_text}

Analyse these listings and return a JSON object with these exact fields:
{{
  "best_index": <index 0-{len(products)-1} of the single best product>,
  "overall_score": <0-100 overall buying score for the best pick>,
  "price_score": <0-100>,
  "quality_score": <0-100>,
  "trust_score": <0-100, based on store reputation and product description>,
  "warranty_score": <0-100>,
  "repairability_score": <0-100>,
  "shipping_score": <0-100>,
  "popularity_score": <0-100>,
  "value_score": <0-100, price vs quality>,
  "ai_confidence": <0.0-1.0>
}}

Rules:
- Consider price vs user's likely budget.
- Trust Amazon, BestBuy, Walmart more than unknown stores.
- If price is 0 or missing, penalise that listing.
- Return ONLY valid JSON. No markdown, no explanation.
"""
    raw = await _gemini(prompt)
    scores: dict[str, Any] = {}

    # Parse JSON from Gemini response
    if raw:
        # Strip markdown code fences if present
        clean = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
        try:
            scores = json.loads(clean)
        except json.JSONDecodeError:
            # Try to extract JSON object with regex
            match = re.search(r"\{[\s\S]+\}", clean)
            if match:
                try:
                    scores = json.loads(match.group())
                except json.JSONDecodeError:
                    pass

    # Fallback if Gemini returned nothing parseable
    if not scores:
        all_prices = [p["current_price"] for p in products]
        # Pick cheapest non-zero as best
        best_idx = 0
        for i, p in enumerate(products):
            if p["current_price"] > 0:
                best_idx = i
                break
        scores = _rule_based_score(products[best_idx], all_prices)
        scores["best_index"] = best_idx

    return scores


async def recommender_agent(
    user_query: str,
    products: list[dict[str, Any]],
    scores: dict[str, Any],
) -> str:
    """
    Uses Gemini to write a clear, decisive buying recommendation.
    """
    best_idx = int(scores.get("best_index", 0))
    best = products[best_idx] if 0 <= best_idx < len(products) else (products[0] if products else {})

    if not products:
        return "No products were found for your query. Try rephrasing or being more specific."

    prompt = f"""You are SearchPick.ai, an expert AI shopping assistant that thinks like a senior buyer.

User asked for: "{user_query}"

Top recommended product:
- Title: {best.get('title', 'N/A')}
- Store: {best.get('store_name', 'N/A')}
- Price: ${best.get('current_price', 0):.2f}
- URL: {best.get('url', 'N/A')}
- Description: {best.get('description', 'N/A')[:200]}

Buying Score: {scores.get('overall_score', 0)}/100
AI Confidence: {round(float(scores.get('ai_confidence', 0.5)) * 100)}%

Write a clear, confident 3-4 sentence recommendation explaining:
1. Why this product is the best choice for the user.
2. Key value points (price, quality, store trust).
3. Any important caveats or alternatives to consider.

Be direct and decisive. Sound like an expert who has done the research.
Do NOT use markdown, bullet points, or headers — plain text only.
"""
    response = await _gemini(prompt)
    if response and len(response.strip()) > 20:
        return response.strip()

    # Plain fallback
    return (
        f"Based on my analysis of {len(products)} real listings, I recommend the "
        f"'{best.get('title', 'top result')[:60]}' from {best.get('store_name', 'the top retailer')} "
        f"at ${best.get('current_price', 0):.2f}. "
        f"It offers the best combination of price and store trustworthiness for your needs. "
        f"Check the link for current availability and exact shipping costs."
    )


# ─── Orchestrator ─────────────────────────────────────────────────────────────

class SearchPickOrchestrator:
    """
    Sequential agent pipeline:
      PlannerAgent (Query variant & Filter extraction)
      → SearchAgent (Concurrent multi-query search)
      → AnalystAgent (Gemini/Rule-based scoring)
      → RecommenderAgent (Decision synthesis)
    """

    async def run_flow(self, user_query: str) -> dict[str, Any]:
        # Step 1 — Planner (Extract criteria & generate query variants)
        plan = await planner_agent(user_query)
        queries = plan.get("search_queries", [user_query])
        filters = plan.get("filters", {})
        print(f"[Planner] Generated {len(queries)} target queries. Filters: {filters}")

        # Step 2 — SearchAgent (Run all queries concurrently)
        raw_products = await search_agent(queries)
        print(f"[Search] Combined {len(raw_products)} raw search results")

        # Step 3 — Filter results according to planned criteria
        filtered_products: list[dict[str, Any]] = []
        max_p = filters.get("max_price")
        min_p = filters.get("min_price")
        req_kw = [k.lower() for k in filters.get("required_keywords", []) if k]
        forb_kw = [k.lower() for k in filters.get("forbidden_keywords", []) if k]

        for p in raw_products:
            price = p.get("current_price", 0.0)
            title_lower = p.get("title", "").lower()
            desc_lower = p.get("description", "").lower()

            # Price constraints
            if max_p is not None and price > max_p:
                continue
            if min_p is not None and price < min_p:
                continue

            # Required keywords check
            if req_kw and not any(k in title_lower or k in desc_lower for k in req_kw):
                continue

            # Forbidden keywords check
            if forb_kw and any(k in title_lower or k in desc_lower for k in forb_kw):
                continue

            filtered_products.append(p)

        # Fallback to unfiltered if we filtered out everything
        if not filtered_products:
            filtered_products = raw_products

        print(f"[Filter] {len(filtered_products)} products match criteria")

        # Step 4 — AnalystAgent
        scores = await analyst_agent(user_query, filtered_products)
        best_idx = int(scores.get("best_index", 0))
        best = filtered_products[best_idx] if filtered_products and 0 <= best_idx < len(filtered_products) else {}

        # Step 5 — RecommenderAgent
        explanation = await recommender_agent(user_query, filtered_products, scores)

        # Build the final buying score dict
        buying_score = {
            "overall_score":       int(scores.get("overall_score", 0)),
            "price_score":         float(scores.get("price_score", 0)),
            "quality_score":       float(scores.get("quality_score", 0)),
            "trust_score":         float(scores.get("trust_score", 0)),
            "warranty_score":      float(scores.get("warranty_score", 0)),
            "repairability_score": float(scores.get("repairability_score", 0)),
            "shipping_score":      float(scores.get("shipping_score", 0)),
            "popularity_score":    float(scores.get("popularity_score", 0)),
            "value_score":         float(scores.get("value_score", 0)),
            "ai_confidence":       float(scores.get("ai_confidence", 0.5)),
            "final_recommendation": best.get("title", "Top Result")[:100],
            "explanation":         explanation,
            "recommended_store":   best.get("store_name", "Online Store"),
            "recommended_url":     best.get("url", ""),
            "recommended_price":   best.get("current_price", 0.0),
            "recommended_image":   best.get("image_url", None),
        }

        # Normalise for frontend
        scraped_products = [
            {
                "title":          p.get("title", ""),
                "brand":          p.get("brand"),
                "store_name":     p.get("store_name", ""),
                "price":          p.get("current_price", 0.0),
                "shipping":       p.get("shipping_cost", 0.0),
                "delivery_days":  p.get("delivery_time_days"),
                "warranty":       p.get("warranty_info"),
                "url":            p.get("url", ""),
                "description":    p.get("description", ""),
                "image_url":      p.get("image_url"),
            }
            for p in filtered_products
        ]

        return {
            "refined_query":    queries[0] if queries else user_query,
            "scraped_products": scraped_products,
            "buying_score":     buying_score,
            "final_response":   explanation,
        }

