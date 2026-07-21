from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from app.domain.product import Product, StoreListing, PriceHistory
from app.repository.product_repository import ProductRepository
from app.infrastructure.db.postgres import ProductModel, StoreListingModel

class SqlProductRepository(ProductRepository):
    def __init__(self, db: Session):
        self.db = db

    async def get_by_id(self, product_id: UUID) -> Optional[Product]:
        model = self.db.query(ProductModel).filter(ProductModel.id == str(product_id)).first()
        if not model:
            return None
        return self._to_domain(model)

    async def save(self, product: Product) -> None:
        model = self.db.query(ProductModel).filter(ProductModel.id == str(product.id)).first()
        if not model:
            model = ProductModel(
                id=str(product.id),
                title=product.title,
                brand=product.brand,
                model_identifier=product.model_identifier,
                description=product.description,
                category=product.category,
                image_url=product.image_url
            )
            self.db.add(model)
        else:
            model.title = product.title
            model.brand = product.brand
            model.model_identifier = product.model_identifier
            model.description = product.description
            model.category = product.category
            model.image_url = product.image_url
        
        self.db.commit()

    async def search_by_title(self, query: str) -> List[Product]:
        models = self.db.query(ProductModel).filter(ProductModel.title.ilike(f"%{query}%")).all()
        return [self._to_domain(m) for m in models]

    async def add_listing(self, product_id: UUID, listing: StoreListing) -> None:
        listing_model = StoreListingModel(
            id=str(listing.id),
            product_id=str(product_id),
            store_name=listing.store_name,
            url=listing.url,
            current_price=listing.current_price,
            currency=listing.currency,
            shipping_cost=listing.shipping_cost,
            delivery_time_days=listing.delivery_time_days,
            warranty_info=listing.warranty_info,
            is_available=listing.is_available
        )
        self.db.add(listing_model)
        self.db.commit()

    def _to_domain(self, model: ProductModel) -> Product:
        listings = []
        for l in model.listings:
            listings.append(StoreListing(
                id=UUID(l.id),
                product_id=UUID(l.product_id),
                store_name=l.store_name,
                url=l.url,
                current_price=l.current_price,
                currency=l.currency,
                shipping_cost=l.shipping_cost,
                delivery_time_days=int(l.delivery_time_days) if l.delivery_time_days else None,
                warranty_info=l.warranty_info,
                is_available=l.is_available,
                price_history=[]
            ))
        return Product(
            id=UUID(model.id),
            title=model.title,
            brand=model.brand,
            model_identifier=model.model_identifier,
            description=model.description,
            category=model.category,
            image_url=model.image_url,
            listings=listings
        )
