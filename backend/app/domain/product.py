from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4

@dataclass
class PriceHistory:
    id: UUID
    listing_id: UUID
    price: float
    recorded_at: datetime = datetime.now()

@dataclass
class StoreListing:
    id: UUID
    product_id: UUID
    store_name: str  # Amazon, eBay, Daraz, etc.
    url: str
    current_price: float
    currency: str = "USD"
    shipping_cost: float = 0.0
    delivery_time_days: Optional[int] = None
    warranty_info: Optional[str] = None
    is_available: bool = True
    last_updated: datetime = datetime.now()
    price_history: List[PriceHistory] = field(default_factory=list)

@dataclass
class Product:
    id: UUID
    title: str
    brand: Optional[str] = None
    model_identifier: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    created_at: datetime = datetime.now()
    listings: List[StoreListing] = field(default_factory=list)

    @classmethod
    def create(cls, title: str, brand: Optional[str] = None, model_identifier: Optional[str] = None, 
               description: Optional[str] = None, category: Optional[str] = None, image_url: Optional[str] = None):
        return cls(
            id=uuid4(),
            title=title,
            brand=brand,
            model_identifier=model_identifier,
            description=description,
            category=category,
            image_url=image_url,
            created_at=datetime.utcnow(),
            listings=[]
        )
