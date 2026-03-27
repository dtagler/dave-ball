FROM mcr.microsoft.com/playwright/python:v1.52.0-noble

WORKDIR /tests

COPY tests/e2e/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && \
    playwright install chromium

COPY tests/e2e/ e2e/

RUN adduser --disabled-password --no-create-home testuser
USER testuser

CMD ["pytest", "e2e/", "-v", "--browser", "chromium"]
