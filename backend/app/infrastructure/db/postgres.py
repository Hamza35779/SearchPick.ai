from sqlalchemy import create_engine, Column, String, Float, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
import os
import uuid

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./searchpick.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class UserModel(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, default="consumer")

class ProductModel(Base):
    __tablename__ = "products"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(Text, nullable=False)
    brand = Column(String, nullable=True)
    model_identifier = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    image_url = Column(Text, nullable=True)
    listings = relationship("StoreListingModel", back_populates="product", cascade="all, delete-orphan")

class StoreListingModel(Base):
    __tablename__ = "store_listings"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    product_id = Column(String, ForeignKey("products.id", ondelete="CASCADE"))
    store_name = Column(String, nullable=False)
    url = Column(Text, nullable=False)
    current_price = Column(Float, nullable=False)
    currency = Column(String, default="USD")
    shipping_cost = Column(Float, default=0.0)
    delivery_time_days = Column(Float, nullable=True)
    warranty_info = Column(Text, nullable=True)
    is_available = Column(Boolean, default=True)
    product = relationship("ProductModel", back_populates="listings")

# Initialize schemas
def init_db():
    Base.metadata.create_all(bind=engine)
