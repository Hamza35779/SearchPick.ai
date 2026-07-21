from dataclasses import dataclass
from typing import Optional

@dataclass
class BuyingScore:
    overall_score: float
    price_score: float
    quality_score: float
    trust_score: float
    warranty_score: float
    repairability_score: float
    shipping_score: float
    popularity_score: float
    value_score: float
    ai_confidence: float
    final_recommendation: str
    explanation: str

    def to_dict(self) -> dict:
        return {
            "overall_score": self.overall_score,
            "price_score": self.price_score,
            "quality_score": self.quality_score,
            "trust_score": self.trust_score,
            "warranty_score": self.warranty_score,
            "repairability_score": self.repairability_score,
            "shipping_score": self.shipping_score,
            "popularity_score": self.popularity_score,
            "value_score": self.value_score,
            "ai_confidence": self.ai_confidence,
            "final_recommendation": self.final_recommendation,
            "explanation": self.explanation
        }
