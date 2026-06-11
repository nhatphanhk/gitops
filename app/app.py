import os
import random
from flask import Flask, jsonify
from prometheus_flask_exporter import PrometheusMetrics

app = Flask(__name__)

# PrometheusMetrics tự thêm endpoint /metrics
# và tự track flask_http_request_total với labels: method, status, path
metrics = PrometheusMetrics(app)

# Static info metric về version
metrics.info("api_info", "API version info", version=os.getenv("VERSION", "v1"))

ERR = float(os.getenv("ERROR_RATE", "0"))
VER = os.getenv("VERSION", "v1")


@app.get("/")
def index():
    """Main endpoint — injects error theo ERROR_RATE"""
    if ERR > 0 and random.random() < ERR:
        return jsonify(error="injected", version=VER), 500
    return jsonify(ok=True, version=VER)


@app.get("/healthz")
def healthz():
    """Health check endpoint — dùng bởi readinessProbe/livenessProbe"""
    return "ok", 200