from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

@dataclass
class User:
    id: UUID
    email: str
    hashed_password: str
    full_name: Optional[str] = None
    role: str = "consumer"  # consumer, company_manager, admin
    company_id: Optional[UUID] = None
    created_at: datetime = datetime.now()

    @classmethod
    def create(cls, email: str, hashed_password: str, full_name: Optional[str] = None, role: str = "consumer", company_id: Optional[UUID] = None):
        return cls(
            id=uuid4(),
            email=email,
            hashed_password=hashed_password,
            full_name=full_name,
            role=role,
            company_id=company_id,
            created_at=datetime.utcnow()
        )
