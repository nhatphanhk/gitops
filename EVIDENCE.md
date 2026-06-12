# EVIDENCE — W9 Challenge: Ship Smartly

> Repo kiểm tra từ file `gitops.zip`  
> Mục tiêu: chứng minh hệ thống đã triển khai theo GitOps, có Observability/SLO/Alert, Canary tự động bằng Argo Rollouts và rollback bằng Git.

---

## 1. Thông tin tổng quan

| Hạng mục | Giá trị |
|---|---|
| Project | W9 Challenge — Ship Smartly |
| Repo GitOps | `https://github.com/nhatphanhk/gitops.git` |
| Cụm Kubernetes | Minikube/Local Kubernetes |
| GitOps Controller | ArgoCD |
| Progressive Delivery | Argo Rollouts |
| Monitoring Stack | kube-prometheus-stack: Prometheus, Grafana, Alertmanager |
| App chính | `api` — Flask app có `/`, `/healthz`, `/metrics` |
| Namespace app | `demo` |
| Namespace ArgoCD | `argocd` |
| Namespace monitoring | `monitoring` |
| Namespace rollouts | `argo-rollouts` |

---

## 2. Kiến trúc triển khai

```text
Developer
   |
   | git commit / git push
   v
GitHub Repository: nhatphanhk/gitops
   |
   | ArgoCD pull manifest từ Git
   v
ArgoCD App of Apps: argocd/root.yaml
   |
   | tạo/sync các Application con
   v
+---------------------------+-----------------------------+
| Application               | Chức năng                    |
+---------------------------+-----------------------------+
| api                       | Deploy app Flask bằng Rollout|
| kube-prometheus-stack     | Prometheus/Grafana/Alertmanager |
| argo-rollouts             | Rollouts controller/dashboard |
| frontend/backend/web      | Các app demo phụ nếu cần      |
+---------------------------+-----------------------------+
   |
   v
Kubernetes cluster
   |
   +--> namespace demo: api Rollout + Services + AnalysisTemplate
   +--> namespace monitoring: Prometheus + Alertmanager + ServiceMonitor + PrometheusRule
   +--> namespace argo-rollouts: Rollouts controller
```

**Kết luận kiến trúc:** thay đổi chính đi qua Git, ArgoCD tự đồng bộ, Argo Rollouts kiểm soát canary, Prometheus đo metric và Alertmanager gửi cảnh báo.

---

## 3. Cấu trúc repo quan trọng

```text
gitops/
├─ README.md
├─ app/
│  ├─ app.py
│  └─ Dockerfile
├─ argocd/
│  ├─ root.yaml
│  └─ apps/
│     ├─ api.yaml
│     ├─ argo-rollouts.yaml
│     ├─ kube-prometheus-stack.yaml
│     ├─ backend.yaml
│     ├─ frontend.yaml
│     └─ web.yaml
├─ k8s-api/
│  ├─ rollout.yaml
│  ├─ service.yaml
│  ├─ servicemonitor.yaml
│  ├─ analysis-template.yaml
│  └─ prometheus-rule.yaml
├─ k8s/
│  ├─ namespace.yaml
│  ├─ web.yaml
│  ├─ backend/
│  └─ frontend/
└─ github/workflows/validate.yml
```

### Giải thích nhanh các file chính

| File | Vai trò |
|---|---|
| `argocd/root.yaml` | Root Application dùng pattern app-of-apps, trỏ tới `argocd/apps` |
| `argocd/apps/api.yaml` | ArgoCD Application deploy app `api` từ thư mục `k8s-api` |
| `argocd/apps/kube-prometheus-stack.yaml` | Cài Prometheus/Grafana/Alertmanager bằng Helm chart |
| `argocd/apps/argo-rollouts.yaml` | Cài Argo Rollouts bằng Helm chart |
| `k8s-api/rollout.yaml` | Định nghĩa Rollout, canary steps và gắn AnalysisTemplate |
| `k8s-api/analysis-template.yaml` | Query Prometheus để kiểm tra success rate >= 95% |
| `k8s-api/prometheus-rule.yaml` | Alert `ApiSuccessRateLow` khi success rate thấp hơn ngưỡng |
| `k8s-api/servicemonitor.yaml` | Cho Prometheus scrape endpoint `/metrics` của app |
| `app/app.py` | Flask API, có inject lỗi bằng biến `ERROR_RATE` |

---

## 4. Evidence 1 — GitOps/App of Apps

### Mục tiêu chứng minh

- Có ArgoCD root app.
- Các app con được quản lý bằng Git.
- Trạng thái ArgoCD là `Synced` và `Healthy`.
- Không cần apply từng app bằng tay sau khi root đã tồn tại.

### Lệnh kiểm tra

```bash
kubectl -n argocd get applications
```

### Kết quả mong muốn

```text
NAME                    SYNC STATUS   HEALTH STATUS
root                    Synced        Healthy
api                     Synced        Healthy
kube-prometheus-stack   Synced        Healthy
argo-rollouts           Synced        Healthy
backend                 Synced        Healthy
frontend                Synced        Healthy
web                     Synced        Healthy
```

### Ảnh cần chụp

![GitOps/App of Apps](Screen_evidence/Screenshot%202026-06-12%20095845.png)

### Nhận xét

Repo đang dùng đúng mô hình **App of Apps**:

```yaml
# argocd/root.yaml
source:
  repoURL: https://github.com/nhatphanhk/gitops.git
  path: argocd/apps
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

Điều này chứng minh ArgoCD lấy Git làm source of truth và tự đồng bộ các Application con.

---

## 5. Evidence 2 — App API chạy trong Kubernetes

### Mục tiêu chứng minh

- App `api` chạy trong namespace `demo`.
- App chạy bằng Argo Rollouts, không chỉ là Deployment thường.
- Pod có readiness/liveness probe.
- Service `api` và `api-canary` tồn tại.

### Lệnh kiểm tra

```bash
kubectl -n demo get rollout
kubectl -n demo get pods -l app=api
kubectl -n demo get svc api api-canary
kubectl -n demo describe rollout api
```

### Kết quả mong muốn

```text
NAME   DESIRED   CURRENT   UP-TO-DATE   AVAILABLE
api    4         4         4            4
```

```text
NAME                  TYPE        CLUSTER-IP      PORT(S)
api                   ClusterIP   ...             80/TCP
api-canary            ClusterIP   ...             80/TCP
```

### Ảnh cần chụp

- Ảnh `kubectl -n demo get rollout`.
![](Screen_evidence/Screenshot%202026-06-12%20095845.png)
- Ảnh `kubectl -n demo get pods -l app=api`.
![](Screen_evidence/Screenshot%202026-06-12%20095936.png)
- Ảnh `kubectl -n demo get svc api api-canary`.
![](Screen_evidence/Screenshot%202026-06-12%20100057.png)

### Nhận xét

File `k8s-api/rollout.yaml` có:

```yaml
kind: Rollout
replicas: 4
strategy:
  canary:
    stableService: api
    canaryService: api-canary
    steps:
      - setWeight: 25
      - pause:
          duration: 1m
      - setWeight: 50
      - pause:
          duration: 1m
      - setWeight: 100
```

Điều này chứng minh app được release theo canary thay vì update 100% ngay lập tức.

---

## 6. Evidence 3 — App có metrics và Prometheus scrape được

### Mục tiêu chứng minh

- App có endpoint `/metrics`.
- Prometheus scrape được metric của app.
- ServiceMonitor đã được tạo đúng.

### Lệnh kiểm tra trong Kubernetes

```bash
kubectl -n monitoring get servicemonitor api
kubectl -n monitoring describe servicemonitor api
kubectl -n monitoring get pods
```

### Port-forward Prometheus

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-prometheus 9090:9090
```

Mở trình duyệt:

```text
http://localhost:9090
```

### Prometheus query kiểm tra metric

```promql
flask_http_request_total{namespace="demo"}
```

Hoặc:

```promql
sum(rate(flask_http_request_total{namespace="demo"}[1m]))
```

### Kết quả mong muốn

- Prometheus trả về time-series của app `api`.
- Metric tăng khi có traffic vào service `api`.

### Tạo traffic test

```bash
kubectl -n demo run load --image=busybox --restart=Never -- \
  sh -c "while true; do wget -qO- http://api/; sleep 0.2; done"
```

### Ảnh cần chụp

- Ảnh Prometheus query `flask_http_request_total{namespace="demo"}` có dữ liệu.
![](Screen_evidence/Screenshot%202026-06-12%20100352.png)

### Nhận xét

File `app/app.py` dùng `prometheus_flask_exporter`, tự expose `/metrics`. File `k8s-api/servicemonitor.yaml` chỉ định Prometheus scrape path `/metrics` mỗi 15 giây.

---

## 7. Evidence 4 — SLO success rate >= 95%

### SLO đã chọn

```text
API success rate >= 95%
```

### Ý nghĩa

```text
Success rate = số request không lỗi 5xx / tổng số request
```

### Prometheus query

```promql
sum(rate(flask_http_request_total{namespace="demo",status!~"5.."}[5m]))
/
sum(rate(flask_http_request_total{namespace="demo"}[5m]))
```

### Kết quả mong muốn khi bản tốt

```text
>= 0.95
```

Ví dụ:

```text
0.99 = 99% request thành công
```

### Ảnh cần chụp

- Ảnh Prometheus chạy query success rate.
- Giá trị query phải lớn hơn hoặc bằng `0.95` khi app đang chạy bản tốt.
![](Screen_evidence/Screenshot%202026-06-12%20100603.png)

### Nhận xét

SLO này phù hợp với challenge vì đo trực tiếp trải nghiệm người dùng: request thành công hay lỗi, thay vì chỉ đo CPU/RAM.

---

## 8. Evidence 5 — Alert khi SLO bị vi phạm và gửi email

### Mục tiêu chứng minh

- Có PrometheusRule `ApiSuccessRateLow`.
- Alert chuyển sang trạng thái `Firing` khi success rate thấp hơn 95%.
- Alertmanager gửi email cảnh báo về email cá nhân.

### Lệnh kiểm tra PrometheusRule

```bash
kubectl -n monitoring get prometheusrule api-slo
kubectl -n monitoring describe prometheusrule api-slo
```

### Nội dung alert trong repo

```yaml
alert: ApiSuccessRateLow
expr: |
  (
    sum(rate(flask_http_request_total{namespace="demo",status!~"5.."}[1m]))
    /
    sum(rate(flask_http_request_total{namespace="demo"}[1m]))
  ) < 0.95
for: 5m
labels:
  severity: critical
```

### Port-forward Alertmanager

```bash
kubectl -n monitoring port-forward svc/kube-prometheus-stack-alertmanager 9093:9093
```

Mở:

```text
http://localhost:9093
```

### Cách tạo lỗi để alert fire

Sửa `k8s-api/rollout.yaml`:

```yaml
- name: VERSION
  value: "v3"
- name: ERROR_RATE
  value: "0.6"
```

Commit và push:

```bash
git add k8s-api/rollout.yaml
git commit -m "release: v3 bad release"
git push
```

Sau đó tạo traffic:

```bash
kubectl -n demo run load --image=busybox --restart=Never -- \
  sh -c "while true; do wget -qO- http://api/; sleep 0.2; done"
```

### Kết quả mong muốn

```text
Alert name: ApiSuccessRateLow
State: Firing
Receiver: email-alert
Email received: yes
```

### Ảnh cần chụp

- Ảnh Alertmanager có `ApiSuccessRateLow` trạng thái `Firing`.
- Ảnh email nhận được cảnh báo.
![](Screen_evidence/Screenshot%202026-06-12%20101051.png)

### Lưu ý bảo mật

Trong evidence không nên chụp hoặc ghi rõ mật khẩu SMTP/App Password. Nếu đã lộ trong repo, nên rotate Gmail App Password sau khi nộp bài.

---

## 9. Evidence 6 — Canary bản tốt lên 100%

### Mục tiêu chứng minh

- Khi bản mới không lỗi, Rollout tăng traffic theo từng bước.
- AnalysisTemplate kiểm tra metric thành công.
- Bản mới lên 100%.

### Cách test bản tốt

Sửa `k8s-api/rollout.yaml`:

```yaml
- name: VERSION
  value: "v2"
- name: ERROR_RATE
  value: "0"
```

Commit và push:

```bash
git add k8s-api/rollout.yaml
git commit -m "release: v2 good release"
git push
```

Theo dõi Rollout:

```bash
kubectl argo rollouts get rollout api -n demo --watch
```

Hoặc:

```bash
kubectl -n demo describe rollout api
kubectl -n demo get analysisrun
```

### Kết quả mong muốn

```text
setWeight 25% -> Analysis Successful
setWeight 50% -> Analysis Successful
setWeight 100% -> Rollout Healthy
```

### Ảnh cần chụp

- Ảnh `kubectl -n demo get analysisrun` có trạng thái `Successful`.
- Ảnh Rollout cuối cùng `Healthy`.
![](Screen_evidence/Screenshot%202026-06-12%20101356.png)

### Nhận xét

Bản tốt được promote tự động dựa trên metric, không cần người bấm promote thủ công.

---

## 10. Evidence 7 — Canary bản lỗi tự abort

### Mục tiêu chứng minh

- Khi bản mới có lỗi cao, AnalysisTemplate fail.
- Rollout tự động abort.
- Stable version được giữ lại.
- Không cần rollback tay bằng `kubectl`.

### Cách test bản lỗi

Sửa `k8s-api/rollout.yaml`:

```yaml
- name: VERSION
  value: "v3"
- name: ERROR_RATE
  value: "0.6"
```

Commit và push:

```bash
git add k8s-api/rollout.yaml
git commit -m "release: v3 bad release 60 percent error"
git push
```

Theo dõi:

```bash
kubectl argo rollouts get rollout api -n demo --watch
kubectl -n demo get analysisrun
kubectl -n demo describe rollout api
```

### Kết quả mong muốn

```text
AnalysisRun Failed

Rollout Aborted

Canary version không lên 100%
Stable version vẫn phục vụ traffic chính
```

### Ảnh cần chụp

- Ảnh `AnalysisRun` trạng thái `Failed`.
![](Screen_evidence/Screenshot%202026-06-12%20101907.png)
- Ảnh Rollout hiển thị `Aborted` hoặc không promote lên 100%.
![](Screen_evidence/Screenshot%202026-06-12%20102030.png)
- Ảnh Alertmanager/email nếu alert cũng fire trong quá trình lỗi.
![](Screen_evidence/Screenshot%202026-06-12%20102341.png)

### Nhận xét

Đây là phần quan trọng nhất của challenge: hệ thống có khả năng tự bảo vệ khi release lỗi.

---

## 11. Evidence 8 — Rollback bằng Git revert dưới 5 phút

### Mục tiêu chứng minh

- Rollback không dùng `kubectl rollout undo`.
- Rollback bằng cách sửa source of truth trong Git.
- ArgoCD tự sync cụm về commit cũ.

### Lệnh rollback

```bash
git log --oneline -5
git revert HEAD --no-edit
git push
```

### Theo dõi sau rollback

```bash
kubectl -n argocd get applications api
kubectl argo rollouts get rollout api -n demo --watch
kubectl -n demo get pods -l app=api
```

### Kết quả mong muốn

```text
ArgoCD api: Synced/Healthy
Rollout api: Healthy
VERSION quay về bản ổn định
Thời gian rollback < 5 phút
```

### Ảnh cần chụp

- Ảnh `git log --oneline` trước/sau revert.
- Ảnh ArgoCD app `api` `Synced/Healthy` sau revert.
- Ảnh Rollout trở lại `Healthy`.

### Nhận xét

Rollback bằng `git revert` là đúng GitOps vì thay đổi source of truth trước, sau đó ArgoCD đưa cụm về đúng trạng thái trong Git.

---

## 12. Evidence 9 — CI validate manifest trên Pull Request

### Mục tiêu chứng minh

- Có workflow validate manifest.
- CI chỉ validate, không deploy trực tiếp.
- Deploy do ArgoCD thực hiện sau khi manifest vào Git.

### File workflow

```text
github/workflows/validate.yml
```

### Nội dung chính

```yaml
name: validate
on:
  pull_request:
    paths:
      - "k8s/**"
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: kubeconform -strict -summary k8s/
```

### Ảnh cần chụp

- Ảnh GitHub Actions workflow `validate` chạy thành công.
- Nếu có branch protection: ảnh PR yêu cầu status check trước khi merge.

### Nhận xét

CI đóng vai trò gác cổng chất lượng YAML. CD vẫn do ArgoCD đảm nhiệm theo GitOps pull model.

---

## 13. Checklist nộp bài

| STT | Evidence | Trạng thái |
|---:|---|---|
| 1 | ArgoCD apps `Synced/Healthy` | ☐ |
| 2 | Root app-of-apps quản lý app con | ☐ |
| 3 | App `api` chạy bằng Rollout trong namespace `demo` | ☐ |
| 4 | Service `api` và `api-canary` tồn tại | ☐ |
| 5 | Prometheus scrape được `/metrics` | ☐ |
| 6 | Query SLO success rate >= 95% khi bản tốt | ☐ |
| 7 | Alert `ApiSuccessRateLow` chuyển `Firing` khi inject lỗi | ☐ |
| 8 | Email cảnh báo được gửi về email cá nhân | ☐ |
| 9 | Bản tốt canary lên 100% | ☐ |
| 10 | Bản lỗi canary tự abort | ☐ |
| 11 | Rollback bằng `git revert` dưới 5 phút | ☐ |
| 12 | CI validate manifest trên PR | ☐ |

---

## 14. Kết luận

Repo `gitops.zip` đã thể hiện đầy đủ các yêu cầu chính của challenge:

- **GitOps:** ArgoCD root app-of-apps quản lý các Application con từ Git.
- **Observability:** App Flask có `/metrics`, Prometheus scrape qua ServiceMonitor.
- **SLO:** success rate của API được tính bằng Prometheus query.
- **Alert:** PrometheusRule `ApiSuccessRateLow` cảnh báo khi success rate thấp hơn 95% và gửi qua Alertmanager email.
- **Canary:** Argo Rollouts release theo từng bước 25% → 50% → 100%.
- **Auto-abort:** AnalysisTemplate dùng Prometheus query để fail bản lỗi và abort rollout.
- **Rollback:** dùng `git revert`, đúng nguyên tắc Git là source of truth.

> Lưu ý cuối: trước khi nộp, nên thay hoặc rotate Gmail App Password vì file cấu hình monitoring có thông tin SMTP. Không nên để credential thật trong repo public.
