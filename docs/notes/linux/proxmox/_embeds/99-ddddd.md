---
title: "references"
date: 2026-04-08
lastmod: 2026-04-10
author: "Davi"
description: "VM 복제와 관련한 Proxmox 개념과 CLI 조작을 다룬다."
slug: "proxmox-vm-destroy"
section: "notes"
category: "linux"
tags: [proxmox, qemu, kvm, rest-api, cloud-init, guest-agent, vzdump, snapshot, clone, backup, restore, template, upid]
order: 999
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 99
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---



## 8. Proxmox REST API 구조

Web UI에서 수행하는 모든 동작은 `https://<host>:8006/api2/json/` 엔드포인트(Endpoint)에 대한 HTTP 요청이다. 브라우저의 개발자 도구(Network 탭)를 열고 Web UI를 조작해 보면, 실제 API 호출이 날아가는 것을 확인할 수 있다.

### 8.1 API 경로 구조

API는 계층적(Hierarchical) 구조를 따른다.

```
/api2/json/
├── access/          ← 인증, 사용자, 권한
│   ├── ticket       ← 로그인 티켓 발급
│   ├── users/
│   └── roles/
├── cluster/         ← 클러스터 전체 설정
│   ├── backup/      ← 백업 작업 스케줄
│   └── resources/   ← 클러스터 자원 목록
├── nodes/           ← 노드별 조작
│   └── {node}/
│       ├── qemu/    ← QEMU VM 관련
│       │   └── {vmid}/
│       │       ├── status/     ← 시작/정지/리셋
│       │       ├── snapshot/   ← 스냅샷 관리
│       │       ├── clone       ← 복제
│       │       ├── config      ← VM 설정 조회/변경
│       │       └── agent/      ← Guest Agent 통신
│       ├── storage/
│       └── tasks/   ← 비동기 태스크 상태
├── storage/
└── pools/
```

### 8.2 HTTP 메서드 매핑

| HTTP 메서드 | 의미      | 예시                            |
| ----------- | --------- | ------------------------------- |
| GET         | 조회      | VM 목록, 설정 조회, 태스크 상태 |
| POST        | 생성/동작 | VM 생성, 시작, 스냅샷 생성      |
| PUT         | 설정 변경 | VM CPU/RAM 변경                 |
| DELETE      | 삭제      | VM 삭제, 스냅샷 삭제            |

### 8.3 응답 형식

모든 응답은 `data` 키를 루트로 갖는 JSON 객체이다.

```json
{
  "data": {
    "vmid": 100,
    "name": "test-vm",
    "status": "running"
  }
}
```

리스트를 반환할 때는 `data`가 배열이 된다. 비동기 작업을 생성하면 `data`에 UPID 문자열이 반환된다. 이 UPID를 가지고 태스크 상태를 추적한다(후술).

> **공식 API Wiki:** https://pve.proxmox.com/wiki/Proxmox_VE_API
> **비주얼 API 뷰어:** https://pve.proxmox.com/pve-docs/api-viewer/index.html

---

## 9. 인증 체계: PVEAuthCookie vs API Token

Proxmox REST API는 두 가지 인증 방식을 제공한다.

### 9.1 Ticket 기반 인증 (PVEAuthCookie)

**흐름:**

1. `POST /api2/json/access/ticket`에 `username`과 `password`를 전송
2. 응답으로 `ticket`과 `CSRFPreventionToken`을 수령
3. 이후 요청 시 `Cookie: PVEAuthCookie=<ticket>` 헤더에 티켓을 포함
4. 쓰기 요청(POST/PUT/DELETE)에는 `CSRFPreventionToken: <token>` 헤더를 추가로 포함

```bash
# 1단계: 티켓 발급
curl -k -d "username=root@pam&password=yourpassword" \
  https://127.0.0.1:8006/api2/json/access/ticket

# 2단계: 티켓으로 조회
curl -k -b "PVEAuthCookie=PVE:root@pam:..." \
  https://127.0.0.1:8006/api2/json/nodes/kcy0122/qemu

# 3단계: 쓰기 요청 시 CSRF 토큰 필수
curl -k -b "PVEAuthCookie=PVE:root@pam:..." \
  -H "CSRFPreventionToken: ..." \
  -X POST \
  https://127.0.0.1:8006/api2/json/nodes/kcy0122/qemu/100/status/start
```

**특징:**

- 티켓 유효기간은 **2시간**이다. 만료 전에 갱신(Renewal) 가능.
- CSRF 토큰은 쓰기 요청에 반드시 필요하다. 읽기(GET)에는 불필요.
- Web UI가 내부적으로 사용하는 방식이다.
- 2FA(Two-Factor Authentication)가 활성화된 경우, 초기 인증 시 OTP가 필요하지만, 갱신 시에는 불필요.

### 9.2 API Token 기반 인증

**흐름:**

1. Web UI 또는 CLI(`pveum user token add`)로 API Token을 미리 생성
2. 요청 시 `Authorization: PVEAPIToken=USER@REALM!TOKENID=UUID` 헤더를 포함
3. CSRF 토큰 불필요. 별도 로그인 과정 불필요.

```bash
curl -k -H "Authorization: PVEAPIToken=admin@pve!my_token=aaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" \
  https://127.0.0.1:8006/api2/json/nodes/kcy0122/qemu
```

**특징:**

- **무상태(Stateless)**이다. 티켓처럼 만료/갱신 주기를 관리할 필요가 없다.
- 만료일(Expiration Date)을 지정할 수 있고, 개별적으로 폐기(Revoke) 가능.
- 토큰이 유출되어도 해당 토큰만 폐기하면 되고, 사용자 계정 자체에는 영향이 없다.
- **CMP 백엔드(Backend)에서 Proxmox와의 상시 연결에는 API Token을 사용하라.** Ticket 방식은 2시간마다 갱신 로직을 구현해야 하므로 불필요한 복잡도가 추가된다.

### 9.3 토큰 권한 분리 (Privilege Separation)

API Token은 두 가지 권한 모드로 생성할 수 있다.

| 모드                               | 설명                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `privsep=0` (Full Privileges)      | 토큰 권한 = 사용자 권한. 사용자가 할 수 있는 건 뭐든 가능                                                   |
| `privsep=1` (Separated Privileges) | 토큰 권한을 **별도의 ACL로 축소** 가능. 사용자 권한과 토큰 권한의 **교집합(Intersection)**이 유효 권한이 됨 |

예를 들어, `joe@pve` 사용자에게 `PVEVMAdmin` 역할을 부여하고, 모니터링용 토큰에는 `PVEAuditor`만 부여하면, 이 토큰으로는 VM 조회만 가능하고 생성/삭제는 불가능하다.

```bash
# 사용자에게 VM 관리 권한
pveum acl modify /vms -user joe@pve -role PVEVMAdmin

# 모니터링 전용 토큰 생성 (권한 분리 활성화)
pveum user token add joe@pve monitoring -privsep 1

# 토큰에 읽기 전용 권한만 부여
pveum acl modify /vms -token 'joe@pve!monitoring' -role PVEAuditor
```

> **공식 문서:** https://pve.proxmox.com/pve-docs/pveum-plain.html#pveum_tokens

---

## 10. Task 비동기 처리와 UPID

### 10.1 비동기 태스크란

VM 생성, 마이그레이션, 백업, 복제 등 시간이 오래 걸리는 작업은 **비동기(Asynchronous) 태스크**로 처리된다. API를 호출하면 즉시 응답이 돌아오는데, 이때 `data` 필드에는 작업 결과가 아니라 **UPID(Unique Process ID)**가 반환된다.

```json
{
  "data": "UPID:kcy0122:00001234:00005678:663F1A2B:qmclone:100:root@pam:"
}
```

### 10.2 UPID 구조

UPID는 다음 형식을 따른다.

```
UPID:{node}:{pid}:{pstart}:{starttime}:{type}:{id}:{user}:
```

| 필드        | 의미                                                         |
| ----------- | ------------------------------------------------------------ |
| `node`      | 태스크가 실행되는 노드명                                     |
| `pid`       | 프로세스 ID (16진수)                                         |
| `pstart`    | 프로세스 시작 시각 (16진수)                                  |
| `starttime` | 태스크 시작 시각 (16진수, Unix 타임스탬프)                   |
| `type`      | 태스크 종류 (`qmcreate`, `qmclone`, `vzdump`, `qmigrate` 등) |
| `id`        | 대상 VMID                                                    |
| `user`      | 실행 사용자                                                  |

### 10.3 태스크 상태 추적

CMP를 만들 때, 사용자가 "VM 생성" 버튼을 누르면 프론트엔드에 진행상황 표시줄(Progress Bar)을 보여줘야 한다. 이때 UPID를 폴링(Polling)하여 태스크 상태를 추적한다.

```
GET /api2/json/nodes/{node}/tasks/{upid}/status
```

응답 예시:

```json
{
  "data": {
    "status": "running",
    "type": "qmclone",
    "id": "100",
    "node": "kcy0122",
    "user": "root@pam",
    "starttime": 1712448043,
    "upid": "UPID:kcy0122:..."
  }
}
```

`status`가 `stopped`가 되면 태스크가 완료된 것이다. 이때 `exitstatus` 필드로 성공/실패를 확인한다.

```json
{
  "data": {
    "status": "stopped",
    "exitstatus": "OK"
  }
}
```

태스크 로그도 API로 조회할 수 있다.

```
GET /api2/json/nodes/{node}/tasks/{upid}/log
```

### 10.4 CMP 설계 시 고려사항

- 폴링 주기는 1~3초 정도가 적당하다. 너무 짧으면 API에 부하를 주고, 너무 길면 사용자 경험이 나빠진다.
- `exitstatus`가 `OK`가 아니면 에러 메시지를 로그에서 추출하여 사용자에게 보여줘라.
- 태스크 목록 조회(`GET /api2/json/nodes/{node}/tasks`)로 특정 노드의 모든 최근 태스크를 일괄 조회할 수도 있다.

> **공식 API 레퍼런스:** https://pve.proxmox.com/pve-docs/api-viewer/index.html (Tasks 섹션 참고)

---

## 11. QEMU Guest Agent (QGA)

### 11.1 Guest Agent란

QEMU Guest Agent는 **게스트 OS 내부에서 실행되는 데몬(Daemon)**이다. 호스트(Proxmox)와 게스트(VM 내부 OS) 사이에 통신 채널(VirtIO Serial Port)을 열어, 호스트가 게스트 내부 정보를 조회하거나 특정 명령을 실행할 수 있게 한다.

### 11.2 Guest Agent로 할 수 있는 것

| 기능                 | API 경로                               | 설명                                                                                  |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| IP 주소 조회         | `GET .../agent/network-get-interfaces` | DHCP 환경에서 VM의 IP를 호스트 측에서 확인 가능. CMP의 VM 목록에 IP를 표시하려면 필수 |
| 파일시스템 정보      | `GET .../agent/get-fsinfo`             | 마운트 포인트, 디스크 사용량 등                                                       |
| 안전한 종료          | `POST .../agent/shutdown`              | Guest OS에게 정상 종료를 요청                                                         |
| 파일시스템 동결/해동 | `fsfreeze-freeze` / `fsfreeze-thaw`    | 백업 시 데이터 일관성 확보                                                            |
| 파일 쓰기/읽기       | `file-write`, `file-read`              | 호스트에서 게스트 내부 파일에 접근                                                    |
| 시간 동기화          | `set-time`                             | 게스트 시계를 호스트에 맞춤                                                           |

### 11.3 설치 및 설정

**게스트 내부 (Debian/Ubuntu 기준):**

```bash
apt install qemu-guest-agent
systemctl enable qemu-guest-agent
systemctl start qemu-guest-agent
```

**Proxmox 호스트 측:**

VM 설정에서 Guest Agent를 활성화해야 한다. 그래야 Proxmox가 VirtIO Serial Port를 생성한다.

```bash
qm set <VMID> --agent enabled=1
```

또는 Web UI에서 `VM → Options → QEMU Guest Agent → Enabled` 체크.

**중요:** 호스트 측 설정 변경 후에는 VM을 **완전히 종료(Shutdown)했다가 다시 시작(Start)**해야 적용된다. 단순 재부팅(Reboot)으로는 VirtIO Serial Port가 생성되지 않는다.

### 11.4 CMP 관점에서의 중요성

Guest Agent가 없으면, CMP에서 VM의 IP 주소를 알 수 없다(DHCP 환경). "VM이 정상 기동되었는가?"를 판별하려면 단순히 QEMU 프로세스가 실행 중인지(=`status: running`)만 확인할 수 있을 뿐, 게스트 OS가 실제로 부팅 완료되었는지, 네트워크가 올라왔는지는 알 수 없다. Guest Agent는 이 갭(Gap)을 메우는 핵심 컴포넌트이다.

> **공식 문서:** https://pve.proxmox.com/wiki/Qemu-guest-agent

---

## 12. Cloud-Init 연동

### 12.1 Cloud-Init이란

Cloud-Init은 **클라우드 인스턴스(Instance)의 초기 부팅 시 자동 설정을 수행하는 업계 표준 도구**이다. AWS, GCP, Azure 모두 Cloud-Init을 사용한다. Proxmox에서도 이것을 네이티브로 지원한다.

Cloud-Init이 처리하는 것들:

- 호스트명(Hostname) 설정
- 네트워크(IP, Gateway, DNS) 구성
- SSH 공개키 주입
- 사용자 계정 생성
- 패키지 설치
- 임의 스크립트 실행

### 12.2 Cloud-Init 템플릿 생성 워크플로우

이것은 대량 프로비저닝(Provisioning)의 기반이 되는 핵심 워크플로우이다.

**1단계: 클라우드 이미지 다운로드**

주요 배포판들은 Cloud-Init이 사전 설치된 "클라우드 이미지"를 제공한다.

```bash
# Debian 12 Bookworm 예시
wget https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2

# Ubuntu 24.04 Noble 예시
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
```

**2단계: 이미지에 QEMU Guest Agent 사전 설치 (선택이지만 강력 권장)**

```bash
apt install -y libguestfs-tools
virt-customize -a debian-12-generic-amd64.qcow2 --install qemu-guest-agent
```

`virt-customize`는 VM을 기동하지 않고도 이미지 내부에 패키지를 설치할 수 있는 도구이다.

**3단계: VM 생성 및 디스크 임포트**

```bash
qm create 9000 --name "debian12-cloud-template" --ostype l26 \
  --memory 1024 --cores 2 --net0 virtio,bridge=vmbr0

# 다운로드한 이미지를 VM 디스크로 임포트
qm set 9000 --scsi0 local-lvm:0,import-from=/path/to/debian-12-generic-amd64.qcow2

# 부팅 설정
qm set 9000 --boot order=scsi0 --scsihw virtio-scsi-single

# Guest Agent 활성화
qm set 9000 --agent enabled=1

# Cloud-Init 드라이브 추가 (ISO로 설정 데이터를 전달)
qm set 9000 --ide2 local-lvm:cloudinit

# 시리얼 콘솔 설정 (Cloud 이미지는 대부분 이것을 필요로 함)
qm set 9000 --serial0 socket --vga serial0
```

**4단계: 템플릿 변환**

```bash
qm template 9000
```

이 시점부터 이 VM은 더 이상 기동할 수 없고, 오직 Clone의 원판으로만 사용된다.

**5단계: 클론 + Cloud-Init 설정 적용**

```bash
# Linked Clone 생성
qm clone 9000 200 --name "web-server-01"

# Cloud-Init 파라미터 설정
qm set 200 --ciuser davi
qm set 200 --sshkeys ~/.ssh/id_ed25519.pub
qm set 200 --ipconfig0 ip=192.168.10.10/24,gw=192.168.10.1
qm set 200 --nameserver 8.8.8.8
qm set 200 --searchdomain proxmox.letech.kr

# VM 시작 → Cloud-Init이 자동으로 설정 적용
qm start 200
```

VM이 첫 부팅되면 Cloud-Init이 호스트명 설정, 네트워크 구성, SSH 키 주입, 사용자 생성을 자동으로 수행한다. 수작업 없이 SSH로 바로 접속할 수 있는 VM이 수십 초 만에 만들어진다.

### 12.3 커스텀 Cloud-Init 설정 (`cicustom`)

Proxmox가 자동 생성하는 Cloud-Init 설정 외에, 사용자 정의 `cloud-config` YAML을 주입할 수도 있다. Snippet 스토리지에 YAML 파일을 놓고 참조한다.

```bash
qm set 200 --cicustom "user=local:snippets/my-cloud-config.yaml"
```

`my-cloud-config.yaml` 예시:

```yaml
#cloud-config
runcmd:
  - apt update
  - apt install -y qemu-guest-agent nginx
  - systemctl start qemu-guest-agent
  - systemctl enable nginx
```

### 12.4 IaC(Infrastructure as Code) 관점

Cloud-Init + Template + Linked Clone 조합은 Proxmox에서 IaC를 구현하는 가장 기본적인 패턴이다. 여기에 Terraform의 `proxmox` 프로바이더(Provider)를 결합하면, 코드 한 줄로 VM 인프라를 선언적으로 관리할 수 있다.

```hcl
resource "proxmox_vm_qemu" "web_server" {
  name        = "web-server-01"
  target_node = "kcy0122"
  clone       = "debian12-cloud-template"
  cores       = 2
  memory      = 2048
  ipconfig0   = "ip=192.168.10.10/24,gw=192.168.10.1"
  sshkeys     = file("~/.ssh/id_ed25519.pub")
}
```

`terraform apply` 한 번이면 VM이 프로비저닝된다. 이것이 CMP가 내부적으로 수행하는 작업의 본질이다.

> **공식 Cloud-Init 문서:** https://pve.proxmox.com/wiki/Cloud-Init_Support
> **Cloud-Init 프로젝트:** https://cloud-init.io/

---

## 부록 A: 주요 API 호출 예시 (curl 기반)

아래 예시들은 API Token 인증 방식을 사용한다. `<TOKEN>` 부분을 실제 토큰으로 교체하라.

```bash
AUTH="Authorization: PVEAPIToken=admin@pve!my_token=<UUID>"
BASE="https://127.0.0.1:8006/api2/json"
NODE="kcy0122"

# ──────────────────────────────────────
# VM 목록 조회
# ──────────────────────────────────────
curl -k -H "$AUTH" "$BASE/nodes/$NODE/qemu"

# ──────────────────────────────────────
# VM 설정 조회
# ──────────────────────────────────────
curl -k -H "$AUTH" "$BASE/nodes/$NODE/qemu/100/config"

# ──────────────────────────────────────
# VM 시작
# ──────────────────────────────────────
curl -k -H "$AUTH" -X POST "$BASE/nodes/$NODE/qemu/100/status/start"

# ──────────────────────────────────────
# VM 정상 종료
# ──────────────────────────────────────
curl -k -H "$AUTH" -X POST "$BASE/nodes/$NODE/qemu/100/status/shutdown"

# ──────────────────────────────────────
# 스냅샷 생성
# ──────────────────────────────────────
curl -k -H "$AUTH" -X POST \
  -d "snapname=pre-update&description=Before+patching" \
  "$BASE/nodes/$NODE/qemu/100/snapshot"

# ──────────────────────────────────────
# Guest Agent로 IP 조회
# ──────────────────────────────────────
curl -k -H "$AUTH" "$BASE/nodes/$NODE/qemu/100/agent/network-get-interfaces"

# ──────────────────────────────────────
# 태스크 상태 확인
# ──────────────────────────────────────
curl -k -H "$AUTH" "$BASE/nodes/$NODE/tasks/<UPID>/status"
```

---

## 부록 B: 출처 및 참고 자료

| 주제                          | URL                                                            |
| ----------------------------- | -------------------------------------------------------------- |
| Proxmox VE 공식 관리자 가이드 | https://pve.proxmox.com/pve-docs/pve-admin-guide.html          |
| `qm` CLI 매뉴얼               | https://pve.proxmox.com/pve-docs/qm.1.html                     |
| `vzdump` CLI 매뉴얼           | https://pve.proxmox.com/pve-docs/vzdump.1.html                 |
| REST API Wiki                 | https://pve.proxmox.com/wiki/Proxmox_VE_API                    |
| 비주얼 API 뷰어               | https://pve.proxmox.com/pve-docs/api-viewer/index.html         |
| 사용자/권한 관리              | https://pve.proxmox.com/pve-docs/pveum-plain.html              |
| QEMU Guest Agent              | https://pve.proxmox.com/wiki/Qemu-guest-agent                  |
| Cloud-Init 지원               | https://pve.proxmox.com/wiki/Cloud-Init_Support                |
| 백업과 복구                   | https://pve.proxmox.com/pve-docs/chapter-vzdump.html           |
| Cloud-Init 공식 프로젝트      | https://cloud-init.io/                                         |
| Terraform Proxmox Provider    | https://registry.terraform.io/providers/Telmate/proxmox/latest |

---

## 부록 C: 검증 체크리스트

이 문서의 내용을 실습한 뒤, 아래 항목을 순서대로 검증한다.

```bash
# ── API 인증 ─────────────────────────
# Ticket 방식 로그인
curl -k -d "username=root@pam&password=<password>" \
  https://127.0.0.1:8006/api2/json/access/ticket
# → data.ticket과 data.CSRFPreventionToken 확인

# API Token 방식 조회
curl -k -H "Authorization: PVEAPIToken=admin@pve!<tokenid>=<uuid>" \
  https://127.0.0.1:8006/api2/json/version
# → data.version 확인

# ── VM 라이프사이클 ──────────────────
qm create 200 --name test-vm --memory 512 --cores 1 --net0 virtio,bridge=vmbr0
qm start 200
qm snapshot 200 test-snap --description "테스트 스냅샷"
qm listsnapshot 200
qm rollback 200 test-snap
qm delsnapshot 200 test-snap
vzdump 200 --mode snapshot --compress zstd
qm destroy 200 --purge

# ── Guest Agent (VM 내부에 설치 후) ──
curl -k -H "$AUTH" \
  "$BASE/nodes/$NODE/qemu/<VMID>/agent/network-get-interfaces"
# → 게스트 NIC 정보와 IP 주소 확인
```
