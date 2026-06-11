import os
import time
import random
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

VERSION = os.getenv("VERSION", "v1")
ERROR_RATE = float(os.getenv("ERROR_RATE", "0"))

app = FastAPI(
    title="GitOps Demo API",
    description="Backend API for GitOps Canary Demo",
    version=VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

START_TIME = time.time()

# ── In-memory counters for Prometheus metrics ──────────────────────────────
_counters = {"success": 0, "failure": 0}


# ── Error-injection middleware (skips /health and /metrics) ────────────────
@app.middleware("http")
async def inject_errors(request: Request, call_next):
    path = request.url.path
    # Always pass health and metrics through cleanly
    if path in ("/health", "/metrics"):
        return await call_next(request)

    if ERROR_RATE > 0 and random.random() < ERROR_RATE:
        _counters["failure"] += 1
        return Response(
            content='{"detail":"simulated error"}',
            status_code=500,
            media_type="application/json",
        )

    response = await call_next(request)
    if response.status_code < 500:
        _counters["success"] += 1
    else:
        _counters["failure"] += 1
    return response


# ── Endpoints ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["monitoring"])
def health():
    uptime = int(time.time() - START_TIME)
    hours, rem = divmod(uptime, 3600)
    minutes, seconds = divmod(rem, 60)
    return {
        "status": "ok",
        "version": VERSION,
        "uptime_seconds": uptime,
        "uptime_human": f"{hours:02d}:{minutes:02d}:{seconds:02d}",
    }


@app.get("/metrics", tags=["monitoring"])
def metrics():
    """Prometheus text-format metrics — scraped by ServiceMonitor."""
    success = _counters["success"]
    failure = _counters["failure"]
    total = success + failure
    lines = [
        "# HELP http_requests_total Total HTTP requests handled",
        "# TYPE http_requests_total counter",
        f'http_requests_total{{version="{VERSION}",status="success"}} {success}',
        f'http_requests_total{{version="{VERSION}",status="failure"}} {failure}',
        "# HELP http_requests_success_rate Rolling success rate (instantaneous)",
        "# TYPE http_requests_success_rate gauge",
        f'http_requests_success_rate{{version="{VERSION}"}} {success/total if total > 0 else 1.0}',
        "",
    ]
    return Response(content="\n".join(lines), media_type="text/plain; version=0.0.4")


@app.get("/info", tags=["metadata"])
def info():
    return {
        "app": "gitops-demo",
        "version": VERSION,
        "error_rate": ERROR_RATE,
        "environment": os.getenv("ENVIRONMENT", "production"),
        "namespace": os.getenv("POD_NAMESPACE", "demo"),
        "pod_name": os.getenv("POD_NAME", "unknown"),
        "node_name": os.getenv("NODE_NAME", "unknown"),
        "git_repo": "github.com/nhatphanhk/gitops",
        "deployed_by": "ArgoCD",
    }


@app.get("/message", tags=["config"])
def message():
    return {
        "message": os.getenv("MESSAGE", "hello from gitops"),
        "source": "kubernetes-configmap",
        "version": VERSION,
    }
