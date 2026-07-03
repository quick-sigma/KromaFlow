#!/usr/bin/env bash
set -e

FRONTEND_PORT=55559
API_PORT=55558

cleanup() {
  echo "Deteniendo servidores..."
  kill $API_PID $FRONTEND_PID 2>/dev/null
  wait $API_PID $FRONTEND_PID 2>/dev/null
}
trap cleanup EXIT INT TERM

echo "Iniciando FastAPI en el puerto $API_PORT..."
cd Backend
source .venv/bin/activate
uvicorn main:app --port "$API_PORT" --reload &
API_PID=$!
cd ..

echo "Iniciando frontend en el puerto $FRONTEND_PORT..."
cd frontend
npx vite --port "$FRONTEND_PORT" --host &
FRONTEND_PID=$!
cd ..

sleep 2

echo "Abriendo Brave..."
brave --new-tab "http://localhost:$FRONTEND_PORT" --new-tab "http://localhost:$API_PORT/docs"

echo "Presiona Ctrl+C para detener todo."
wait
