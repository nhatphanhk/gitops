# GitOps Demo — W9 Challenge: Ship Smartly

Triển khai app `api` với đầy đủ GitOps, Canary deployment, SLO monitoring và auto-abort.

## Kiến trúc

```text
Git (GitHub)
    │
    ▼
ArgoCD (App of Apps)
    ├─ api          → k8s-api/       (Rollout + Services + ServiceMonitor + PrometheusRule + AnalysisTemplate)
    ├─ kube-prometheus-stack → Helm  (Prometheus + Grafana + Alertmanager)
    └─ argo-rollouts         → Helm  (Rollout controller + dashboard)
```

### Namespace
| Namespace | Mục đích |
|---|---|
| `argocd` | ArgoCD |
| `demo` | App api |
| `monitoring` | Prometheus, Grafana, Alertmanager |
| `argo-rollouts` | Argo Rollouts controller |

---

## Thành phần

| File | Mô tả |
|---|---|
| `app/app.py` | Flask app với `/`, `/healthz`, `/metrics` |
| `app/Dockerfile` | Build image `w9-api:1` |
| `k8s-api/rollout.yaml` | Argo Rollout — canary strategy + AnalysisTemplate |
| `k8s-api/service.yaml` | Service `api` (stable) + `api-canary` |
| `k8s-api/servicemonitor.yaml` | ServiceMonitor — Prometheus scrape `/metrics` |
| `k8s-api/analysis-template.yaml` | AnalysisTemplate — đánh giá success rate >= 95% |
| `k8s-api/prometheus-rule.yaml` | PrometheusRule — alert `ApiSuccessRateLow` |
| `argocd/root.yaml` | Root App of Apps |
| `argocd/apps/api.yaml` | ArgoCD App cho api |
| `argocd/apps/kube-prometheus-stack.yaml` | ArgoCD App cho monitoring stack |
| `argocd/apps/argo-rollouts.yaml` | ArgoCD App cho Argo Rollouts |

---

## Setup ban đầu

### 1. Build image

```bash
cd app
docker build -t w9-api:1 .

# Nếu dùng minikube:
minikube image load w9-api:1

# Nếu dùng kind:
kind load docker-image w9-api:1
```

### 2. Cài ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### 3. Tạo root App

```bash
kubectl apply -f argocd/root.yaml
```

ArgoCD sẽ tự động sync tất cả app con.

### 4. Cập nhật email SMTP

Sửa file `argocd/apps/kube-prometheus-stack.yaml` — thay các placeholder:
- `your-email@gmail.com`
- `your-gmail-app-password`

> Dùng **Gmail App Password** (không phải mật khẩu thường): https://myaccount.google.com/apppasswords

---

## SLO

```text
API success rate >= 95%
```

**Prometheus query:**
```promql
sum(rate(flask_http_request_total{namespace="demo",status!~"5.."}[5m]))
/
sum(rate(flask_http_request_total{namespace="demo"}[5m]))
```

---

## Demo Scenarios

### Case 1 — Bản tốt (Good Release)

```bash
# Sửa rollout.yaml: VERSION=v2, ERROR_RATE=0
git add k8s-api/rollout.yaml
git commit -m "release: v2 good release"
git push
```

**Kết quả:**
```
Canary 25% → analysis success → 50% → analysis success → 100%
```

### Case 2 — Bản lỗi (Bad Release / Auto-abort)

```bash
# Sửa rollout.yaml: VERSION=v3, ERROR_RATE=0.6
git add k8s-api/rollout.yaml
git commit -m "release: v3 bad release (60% error rate)"
git push
```

**Kết quả:**
```
AnalysisRun Failed → Rollout Aborted → Stable version giữ lại
Alert ApiSuccessRateLow = Firing → Email cảnh báo được gửi
```

### Case 3 — Rollback bằng Git

```bash
git revert HEAD --no-edit
git push
```

**Kết quả:**
```
ArgoCD sync về commit cũ < 5 phút
Rollout Healthy
App quay về bản ổn định
```

---

## Kiểm tra

```bash
# Namespaces
kubectl get ns

# ArgoCD apps
kubectl -n argocd get applications

# Monitoring pods
kubectl -n monitoring get pods

# Rollout
kubectl -n demo get rollout

# AnalysisTemplate
kubectl -n demo get analysistemplate

# Alert
kubectl -n monitoring port-forward svc/kube-prometheus-stack-alertmanager 9093:9093
# Mở http://localhost:9093
```

---

## Evidence Checklist

- [ ] ArgoCD apps: `kubectl -n argocd get applications`
- [ ] Monitoring pods: `kubectl -n monitoring get pods`
- [ ] Argo Rollouts pods: `kubectl -n argo-rollouts get pods`
- [ ] Rollout API: `kubectl -n demo get rollout api`
- [ ] Metrics: Prometheus query `flask_http_request_total{namespace="demo"}`
- [ ] SLO query: success rate >= 95%
- [ ] Alert firing: Alertmanager `ApiSuccessRateLow = Firing`
- [ ] Email alert received
- [ ] Auto-abort: `AnalysisRun Failed`, `Rollout Aborted`
- [ ] Rollback: `git log --oneline`, ArgoCD `Synced/Healthy`
