@echo off
echo ===================================================
echo [SearchPick.ai] Rebuilding Frontend ^& Launching Server
echo ===================================================

cd frontend
echo [1/2] Compiling static React/Next.js bundle...
call npm run build

cd ../backend
echo [2/2] Launching single-port FastAPI server...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
