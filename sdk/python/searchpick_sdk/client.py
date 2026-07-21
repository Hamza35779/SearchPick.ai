import os
import json
import asyncio
import httpx
import websockets
from typing import Dict, Any, Callable, List, Optional

class SearchPickClient:
    """
    SearchPick.ai Python SDK Client
    Connects to the SearchPick.ai Core Engine to search, analyze, and score products.
    """
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url.rstrip("/")
        self.ws_url = self.base_url.replace("http://", "ws://").replace("https://", "wss://")

    def get_status(self) -> Dict[str, Any]:
        """Check API engine service status."""
        with httpx.Client() as client:
            resp = client.get(f"{self.base_url}/api/v1/status")
            resp.raise_for_status()
            return resp.json()

    def parse_file(self, file_path: str) -> Dict[str, Any]:
        """Upload and parse Excel, CSV, DOCX, or Image criteria files."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        filename = os.path.basename(file_path)
        with open(file_path, "rb") as f:
            files = {"file": (filename, f, "application/octet-stream")}
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(f"{self.base_url}/api/v1/upload", files=files)
                resp.raise_for_status()
                return resp.json()

    async def search_stream(
        self,
        query: str,
        file_context: Optional[str] = None,
        on_agent_state: Optional[Callable[[str, str], None]] = None,
        on_results: Optional[Callable[[List[Dict[str, Any]]], None]] = None
    ) -> Dict[str, Any]:
        """
        Search products asynchronously via WebSockets to receive live agent updates,
        filtered search listings, and the final buying score decision.
        """
        session_id = "sdk_session"
        url = f"{self.ws_url}/api/v1/chat/ws/{session_id}"
        
        async with websockets.connect(url) as websocket:
            # Send search payload
            payload = {"message": query, "file_context": file_context}
            await websocket.send(json.dumps(payload))
            
            final_recommendation = None
            
            async for message in websocket:
                data = json.loads(message)
                msg_type = data.get("type")
                
                if msg_type == "agent_state":
                    if on_agent_state:
                        on_agent_state(data.get("agent", ""), data.get("status", ""))
                
                elif msg_type == "search_results":
                    if on_results:
                        on_results(data.get("products", []))
                
                elif msg_type == "final_recommendation":
                    final_recommendation = {
                        "buying_score": data.get("buying_score"),
                        "explanation": data.get("explanation")
                    }
                    break
                    
                elif msg_type == "error":
                    raise RuntimeError(f"Engine Error: {data.get('message')}")
            
            return final_recommendation
