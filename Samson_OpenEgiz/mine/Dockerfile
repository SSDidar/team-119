FROM python:3.12-slim
WORKDIR /app/mine
COPY mine/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY mine/simulator ./simulator
COPY mine/setup_twins.py ./setup_twins.py
RUN touch simulator/__init__.py
USER nobody
CMD ["python", "-m", "simulator.main"]
