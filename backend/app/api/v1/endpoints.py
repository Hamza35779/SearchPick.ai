from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from app.agents.graph import SearchPickOrchestrator
from app.services.file_parser import parse_upload
from pathlib import Path
import json
import asyncio

router = APIRouter()
orchestrator = SearchPickOrchestrator()

ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif",
    ".csv", ".xlsx", ".xls", ".docx", ".txt",
}
MAX_FILE_MB = 20


@router.get("/status")
def get_status():
    return {"status": "healthy", "service": "SearchPick.ai Core Engine"}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Parse an uploaded file and return structured extracted text."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{suffix}'.")

    probe = await file.read(MAX_FILE_MB * 1024 * 1024 + 1)
    if len(probe) > MAX_FILE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_FILE_MB} MB limit.")
    await file.seek(0)

    try:
        result = await parse_upload(file)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {exc}")

    return JSONResponse(content={"filename": file.filename, **result})


@router.websocket("/chat/ws/{session_id}")
async def chat_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            user_query = payload.get("message", "").strip()
            file_context = payload.get("file_context", "").strip()

            # Merge file context into query
            full_query = user_query
            if file_context:
                full_query = f"{user_query}\n\n[Attached File Context]\n{file_context}"

            if not full_query:
                continue

            # ── Stream: Planning ──────────────────────────────────────────────
            await websocket.send_json({
                "type": "agent_state",
                "agent": "PlannerAgent",
                "status": "Understanding your request and refining search strategy…",
            })
            await asyncio.sleep(0.3)

            # ── Stream: Searching ─────────────────────────────────────────────
            await websocket.send_json({
                "type": "agent_state",
                "agent": "SearchAgent",
                "status": "Searching Amazon, eBay, Walmart, BestBuy, Newegg and more…",
            })

            # Run the full pipeline
            try:
                state = await orchestrator.run_flow(full_query)
            except Exception as exc:
                await websocket.send_json({"type": "error", "message": str(exc)})
                continue

            products = state["scraped_products"]
            refined = state.get("refined_query", user_query)

            # ── Stream: Analysis ──────────────────────────────────────────────
            await websocket.send_json({
                "type": "agent_state",
                "agent": "AnalystAgent",
                "status": f"Analysing {len(products)} listings — scoring price, trust, value…",
            })
            await asyncio.sleep(0.3)

            # ── Stream: Search results ────────────────────────────────────────
            await websocket.send_json({
                "type": "search_results",
                "products": products,
                "refined_query": refined,
                "count": len(products),
            })

            # ── Stream: Recommendation ────────────────────────────────────────
            await websocket.send_json({
                "type": "agent_state",
                "agent": "RecommenderAgent",
                "status": "Writing your decisive buying recommendation…",
            })
            await asyncio.sleep(0.2)

            await websocket.send_json({
                "type": "final_recommendation",
                "buying_score": state["buying_score"],
                "explanation": state["final_response"],
            })

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
