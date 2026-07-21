# SearchPick.ai — AI Commerce Operating System

> "The AI That Finds, Thinks, and Buys Smarter."

SearchPick.ai is a **production-ready AI Commerce OS** that replaces chatbot-style product recommendation with full autonomous buying intelligence. It searches multiple marketplaces in parallel, analyzes reviews, detects fraud, compares warranties and delivery timelines, predicts future prices, and delivers a single decisive recommendation with a multi-factor **Buying Score**.

---

## Architecture Overview

```
frontend/   — Next.js 15 + React 19 + TailwindCSS 4 (TypeScript)
backend/    — FastAPI + SQLAlchemy + LangGraph agent orchestration (Python)
```

---

## Getting Started

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Server runs at `http://localhost:8000`.  
WebSocket endpoint: `ws://localhost:8000/api/v1/chat/ws/{session_id}`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI runs at `http://localhost:3000`.

---

## Running Tests

```bash
cd backend
pytest
```

---

## Phase 1 Features

| Feature | Status |
|---|---|
| AI Chat Interface | ✅ |
| Multi-Marketplace Search | ✅ |
| Parallel Scraping Engine | ✅ |
| Buying Score Matrix | ✅ |
| Product Comparison Grid | ✅ |
| WebSocket Streaming | ✅ |
| Domain-Driven Architecture | ✅ |
| Repository Pattern | ✅ |
| SQLite / PostgreSQL DB | ✅ |

## Phase 2–4

See `implementation_plan.md` for the full multi-phase roadmap including shipment tracking, barcode scanning, business procurement workflows, and autonomous AI negotiation agents.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, TailwindCSS 4 |
| Backend | FastAPI, Python 3.12, SQLAlchemy 2 |
| AI Orchestration | LangGraph (multi-agent state machine) |
| Database | PostgreSQL (SQLite for local dev) |
| Caching | Redis |
| Async Tasks | Celery + RabbitMQ |
| Vector DB | Qdrant |

---

*Built as the founding CTO architecture for SearchPick.ai.*
