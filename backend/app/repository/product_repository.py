from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID
from app.domain.product import Product, StoreListing

class ProductRepository(ABC):
    @abstractmethod
    async def get_by_id(self, product_id: UUID) -> Optional[Product]:
        pass

    @abstractmethod
    async def save(self, product: Product) -> None:
        pass

    @abstractmethod
    async def search_by_title(self, query: str) -> List[Product]:
        pass

    @abstractmethod
    async def add_listing(self, product_id: UUID, listing: StoreListing) -> None:
        pass
