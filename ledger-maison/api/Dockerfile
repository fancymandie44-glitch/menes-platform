FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-fra && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml ./
COPY ledger_maison ./ledger_maison
RUN pip install --no-cache-dir .
ENV LEDGER_DATA=/data
EXPOSE 8847
CMD ["uvicorn", "ledger_maison.api:app", "--host", "0.0.0.0", "--port", "8847"]
