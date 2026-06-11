# W9 Challenge — Yêu cầu & Kết quả cần đạt

## 1. Mục tiêu Challenge

Hoàn thành challenge **Ship Smartly** bằng cách triển khai app `api` theo hướng:

- Thay đổi qua **GitOps**
- Đo chất lượng bằng **SLO + Alert**
- Release bằng **Canary**
- Bản lỗi phải **tự abort/rollback**, không cần rollback tay

---

## 2. Yêu cầu bắt buộc

| Nhóm | Yêu cầu | Kết quả cần đạt |
|---|---|---|
| GitOps | Mọi thay đổi app đi qua Git | ArgoCD tự sync, app ở trạng thái `Synced/Healthy` |
| Rollback | Rollback bằng `git revert` | Cụm quay về bản cũ trong dưới 5 phút |
| Observability | Có metric từ app `api` | Prometheus scrape được `/metrics` |
| SLO | Có 1 SLO rõ ràng | Ví dụ: API success rate >= 95% |
| Alert | Có alert khi SLO bị vi phạm | Alert fire và gửi email cá nhân |
| Canary | Dùng Argo Rollouts | Bản tốt lên 100%, bản lỗi tự abort |
| Evidence | Có ảnh/clip chứng minh | Nộp repo + README + evidence |

---

## 3. Thành phần cần có

### Namespace

Cần có các namespace:

```bash
argocd
demo
monitoring
argo-rollouts
```

Kiểm tra:

```bash
kubectl get ns
```

---

### ArgoCD Applications

Cần có tối thiểu:

```bash
root
api
kube-prometheus-stack
argo-rollouts
```

Kiểm tra:

```bash
kubectl -n argocd get applications
```

Kết quả mong muốn:

```text
api                     Synced   Healthy
kube-prometheus-stack   Synced   Healthy
argo-rollouts           Synced   Healthy
root                    Synced   Healthy
```

---

## 4. Yêu cầu GitOps

Tất cả manifest phải nằm trong Git.

Cấu trúc repo đề xuất:

```text
gitops/
├─ app/
│  ├─ app.py
│  └─ Dockerfile
├─ k8s-api/
│  ├─ api.yaml
│  ├─ analysis-template.yaml
│  ├─ servicemonitor.yaml
│  └─ prometheus-rule.yaml
├─ argocd/
│  ├─ root.yaml
│  └─ apps/
│     ├─ api.yaml
│     ├─ argo-rollouts.yaml
│     └─ kube-prometheus-stack.yaml
└─ README.md
```

Kết quả cần đạt:

```text
Sửa file YAML -> git commit -> git push -> ArgoCD tự sync
```

Không nên sửa app chính trực tiếp bằng `kubectl apply`.

---

## 5. Yêu cầu Observability

Cần cài:

- Prometheus
- Grafana
- Alertmanager
- ServiceMonitor
- PrometheusRule

Kiểm tra:

```bash
kubectl -n monitoring get pods
```

Kết quả mong muốn:

```text
prometheus-...       Running
grafana-...          Running
alertmanager-...     Running
```

---

## 6. Yêu cầu App API

App `api` cần có:

- Endpoint `/`
- Endpoint `/healthz`
- Endpoint `/metrics`
- Biến môi trường `VERSION`
- Biến môi trường `ERROR_RATE`

Mục đích:

| Biến | Ý nghĩa |
|---|---|
| `VERSION` | Dùng để phân biệt bản release |
| `ERROR_RATE` | Dùng để inject lỗi khi test canary/alert |

---

## 7. Yêu cầu SLO

SLO đề xuất:

```text
API success rate >= 95%
```

Prometheus query:

```promql
sum(rate(flask_http_request_total{namespace="demo", status!~"5.."}[5m]))
/
sum(rate(flask_http_request_total{namespace="demo"}[5m]))
```

Ý nghĩa:

```text
Success rate = request không lỗi 5xx / tổng request
```

---

## 8. Yêu cầu Alert

Cần có alert khi success rate thấp hơn 95%.

Ví dụ:

```text
Alert name: ApiSuccessRateLow
Condition: success rate < 95% trong 1 phút
Receiver: email cá nhân
```

Kết quả cần chứng minh:

- Alertmanager hiển thị alert `Firing`
- Email cá nhân nhận được cảnh báo

Kiểm tra Alertmanager:

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-alertmanager 9093:9093
```

Mở:

```text
http://localhost:9093
```

---

## 9. Yêu cầu Canary Auto-abort

Cần dùng:

- Argo Rollouts
- `Rollout`
- `AnalysisTemplate`
- Prometheus query để tự chấm chất lượng

Kiểm tra CRD Rollout:

```bash
kubectl api-resources | findstr Rollout
```

Kiểm tra Rollout app:

```bash
kubectl -n demo get rollout
```

Kết quả mong muốn:

```text
api
```

---

## 10. Kịch bản Demo cần đạt

### Case 1 — Bản tốt

Cấu hình:

```yaml
VERSION: "v2"
ERROR_RATE: "0"
```

Kết quả cần đạt:

```text
Canary 25% -> analysis success -> 50% -> analysis success -> 100%
```

---

### Case 2 — Bản lỗi

Cấu hình:

```yaml
VERSION: "v3"
ERROR_RATE: "0.6"
```

Kết quả cần đạt:

```text
AnalysisRun Failed
Rollout Aborted
Stable version được giữ lại
Alert SLO fire
Email alert được gửi
```

---

### Case 3 — Rollback bằng Git

Chạy:

```bash
git revert HEAD --no-edit
git push
```

Kết quả cần đạt:

```text
ArgoCD sync về commit cũ
Rollout Healthy
App quay về bản ổn định
Thời gian rollback < 5 phút
```

---

## 11. Evidence cần nộp

Cần chuẩn bị ảnh hoặc clip các phần sau:

| Evidence | Lệnh / Nội dung cần chụp |
|---|---|
| ArgoCD apps | `kubectl -n argocd get applications` |
| Monitoring pods | `kubectl -n monitoring get pods` |
| Argo Rollouts pods | `kubectl -n argo-rollouts get pods` |
| Rollout API | `kubectl -n demo get rollout api` |
| Metrics | Prometheus query `flask_http_request_total{namespace="demo"}` |
| SLO query | Query success rate >= hoặc < 95% |
| Alert firing | Alertmanager có `ApiSuccessRateLow = Firing` |
| Email alert | Email cá nhân nhận cảnh báo |
| Auto-abort | `AnalysisRun Failed`, `Rollout Aborted` |
| Rollback | `git log --oneline`, ArgoCD app trở lại `Synced/Healthy` |

---

## 12. Checklist hoàn thành

```text
[ ] Có ArgoCD
[ ] Có root app hoặc Application quản qua Git
[ ] Có kube-prometheus-stack
[ ] Có argo-rollouts
[ ] Có app api trong namespace demo
[ ] api dùng Rollout, không chỉ Deployment thường
[ ] api có /metrics
[ ] Prometheus scrape được metric
[ ] Có ServiceMonitor
[ ] Có PrometheusRule
[ ] Có Alertmanager gửi email
[ ] Có AnalysisTemplate
[ ] Good release lên 100%
[ ] Bad release tự abort
[ ] Alert fire khi inject lỗi
[ ] Email nhận được alert
[ ] Rollback bằng git revert dưới 5 phút
[ ] Có README giải thích
[ ] Có ảnh/clip chứng minh
```

---

## 13. Trạng thái đạt cuối cùng

Challenge được xem là đạt khi chứng minh được:

```text
Đổi version qua Git
-> ArgoCD tự sync
-> Argo Rollouts canary từng bước
-> Prometheus đo metric
-> AnalysisTemplate tự chấm
-> Bản tốt lên 100%
-> Bản lỗi tự abort
-> Alert gửi email
-> Rollback bằng git revert dưới 5 phút
```
