import pytest
from app.domain.product import Product
from app.domain.buying_score import BuyingScore
from app.infrastructure.scrapers.scrapers_engine import async_search_products
from app.agents.graph import SearchPickOrchestrator

def test_product_creation():
    product = Product.create(
        title="Test Gaming Laptop",
        brand="TestBrand",
        description="A great laptop for gaming",
        category="Laptop"
    )
    assert product.title == "Test Gaming Laptop"
    assert product.brand == "TestBrand"
    assert len(product.listings) == 0

def test_buying_score():
    score = BuyingScore(
        overall_score=90.0,
        price_score=95.0,
        quality_score=85.0,
        trust_score=90.0,
        warranty_score=80.0,
        repairability_score=75.0,
        shipping_score=90.0,
        popularity_score=85.0,
        value_score=92.0,
        ai_confidence=0.95,
        final_recommendation="Test Product",
        explanation="Highly recommended choice based on pricing and rating analysis."
    )
    data = score.to_dict()
    assert data["overall_score"] == 90.0
    assert data["final_recommendation"] == "Test Product"

@pytest.mark.asyncio
async def test_scraper_engine():
    results = await async_search_products("gaming laptop", max_results=5)
    assert len(results) > 0
    assert "title" in results[0]
    assert "current_price" in results[0]
    assert "store_name" in results[0]

@pytest.mark.asyncio
async def test_orchestrator_flow():
    orchestrator = SearchPickOrchestrator()
    state = await orchestrator.run_flow("I want a laptop")
    assert "refined_query" in state
    assert len(state["scraped_products"]) > 0
    assert state["buying_score"]["overall_score"] > 0

