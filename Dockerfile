FROM python:3.10-slim

WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy application code
COPY . .

# Create directories for file storage
RUN mkdir -p /app/uploads /app/outputs

# Expose port for API
EXPOSE 8000

# Default command (will be overridden by docker-compose)
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
