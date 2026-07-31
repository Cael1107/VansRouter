FROM python:3.13-slim

WORKDIR /app

RUN pip install --no-cache-dir uvicorn[standard]

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ src/

# Warmup in background (no need to block startup)
RUN python -c "print('Warmed up')"

EXPOSE 8000

CMD ["uvicorn", "src.api:app", "--host", "0.0.0.0", "--port", "8000"]
