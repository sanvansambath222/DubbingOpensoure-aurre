FROM node:18-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY frontend/ ./
RUN REACT_APP_BACKEND_URL="" yarn build


FROM python:3.11-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements-deploy.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# Copy backend
COPY backend/ ./backend/

# Copy frontend build
COPY --from=frontend-build /app/frontend/build ./frontend/build

# Create uploads directory
RUN mkdir -p /app/uploads

EXPOSE 8001

CMD ["sh", "-c", "uvicorn backend.server:app --host 0.0.0.0 --port ${PORT:-8001}"]
