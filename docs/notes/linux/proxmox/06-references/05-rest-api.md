---
title: "Proxmox REST API 완전 정복"
date: 2026-04-16
lastmod: 2026-04-16
author: "Davi"
description: "인증(Ticket vs API Token), 엔드포인트 구조, 비동기 Task 추적(UPID), 핵심 시나리오 5가지, CMP 테스터 관점의 디버깅 전략까지."
section: "notes"
category: "proxmox/references"
tags: [proxmox, rest-api, authentication, ticket, api-token, upid, task, curl, pvesh, cmp]
order: 5
series: "Proxmox VE 학습 시리즈"
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

> **기준 환경:** Proxmox VE 9.1 / Cluster `test` (3 Nodes)
> **API Base URL:** `https://<node-ip>:8006/api2/json/`
> **공식 API Viewer:** https://pve.proxmox.com/pve-docs/api-viewer/

---

## 1. 왜 REST API인가 — CMP 테스터의 관점

CMP가 Proxmox를 제어하는 방법은 오직 REST API뿐이다. Web UI도, Proxmox CLI(`qm`, `pvecm` 등)도 내부적으로는 REST API를 호출한다. CMP 백엔드가 Proxmox에 명령을 내리려면 HTTP 요청을 보내는 것 외에는 방법이 없다.

**이 사실이 테스터에게 의미하는 바:** CMP UI에서 버그가 발생했을 때, 문제의 출처는 세 곳 중 하나다.

1. **CMP 프론트엔드:** UI가 사용자 입력을 잘못 수집했거나, API 응답을 잘못 표시했다
2. **CMP 백엔드:** Proxmox API를 잘못된 파라미터로 호출했거나, 응답을 잘못 해석했다
3. **Proxmox 자체:** API 자체가 예상과 다른 동작을 했거나, Proxmox 환경에 문제가 있다

이 셋을 구분해내는 유일한 방법은 **테스터가 직접 Proxmox API를 호출해서 재현 여부를 확인하는 것**이다. CMP UI에서 실패한 작업을 curl로 직접 호출해서 성공한다면 문제는 CMP 쪽이고, 직접 호출해도 실패한다면 Proxmox나 환경 쪽이다.

### 1.1 Web UI / CLI / API의 관계

세 인터페이스는 전부 하나의 API를 감싸는 껍데기다:

```markdown
┌─────────────────────────────────────────────────────────────┐
│  Web UI (JavaScript, ExtJS)                                 │
│  → /api2/extjs/ 엔드포인트로 HTTP 요청                       │
├─────────────────────────────────────────────────────────────┤
│  Proxmox CLI (qm, pvecm, pvesm 등) — Perl 기반              │
│  → pvesh 유틸리티 → /api2/json/ 호출 또는 직접 API 함수 호출  │
├─────────────────────────────────────────────────────────────┤
│  외부 시스템 (CMP 백엔드, Terraform, Ansible 등)             │
│  → /api2/json/ 엔드포인트로 HTTP 요청                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │  pveproxy (HTTP 서버, :8006)  │
                └──────────────┬───────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │  pvedaemon (실제 작업 수행자)  │
                └──────────────────────────────┘
```

모든 길은 pveproxy로 통한다.

> **`pvesh` — CLI에서 REST API를 직접 호출하는 유틸리티**
>
> Proxmox는 `pvesh`라는 강력한 도구를 기본 제공한다. curl 없이도 API를 호출할 수 있고, 로컬 노드에서는 인증도 자동 처리된다.
>
> ```bash
> pvesh get /nodes                                   # 전체 노드 목록 조회
> pvesh get /cluster/resources                       # 클러스터 리소스 조회
> pvesh create /nodes/kcy0122/qemu --vmid 999 --memory 1024   # VM 생성
> ```
>
> 테스터 관점에서 `pvesh`는 'API 탐험 도구'로 최고다. 실제 CMP 백엔드가 curl을 쓰든 Python requests를 쓰든, 어차피 내부적으로 보내는 HTTP 요청은 동일하기 때문에 `pvesh`로 먼저 동작을 확인한 후 CMP가 어떻게 호출하는지 비교하면 된다.

### 1.2 API Viewer — 엔드포인트 전체 지도

Proxmox는 공식 API 문서를 인터랙티브 웹 페이지로 제공한다.

- **공식:** https://pve.proxmox.com/pve-docs/api-viewer/
- **로컬 클러스터:** `https://<node-ip>:8006/pve-docs/api-viewer/index.html` (현재 버전에 정확히 맞는 문서)

API Viewer 구조:

- **트리 구조:** `/access`, `/cluster`, `/nodes`, `/pools`, `/storage` 최상위 경로가 펼쳐짐
- **메소드별 분류:** 각 엔드포인트마다 GET, POST, PUT, DELETE 지원 여부 표시
- **파라미터 명세:** 타입(string, integer, boolean), 필수/선택, 기본값, 유효 범위 명시
- **권한 요구사항:** 해당 엔드포인트를 호출하려면 어떤 권한이 필요한지 표시

> **테스터 팁:** CMP의 특정 기능이 어떤 API를 호출하는지 파악하려면, 해당 기능을 Web UI에서 실행한 후 브라우저 개발자 도구(F12)의 Network 탭에서 HTTP 요청을 관찰하면 된다. `/api2/extjs/...`로 시작하는 요청의 엔드포인트 경로를 복사해서 API Viewer에서 찾으면 명세를 확인할 수 있다.

---

## 2. 인증 — 두 가지 방식 완전 이해

### 2.1 Ticket 기반 인증 (세션 인증)

사용자가 username/password로 로그인하면 서버가 **티켓(Ticket)**이라는 서명된 문자열을 돌려준다. 이후 요청마다 이 티켓을 쿠키(Cookie)로 실어 보낸다. Web UI 로그인이 바로 이 방식이다.

#### 티켓 발급

```bash
curl -k \
  -d "username=root@pam&password=YOUR_PASSWORD" \
  https://10.10.250.119:8006/api2/json/access/ticket

# 응답
# {
#   "data": {
#     "username": "root@pam",
#     "ticket": "PVE:root@pam:68001234::abcDEFgh...",
#     "CSRFPreventionToken": "68001234:hAshV4lue...",
#     "cap": { ... }
#   }
# }
```

응답에서 `ticket`과 `CSRFPreventionToken` 두 값을 받는다.

#### 발급받은 티켓으로 요청

**GET 요청 (읽기) — Cookie만 필요:**

```bash
curl -k \
  -b "PVEAuthCookie=PVE:root@pam:68001234::abcDEFgh..." \
  https://10.10.250.119:8006/api2/json/nodes
```

**POST/PUT/DELETE 요청 (쓰기) — Cookie + CSRF 헤더 모두 필요:**

```bash
curl -k -X POST \
  -b "PVEAuthCookie=PVE:root@pam:68001234::abcDEFgh..." \
  -H "CSRFPreventionToken: 68001234:hAshV4lue..." \
  -d "vmid=999&memory=1024" \
  https://10.10.250.119:8006/api2/json/nodes/kcy0122/qemu
```

> **⚠ CSRF 토큰 누락 — 가장 자주 만나는 에러**
>
> 상태 변경(POST/PUT/DELETE) 요청에서 `CSRFPreventionToken` 헤더를 빠뜨리면 `HTTP 401 Permission denied - invalid csrf token` 에러가 발생한다. 티켓은 **Cookie**로, CSRF 토큰은 **Header**로 — 위치가 다르다. 또 티켓과 CSRF 토큰은 **동일한 발급 세트**에서 나와야 한다. 각각 따로 요청하면 매치가 안 된다.

#### 티켓의 수명과 한계

- **유효 기간:** 기본 2시간. 이후 재발급 필요
- **갱신(Refresh):** 만료 전에 동일 엔드포인트로 기존 티켓을 쿠키에 담아 POST하면 새 티켓을 받을 수 있음
- **한계:** 주기적 재발급이 필요하므로 장기 실행되는 자동화 시스템(예: CMP 백엔드)에 부적합

### 2.2 API Token 기반 인증 (권장)

2019년 Proxmox VE 6.0에서 도입된 방식. 사용자에 종속되지만 별도의 영구 토큰을 발급받아 세션 없이 API를 호출한다. CMP 같은 장기 실행 시스템의 표준 방식이다.

#### API Token 생성

**Web UI 경로:** `Datacenter → Permissions → API Tokens → Add`

- **User:** 토큰을 소유할 사용자 (예: `root@pam` 또는 별도의 `cmp-service@pve`)
- **Token ID:** 토큰 식별자 (예: `cmp-backend`)
- **Privilege Separation:** 체크 시 소유자 권한의 부분집합으로 제한. 미체크 시 소유자 전체 권한 상속
- **Expire:** 만료일 (선택)

**생성 직후 딱 한 번 Secret이 표시된다.** 놓치면 토큰을 다시 만들어야 한다. 절대 로그나 Git 저장소에 남기지 말 것.

**CLI로 토큰 생성:**

```bash
# 토큰 생성 (Privilege Separation 활성화)
pveum user token add root@pam cmp-backend --privsep=1

# 응답
# ┌──────────────┬──────────────────────────────────────┐
# │ key          │ value                                │
# ╞══════════════╪══════════════════════════════════════╡
# │ full-tokenid │ root@pam!cmp-backend                 │
# │ info         │ {"privsep":"1"}                      │
# │ value        │ a1b2c3d4-5e6f-7890-abcd-ef1234567890 │  ← Secret
# └──────────────┴──────────────────────────────────────┘

# 토큰에 권한 부여
pveum acl modify / --tokens 'root@pam!cmp-backend' --roles PVEVMAdmin
```

#### API Token으로 요청

```bash
# GET 요청
curl -k \
  -H "Authorization: PVEAPIToken=root@pam!cmp-backend=a1b2c3d4-5e6f-7890-abcd-ef1234567890" \
  https://10.10.250.119:8006/api2/json/nodes

# POST 요청 — CSRF 토큰 불필요
curl -k -X POST \
  -H "Authorization: PVEAPIToken=root@pam!cmp-backend=a1b2c3d4-..." \
  -d "vmid=999&memory=1024" \
  https://10.10.250.119:8006/api2/json/nodes/kcy0122/qemu
```

> **API Token이 CSRF 토큰을 요구하지 않는 이유**
>
> CSRF는 '이미 로그인된 사용자의 브라우저가 악의적인 사이트에서 Proxmox로 요청을 보내는 것'을 막기 위한 방어다. 티켓은 브라우저 쿠키에 저장되므로 이런 공격의 표적이 된다. API Token은 브라우저 쿠키에 저장되지 않고 명시적으로 `Authorization` 헤더에 담아야 하므로 CSRF 공격의 대상이 될 수 없다.

### 2.3 두 방식 비교

| 항목 | Ticket (세션) | API Token |
| ---- | ------------- | --------- |
| 인증 단위 | username/password | `user!tokenID=secret` |
| HTTP 위치 | Cookie 헤더 | Authorization 헤더 |
| CSRF 필요 | 쓰기 요청 시 필요 | 불필요 |
| 수명 | 기본 2시간 | 설정 기반 (영구 또는 만료일) |
| 갱신 | 재로그인 또는 refresh | 불필요 |
| 2FA | 지원 | 미지원 |
| 용도 | 사용자 로그인 (Web UI) | 프로그램 접근 (CMP 백엔드) |
| 권한 분리 | 없음 (사용자 전체 권한) | Privilege Separation 지원 |

---

## 3. API 엔드포인트 구조

### 3.1 최상위 경로

| 경로 | 내용 |
| ---- | ---- |
| `/access` | 인증, 사용자/그룹 관리, 권한(ACL), 역할(Role), API Token, 2FA, LDAP/OIDC |
| `/cluster` | 클러스터 레벨 리소스: 백업 스케줄, 방화벽, HA 리소스, 전체 리소스 조회, SDN, 복제 |
| `/nodes` | 개별 노드 관리. VM/CT CRUD, 스토리지, 네트워크, Task 추적, 로그 조회 등 |
| `/pools` | 리소스 풀 — VM/CT를 그룹화하는 논리 단위 |
| `/storage` | 클러스터 전체 스토리지 설정 조회/변경 |
| `/version` | Proxmox 버전 정보 조회 |

### 3.2 `/nodes` 하위 구조

CMP 백엔드가 가장 많이 호출하는 영역은 `/nodes/{node}` 하위다. 이 계층을 익히면 전체 API의 70%는 장악한 것이다.

```markdown
/nodes/{node}/
├── qemu/              ← VM 관리 (KVM)
│   ├── {vmid}/
│   │   ├── status/    ← VM 상태 조회, start, stop, shutdown 등
│   │   ├── config     ← VM 설정 조회/변경
│   │   ├── snapshot/  ← 스냅샷 관리
│   │   ├── clone      ← 복제
│   │   ├── migrate    ← 마이그레이션
│   │   └── agent/     ← QEMU Guest Agent 명령
│   └── (POST)         ← 새 VM 생성
├── lxc/               ← LXC 컨테이너 관리 (qemu와 유사한 구조)
├── storage/           ← 노드의 스토리지 상태, 내용 조회
├── network/           ← 네트워크 인터페이스 관리
├── tasks/             ← Task 목록 및 상태 조회 (핵심!)
├── status             ← 노드 상태 조회 (CPU, 메모리, 업타임)
├── syslog             ← 시스템 로그 조회
└── vzdump             ← 백업 실행
```

### 3.3 HTTP 메소드 의미 규약

| 메소드 | 의미 |
| ------ | ---- |
| **GET** | 조회(Read). 부작용 없음. 여러 번 호출해도 같은 결과 |
| **POST** | 생성(Create) 또는 특정 동작(Action) 실행. 예: VM 생성, 시작, 마이그레이션 |
| **PUT** | 전체 업데이트 또는 설정 변경. 예: VM config 수정 |
| **DELETE** | 삭제. 예: VM 삭제, 스냅샷 삭제 |

> **POST가 두 가지 용도로 쓰이는 이유**
>
> REST 순수주의 관점에서 POST는 '생성'만 해야 하지만, Proxmox는 '동작 실행'에도 POST를 사용한다. 예: `POST /nodes/{node}/qemu/{vmid}/status/start` (VM 시작). GET은 부작용이 없어야 하는데, VM 시작은 상태 변경이라는 부작용이 있으므로 POST로 구현된 것이다.
>
> CMP 테스트 시 non-idempotent 요청(같은 요청을 여러 번 보내면 문제가 생기는 요청)에 재시도(Retry) 로직이 있는지 반드시 확인해야 한다.

---

## 4. 응답 구조 — 세 가지 형태

### 4.1 형태 1 — 즉시 데이터 반환 (GET 요청의 기본)

```json
// GET /nodes
{
  "data": [
    {"node": "pve",     "status": "online", "cpu": 0.02, "maxmem": 8589934592},
    {"node": "pve-ksy", "status": "online"},
    {"node": "kcy0122", "status": "online"}
  ]
}
```

모든 응답은 `{"data": ...}` 구조로 감싸진다. 실제 결과는 `data` 필드에 들어 있다.

### 4.2 형태 2 — 비동기 Task ID 반환 (UPID)

VM 생성, 마이그레이션, 백업 같은 시간이 걸리는 작업은 즉시 완료되지 않는다. Proxmox는 요청을 받으면 즉시 응답하되, 결과 대신 Task 식별자를 돌려준다.

```json
// POST /nodes/kcy0122/qemu (VM 생성 요청)
{
  "data": "UPID:kcy0122:00001234:00005678:68001ABC:qmcreate:999:root@pam:"
}
```

**UPID(Unique Process ID) 구조:**

| 필드 | 값 (예시) | 의미 |
| ---- | --------- | ---- |
| 접두사 | `UPID` | 이것이 UPID임을 나타냄 |
| 노드 | `kcy0122` | 작업이 실행된 노드 이름 |
| PID | `00001234` | Process ID (16진수) |
| PID 시작 틱 | `00005678` | 16진수 |
| 시작 타임스탬프 | `68001ABC` | Unix 타임스탬프 (16진수) |
| 작업 유형 | `qmcreate` | qmstart, qmdestroy, vzdump, qmigrate 등 |
| 대상 ID | `999` | VM이면 VMID |
| 사용자 | `root@pam` | 작업을 실행한 사용자 |

이 UPID를 사용해서 작업의 진행 상황과 최종 결과를 추적한다.

### 4.3 형태 3 — 에러 응답

```json
// 권한 부족 시
// HTTP/1.1 403 Forbidden
{
  "data": null,
  "errors": {
    "Permission check failed": "user root@pam has no permission on /vms/999"
  }
}
```

주요 HTTP 상태 코드:

| 코드 | 의미 |
| ---- | ---- |
| 200 OK | 정상 응답 |
| 400 Bad Request | 파라미터 오류 (필수 값 누락, 타입 불일치, 유효하지 않은 값) |
| 401 Unauthorized | 인증 실패 (티켓 만료, 잘못된 토큰, CSRF 토큰 누락) |
| 403 Forbidden | 인증은 됐지만 권한 부족 |
| 404 Not Found | 리소스 없음 (존재하지 않는 VMID, 노드, 경로) |
| 500 Internal Server Error | Proxmox 내부 오류 |
| 595 Service Unavailable | 노드 연결 실패 (클러스터 내 다른 노드 응답 없음) |

---

## 5. 비동기 Task 추적 — CMP의 심장부

### 5.1 왜 비동기인가

VM 생성은 단순히 설정 파일 하나 쓰는 것이 아니다. 디스크 할당(수 GB), 설정 파일 생성, 방화벽 규칙 적용, 네트워크 설정 — 이 과정이 몇 초에서 몇 분까지 걸린다. HTTP 요청이 이 전체를 기다리면 타임아웃이 발생한다.

Proxmox의 해법: 요청을 받으면 즉시 "Task를 시작했다"고 응답하고 UPID를 돌려준 뒤, 백그라운드에서 실제 작업을 수행한다. 호출자는 UPID를 이용해 주기적으로 진행 상황을 조회해야 한다.

**CMP 테스터가 여기서 봐야 할 것:** CMP UI에서 "VM 생성 중..." 같은 진행 표시가 나타날 때, 백엔드가 어떻게 이 비동기 작업을 추적하고 있는지. 이 추적 로직에 버그가 있으면 "실제로는 완료됐는데 UI는 영원히 로딩 중", 또는 "실패했는데 UI는 성공 표시" 같은 문제가 생긴다.

### 5.2 Task 상태 조회 API

#### Task 상태 조회

```bash
# GET /nodes/{node}/tasks/{upid}/status
curl -k -H "Authorization: PVEAPIToken=..." \
  "https://10.10.250.119:8006/api2/json/nodes/kcy0122/tasks/UPID:kcy0122:.../status"

# 실행 중인 응답
# {
#   "data": {
#     "status": "running",
#     "upid": "UPID:kcy0122:...",
#     "node": "kcy0122",
#     "type": "qmcreate",
#     "user": "root@pam",
#     "starttime": 1744444444
#   }
# }

# 완료된 응답
# {
#   "data": {
#     "status": "stopped",
#     "exitstatus": "OK",         ← 성공
#     "starttime": 1744444444,
#     "endtime": 1744444500       ← 완료 시각 추가
#   }
# }
```

핵심 필드: `status`는 `running` 또는 `stopped`. `stopped`가 완료를 의미하며, 이때 `exitstatus` 필드로 성공(`OK`) / 실패를 확인한다.

#### Task 로그 조회

```bash
# GET /nodes/{node}/tasks/{upid}/log
# {
#   "data": [
#     {"n": 1,  "t": "Creating VM 999"},
#     {"n": 2,  "t": "allocated image: local-lvm:vm-999-disk-0, size=32G"},
#     {"n": 50, "t": "TASK OK"}
#   ]
# }
```

작업이 실패했을 때 이 로그에서 원인을 찾을 수 있다. CMP 테스터에게 이 로그는 버그 리포트의 핵심 증거다.

#### Task 목록 조회

```bash
# GET /nodes/{node}/tasks
# 주요 파라미터:
#   typefilter=qmcreate  ← 특정 유형만
#   vmid=999             ← 특정 VM 관련만
#   source=active        ← 실행 중인 것만
#   start=0&limit=50     ← 페이지네이션

curl -k -H "Authorization: ..." \
  "https://10.10.250.119:8006/api2/json/nodes/kcy0122/tasks?source=active"
```

### 5.3 Task 추적 패턴 — 올바른 폴링 전략

CMP 백엔드가 비동기 Task를 추적하는 전형적인 패턴:

```makrdown
1. VM 생성 요청 → UPID 수신
2. DB에 "task={UPID}, status=running" 저장
3. 백그라운드 워커가 주기적으로:
   - GET /tasks/{upid}/status 호출
   - status == "stopped" 인지 확인
   - stopped면 exitstatus를 보고 성공/실패 판정
   - DB 업데이트 → UI에 반영
   - 필요시 Task 로그도 저장 (에러 분석용)
4. 너무 오래 걸리면 (예: 30분 초과) 타임아웃 처리
```

> **⚠ 테스터가 반드시 체크해야 할 비동기 Task 버그 패턴**
>
> 1. 폴링 간격이 너무 짧음 — Proxmox 노드에 과부하 유발
> 2. 폴링 간격이 너무 긺 — 사용자가 UI에서 너무 오래 기다림
> 3. 타임아웃 처리 누락 — 실패한 Task가 '영원히 실행 중'으로 표시됨
> 4. 재시도 로직 오류 — 이미 성공한 Task를 다시 실행 (예: VM 중복 생성)
> 5. Task 로그 누락 — 실패 원인을 디버깅할 수 없음
> 6. 노드 장애 대응 누락 — Task 실행 중 노드가 죽으면 UPID 조회가 영구 실패

---

## 6. 핵심 API 시나리오 5가지

각 시나리오를 직접 실행하면서 요청/응답 전체를 기록해두면, 이후 CMP 테스트 시 비교 기준이 된다.

### 6.1 시나리오 1: VM 목록 조회

```bash
# 방법 A: 클러스터 전체 VM을 한 번에 조회
curl -k -H "Authorization: PVEAPIToken=root@pam!cmp-backend=SECRET" \
  "https://10.10.250.119:8006/api2/json/cluster/resources?type=vm"

# 방법 B: 특정 노드의 VM만
curl -k -H "Authorization: ..." \
  "https://10.10.250.119:8006/api2/json/nodes/kcy0122/qemu"
```

방법 A는 클러스터 차원에서 모든 VM을 한 번에 보여줘 CMP 대시보드에 적합하고, 방법 B는 노드별로 나눠서 조회해야 한다. 성능과 용도가 다르다.

### 6.2 시나리오 2: VM 생성 (비동기 추적 포함)

```bash
# Step 1: VM 생성 요청
curl -k -X POST \
  -H "Authorization: PVEAPIToken=..." \
  -d "vmid=999" \
  -d "name=test-api-vm" \
  -d "memory=1024" \
  -d "cores=1" \
  -d "net0=virtio,bridge=vmbr0" \
  -d "scsi0=local-lvm:8" \
  -d "ostype=l26" \
  "https://10.10.250.119:8006/api2/json/nodes/kcy0122/qemu"
# 응답: {"data":"UPID:kcy0122:..."}

# Step 2: Task 상태 폴링
UPID="UPID:kcy0122:..."
while true; do
  STATUS=$(curl -ks -H "Authorization: ..." \
    "https://.../api2/json/nodes/kcy0122/tasks/$UPID/status" \
    | jq -r ".data.status")
  echo "Status: $STATUS"
  [ "$STATUS" = "stopped" ] && break
  sleep 2
done

# Step 3: 최종 결과 확인
curl -ks -H "Authorization: ..." \
  "https://.../api2/json/nodes/kcy0122/tasks/$UPID/status" | jq .
```

### 6.3 시나리오 3: VM 시작/중지/상태 조회

```bash
# VM 상태 조회 (즉시 응답)
# GET /nodes/kcy0122/qemu/999/status/current

# VM 시작 (비동기, UPID 반환)
# POST /nodes/kcy0122/qemu/999/status/start

# VM 정지 — 두 가지
# POST /nodes/kcy0122/qemu/999/status/stop      ← 강제 종료 (전원 뽑기)
# POST /nodes/kcy0122/qemu/999/status/shutdown  ← graceful (OS에게 shutdown 요청)

# VM 재시작
# POST /nodes/kcy0122/qemu/999/status/reboot
```

**테스터 포인트:** `stop`과 `shutdown`의 차이는 중요하다. `stop`은 전원을 즉시 끊어 데이터 손실 위험이 있고, `shutdown`은 Guest OS에 정상 종료를 요청한다(Guest Agent 필요). CMP UI에 'VM 종료' 버튼이 있을 때 어떤 API를 호출하는지 반드시 확인해야 한다.

### 6.4 시나리오 4: VM 설정 변경 (Config Update)

```bash
# 메모리를 2GB로 증설
curl -k -X PUT \
  -H "Authorization: ..." \
  -d "memory=2048" \
  "https://.../api2/json/nodes/kcy0122/qemu/999/config"

# 여러 항목 동시 변경
curl -k -X PUT \
  -H "Authorization: ..." \
  -d "memory=2048" \
  -d "cores=2" \
  -d "description=Test VM - updated via API" \
  "https://.../api2/json/nodes/kcy0122/qemu/999/config"

# 일부 변경은 즉시 반영되지 않고 VM 재시작 필요
# → 응답의 "pending" 섹션 확인
```

### 6.5 시나리오 5: VM 삭제

```bash
# 주의: VM이 중지된 상태여야 함
curl -k -X DELETE \
  -H "Authorization: ..." \
  "https://.../api2/json/nodes/kcy0122/qemu/999"
# 응답: {"data":"UPID:..."} ← 비동기

# 디스크도 함께 삭제
curl -k -X DELETE \
  -H "Authorization: ..." \
  -d "destroy-unreferenced-disks=1" \
  -d "purge=1" \
  "https://.../api2/json/nodes/kcy0122/qemu/999"
```

---

## 7. 디버깅 및 테스트 전략

### 7.1 요청/응답 전문 캡처

```bash
# 전체 요청/응답 상세 출력
curl -kv -H "Authorization: ..." \
  "https://.../api2/json/nodes" 2>&1

# 응답 헤더만
curl -ksI -H "Authorization: ..." \
  "https://.../api2/json/nodes"

# 상태 코드만 추출
curl -sk -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: ..." \
  "https://.../api2/json/nodes"
```

### 7.2 서버 측 로그 확인

API 요청이 실패했을 때, Proxmox 노드 자체의 로그를 확인하면 원인을 빠르게 찾을 수 있다.

```bash
# pveproxy 로그 (HTTP 요청 레벨)
journalctl -u pveproxy -f

# pvedaemon 로그 (실제 작업 수행 레벨)
journalctl -u pvedaemon -f

# HTTP 접근 로그 (상태 코드 + URL)
tail -f /var/log/pveproxy/access.log

# 에러 로그
tail -f /var/log/pveproxy/error.log
```

**디버깅 워크플로우:** CMP UI에서 문제 재현 → 브라우저 F12로 어떤 API를 호출했는지 확인 → 그 API를 curl로 직접 호출해서 재현 → 재현되면 pveproxy 로그 확인 → 원인에 따라 티켓 분류 (CMP 문제 / Proxmox 문제 / 환경 문제).

### 7.3 Postman / Insomnia 활용

curl만으로 복잡한 시나리오를 테스트하는 건 한계가 있다.

- **Environment 변수:** API Token, base URL을 변수로 저장하여 재사용
- **Collection:** 자주 쓰는 요청을 묶어서 관리
- **Tests 스크립트:** 응답 필드에 대한 자동 검증(Assertion) 작성
- **Chaining:** 요청 1의 응답에서 UPID를 뽑아 요청 2에 자동 전달

**권장 Collection 구조:** Auth (Ticket 발급, Token 테스트) → Node Info (버전, 상태, 리소스) → VM Lifecycle (생성, 조회, 시작, 정지, 삭제) → Task Tracking → Edge Cases (권한 오류, 존재하지 않는 VMID 등).

### 7.4 Rate Limiting과 연결 관리

`pveproxy`는 기본적으로 동시 연결 수에 제한이 있다. CMP가 수백 개의 VM을 동시에 조회하려 하면 연결이 거부되거나 느려질 수 있다.

```bash
# 동시 요청으로 간단한 부하 테스트
for i in {1..50}; do
  curl -sk -H "Authorization: ..." \
    "https://.../api2/json/cluster/resources" &
done
wait
# 고급 부하 테스트: hey, wrk, k6 같은 도구 사용
```

---

## 8. CMP 테스트에서 API 지식 활용

### 8.1 전형적인 CMP ↔ Proxmox 상호작용 패턴

```markdown
사용자가 CMP UI에서 'VM 생성' 버튼 클릭
      │
      ▼
CMP Frontend → CMP Backend API 호출 (POST /cmp/api/vms)
      │
      ▼
CMP Backend가:
  1) 사용자 권한 검증
  2) 요청 파라미터 검증 (리소스 쿼터, 네이밍 규칙)
  3) CMP DB에 'pending' 상태로 레코드 생성
  4) Proxmox API 호출 (POST /nodes/{node}/qemu)
  5) UPID 수신, DB에 저장
      │
      ▼
CMP Backend가 응답 반환 (UI에 'Creating...' 표시)

별도 워커 프로세스:
  - 주기적으로 UPID 상태 폴링
  - 완료 시 CMP DB 업데이트
  - WebSocket으로 UI에 실시간 알림
```

### 8.2 테스터가 찾아야 할 버그 유형

| 버그 유형 | 재현/진단 방법 |
| --------- | -------------- |
| 권한 우회 | 일반 사용자 토큰으로 다른 사용자의 VM 조작 API를 직접 호출해서 성공 여부 확인 |
| 파라미터 검증 누락 | CMP UI에서는 막혀 있는 값(음수 CPU, 거대한 디스크)을 API로 직접 보내서 시도 |
| 상태 불일치 (Drift) | Proxmox에서 직접 `qm destroy` → CMP UI가 여전히 해당 VM을 보여주는지 확인 |
| Task 추적 실패 | VM 생성 중 해당 Proxmox 노드를 강제 종료 → CMP가 '영원히 생성 중'이 되는지 확인 |
| 동시성 버그 | 같은 VMID로 동시에 두 번 생성 요청 → 양쪽 다 성공하는지 또는 한쪽만 성공하는지 |
| 정리 누락 (Orphan) | 생성 실패한 VM의 흔적(디스크, 설정 파일)이 Proxmox에 남아 있는지 |

### 8.3 버그 재현 스크립트 템플릿

```bash
#!/bin/bash
# CMP 버그 재현 — VM 생성 동시성 시나리오
set -euo pipefail

TOKEN="PVEAPIToken=root@pam!cmp-backend=SECRET"
BASE="https://10.10.250.119:8006/api2/json"
NODE="kcy0122"

# 1. 현재 상태 기록
echo "=== 초기 상태 ==="
curl -sk -H "Authorization: $TOKEN" "$BASE/nodes/$NODE/qemu" \
  | jq "[.data[] | {vmid, name, status}]"

# 2. 동일 VMID로 두 번 연속 생성 시도
for i in 1 2; do
  echo "=== 생성 시도 #$i ==="
  curl -sk -H "Authorization: $TOKEN" \
    -X POST "$BASE/nodes/$NODE/qemu" \
    -d "vmid=999" -d "name=repro-test" \
    -d "memory=512" -d "cores=1" \
    -d "scsi0=local-lvm:2"
  echo
done

# 3. 최종 상태 기록
echo "=== 최종 상태 ==="
curl -sk -H "Authorization: $TOKEN" "$BASE/nodes/$NODE/qemu" \
  | jq "[.data[] | {vmid, name, status}]"

# 4. 정리
echo "=== 정리 ==="
curl -sk -H "Authorization: $TOKEN" -X DELETE \
  "$BASE/nodes/$NODE/qemu/999?purge=1"
```

---

## 9. 학습 점검

### 개념 이해 점검

- Web UI, pvesh, curl이 내부적으로 모두 같은 API를 호출한다는 사실을 설명할 수 있는가?
- Ticket 인증과 API Token 인증의 차이, 각각의 사용 시나리오를 구분할 수 있는가?
- CSRF Prevention Token이 왜 필요하고, 언제 필요한지 설명할 수 있는가?
- API Token의 Privilege Separation 옵션이 무엇을 의미하는지 설명할 수 있는가?
- UPID 문자열의 각 필드가 의미하는 바를 해독할 수 있는가?
- 동기 응답과 비동기 응답(UPID 반환)을 응답 구조만 보고 구분할 수 있는가?
- `stop`과 `shutdown`의 차이를 설명할 수 있는가?

### 실습 완료 점검

- API Token을 생성하고 curl로 인증 성공을 확인했는가?
- Ticket 방식으로도 GET과 POST 요청을 각각 성공시켜 봤는가?
- VM을 API로 생성하고, UPID를 사용해 Task 완료까지 폴링하는 스크립트를 작성했는가?
- VM 시작/정지/설정 변경/삭제를 모두 API로 수행했는가?
- 의도적으로 에러 상황(권한 부족, 존재하지 않는 VMID, 잘못된 파라미터)을 만들어 응답 구조를 확인했는가?
- `pveproxy` 로그를 실시간으로 보면서 API 요청이 어떻게 기록되는지 확인했는가?
- Postman 또는 Insomnia에 Collection을 구성해봤는가?

---

## 참고 자료

| 주제 | URL |
| ---- | --- |
| API Viewer | https://pve.proxmox.com/pve-docs/api-viewer/ |
| Proxmox VE API Wiki | https://pve.proxmox.com/wiki/Proxmox_VE_API |
| User Management | https://pve.proxmox.com/pve-docs/chapter-pveum.html |
| 공식 Perl API Client 소스 | https://git.proxmox.com/?p=pve-apiclient.git |
