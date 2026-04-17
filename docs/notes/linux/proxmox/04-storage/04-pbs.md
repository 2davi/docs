---
title: "PBS(Proxmox Backup Server) 구성 & 연동"
date: 2026-04-15
lastmod: 2026-04-17
author: "Davi"
description: "PBS 청크 기반 증분 백업 아키텍처, vzdump와의 구조적 차이, VM 501(bkp-api) 설치 환경, Proxmox 노드 연동, Backup/Verify Job 설계, CMP API 통합까지."
slug: "pbs"
section: "notes"
category: "proxmox/storage"
tags: [proxmox, pbs, backup, proxmox-backup-server, incremental, dedup, verify, fingerprint, datastore, chunk]
order: 4
series: "Proxmox VE 학습 시리즈"
series_order: 13
status: "active"
draft: false
search: true
toc: true
difficulty: "intermediate"
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목        | 내용                                       |
| ----------- | ------------------------------------------ |
| 선행 문서   | `03-backup/02-backup-deep-dive.md`         |
| PBS VM      | VM 501 `bkp-api` (kcy0122 노드, local-zfs) |
| PBS 서버 IP | 10.10.250.120                              |
| Datastore   | `backup_storage`                           |
| 연결 노드   | kcy0122, pve, pve-ksy (전체)               |

---

## 1. PBS가 필요한 이유 — vzdump의 구조적 한계

`03-backup/01-backup-restore.md`에서 다룬 vzdump는 매번 VM 전체를 복사한다. 32GB 디스크 VM을 매일 백업하면, 변경이 1GB뿐이어도 매일 32GB를 전송하고 저장해야 한다.

```markdown
vzdump 7일치:
  [Day 1] Full 32GB
  [Day 2] Full 32GB
  [Day 3] Full 32GB
  ...
  합계: ~224GB

PBS 7일치:
  [Day 1] Full ~32GB
  [Day 2] Delta ~1GB
  [Day 3] Delta ~1GB
  ...
  합계: ~38GB
```

PBS는 이 비효율을 **청크 기반 중복 제거(Chunk-based Deduplication)**로 해결한다.

---

## 2. PBS 아키텍처 — 청크 기반 증분 백업

### 2.1 Content-Addressable Storage (CAS)

PBS는 백업 데이터를 **고정 크기 청크(Fixed-Size Chunk, 기본 4MB)**로 분할하고, 각 청크의 SHA-256 해시를 키로 Datastore에 저장한다.

```markdown
VM 디스크 데이터:
  [Block A][Block B][Block C][Block D][Block E] ...
           ↓ 4MB 단위로 청크 분할
  [Chunk1:hash=abc][Chunk2:hash=def][Chunk3:hash=ghi] ...

Datastore에 저장 시:
  - Chunk1(abc)이 이미 존재하면 → 참조 카운트만 증가 (저장 생략)
  - 새로운 Chunk이면 → 실제 데이터 저장
```

동일한 청크가 여러 백업에 걸쳐 반복 등장해도 **한 번만 저장**된다. VM 템플릿 기반 인스턴스들이 OS 베이스 청크를 공유하면 중복 제거 효율이 매우 높아진다.

### 2.2 클라이언트 측 암호화

PBS는 **클라이언트 측 암호화(Client-Side Encryption)**를 지원한다. 데이터가 PBS 서버에 전송되기 전에 클라이언트(PVE 노드)에서 AES-256으로 암호화된다.

PBS 서버는 암호화된 청크만 저장하므로, 서버가 물리적으로 탈취되어도 복호화 키 없이는 내용을 열람할 수 없다. 규정 준수(Compliance)가 요구되는 환경에서 핵심 기능이다.

### 2.3 내장 Verify Job

PBS는 저장된 백업의 무결성을 주기적으로 검증하는 **Verify Job**을 기본 제공한다. 저장된 청크의 체크섬을 재계산하여 데이터 손상 여부를 확인한다.

vzdump는 백업 자체의 무결성 검증 기능이 없다. "백업했다"와 "복구 가능하다"를 구분하려면 주기적인 Verify Job이 필수다.

### 2.4 파일 레벨 복구

PBS 백업에서는 전체 VM 복원 없이 **특정 파일만 추출**할 수 있다. PBS Web UI 또는 CLI에서 백업 아카이브를 탐색하여 필요한 파일만 꺼낼 수 있다.

---

## 3. vzdump vs PBS 비교

| 항목            | vzdump                | PBS                       |
| --------------- | --------------------- | ------------------------- |
| 백업 방식       | 매번 Full 이미지 복사 | 청크 기반 증분 백업       |
| 중복 제거       | 없음                  | 인라인 청크 dedup         |
| 암호화          | 선택 사항             | 클라이언트 측 암호화 지원 |
| 무결성 검증     | 없음                  | Verify Job 기본 제공      |
| 네트워크 효율   | 매번 전체 전송        | 변경 청크만 전송          |
| 파일 레벨 복구  | 불가 (전체 VM만)      | 가능                      |
| 관리 인터페이스 | PVE Web UI 내 통합    | 독립 PBS Web UI + API     |
| 별도 서버 필요  | 불필요                | 필요 (VM 또는 물리 머신)  |
| 스토리지 타입   | dir, nfs (파일 기반)  | PBS Datastore             |
| API 레이어      | PVE API               | 독립 PBS API              |

---

## 4. 현재 환경 구성

### 4.1 PBS VM (VM 501, `bkp-api`)

```bash
qm config 501

# agent: 1
# boot: order=scsi0
# cores: 2
# memory: 2048
# name: bkp-api
# net0: virtio=BC:24:11:6F:97:37,bridge=vmbr0
# scsi0: local-zfs:vm-501-disk-0,size=32G   ← OS 디스크
# scsi1: local-zfs:vm-501-disk-1,size=50G   ← Datastore 디스크
# scsihw: virtio-scsi-pci
# serial0: socket
# vga: std
```

OS 디스크(32G)와 Datastore 전용 디스크(50G)를 분리한 구조다. Datastore를 별도 디스크에 두면 OS 재설치 시 백업 데이터를 보존할 수 있다.

`scsihw: virtio-scsi-pci`는 `virtio-scsi-single`과 다르게 단일 컨트롤러에 여러 디스크를 묶는다. iothread를 개별 디스크에 적용할 수 없지만, PBS 서버처럼 디스크 수가 적고 I/O 패턴이 순차적인 경우 실질적인 성능 차이는 미미하다.

두 디스크 모두 `local-zfs` 위에 올라가 있어 ZFS의 체크섬 무결성 보호를 받는다. 백업 서버의 데이터가 ZFS self-healing 아래 있다는 것이 적합한 선택이다.

### 4.2 Proxmox 측 PBS 스토리지 등록

```bash
cat /etc/pve/storage.cfg | grep -A10 pbs

# pbs: local-pbs
#     disable                           ← 현재 비활성화 상태
#     datastore backup_storage
#     server 10.10.250.120
#     content backup
#     fingerprint 4b:e2:32:...:5f
#     nodes kcy0122,pve,pve-ksy
#     prune-backups keep-all=1
#     username root@pam
```

`disable` 항목이 있어 현재 비활성화 상태다. 스토리지 등록 자체는 완료된 상태이며, `disable` 라인을 제거하거나 Web UI에서 활성화하면 즉시 사용 가능하다.

**fingerprint의 역할:** PBS 서버의 TLS 인증서 핀(Pin)이다. 클라이언트(PVE 노드)가 PBS 서버에 접속할 때 이 fingerprint와 서버 인증서를 비교한다. Man-in-the-Middle 공격을 방지하며, PBS 서버 인증서가 갱신되면 fingerprint도 업데이트해야 한다.

---

## 5. PBS 서버 관리

### 5.1 PBS Web UI 접속

```markdown
https://<PBS서버IP>:8007
```

기본 포트는 8007이다 (PVE Web UI의 8006과 다름).

### 5.2 Datastore 구성

PBS Datastore는 백업 데이터가 실제로 저장되는 디렉터리다. VM 501에서:

```bash
# PBS 서버 내부에서
proxmox-backup-manager datastore list

# Datastore 생성 (설치 후 최초 1회)
proxmox-backup-manager datastore create backup_storage /mnt/datastore/backup_storage
```

Datastore 경로(`/mnt/datastore/backup_storage`)는 VM 501의 두 번째 디스크(`scsi1: 50G`)를 포맷하여 마운트한 경로여야 한다.

### 5.3 사용자 및 토큰 관리

```bash
# 사용자 목록 확인
proxmox-backup-manager user list

# API 토큰 생성 (CMP 연동용)
proxmox-backup-manager user generate-token root@pam cmp-token
```

PVE 노드에서 PBS로 백업을 실행할 때 `username: root@pam`으로 인증한다. 운영 환경에서는 최소 권한 원칙에 따라 별도 계정을 생성하는 것이 권장된다.

---

## 6. PVE ↔ PBS 백업 연동

### 6.1 PBS 스토리지 활성화

현재 `disable` 상태인 `local-pbs`를 활성화한다:

```bash
# storage.cfg에서 disable 라인 제거
pvesm set local-pbs --disable 0

# 또는 Web UI: Datacenter → Storage → local-pbs → Edit → Enable 체크

# 활성화 확인
pvesm status | grep local-pbs
# local-pbs  pbs  active  ...   ← active 확인
```

### 6.2 PBS로 즉시 백업 실행

```bash
# VM 301을 PBS에 즉시 백업
vzdump 301 --storage local-pbs --mode snapshot --compress zstd

# 응답: UPID:kcy0122:...:vzdump:301:root@pam:
# → 비동기 Task. UPID로 상태 추적
```

### 6.3 Datacenter 백업 Job에서 PBS 사용

Web UI: `Datacenter → Backup → Add`:

- **Storage:** `local-pbs`
- **Mode:** Snapshot
- **Schedule:** `daily 02:00`
- **Retention:** PBS 서버 측에서 Prune Job으로 관리하거나 Job 단위 설정

jobs.cfg에 기록 예시:

```ini
vzdump: backup-pbs-daily
    schedule daily 02:00
    storage local-pbs
    mode snapshot
    compress zstd
    prune-backups keep-daily=7,keep-weekly=4,keep-monthly=3
    enabled 1
```

### 6.4 Verify Job — 무결성 검증

PBS Web UI: `Datastore → backup_storage → Verify Jobs → Add`:

- **Schedule:** `weekly` (주 1회)
- **Outdated After:** `30d` (30일 이상 된 백업은 재검증)

Verify Job은 저장된 모든 청크의 체크섬을 재계산하여 데이터 손상을 감지한다. 손상이 발견되면 알림을 보낸다.

---

## 7. jobs.cfg 현재 설정 분석

```bash
cat /etc/pve/jobs.cfg
```

**Job 1 — `backup-97d3a718`:**

```ini
vzdump: backup-97d3a718-6094
    schedule */1:00           ← 매 시간 실행 (개발/테스트용)
    compress zstd
    enabled 0                 ← 비활성화
    fleecing 1,storage=local-lvm   ← Fleecing 활성화 (로컬 LVM에 임시 공간 사용)
    mode snapshot
    prune-backups keep-daily=7,keep-last=3,keep-monthly=6,keep-weekly=4,keep-yearly=2
    storage shared            ← NFS에 저장
    vmid 100
```

`fleecing 1,storage=local-lvm`은 Snapshot 모드 백업 시 VM 디스크 I/O와 경합을 줄이기 위해 LVM에 임시 복사본을 만들어 사용하는 옵션이다. VM 성능 영향을 최소화하려는 설정이다.

**Job 2 — `backup-a8df1866`:**

```ini
vzdump: backup-a8df1866-0407
    schedule sun 01:00        ← 매주 일요일 새벽 1시
    bwlimit 10240             ← 10 MB/s 대역폭 제한
    compress zstd
    enabled 0                 ← 비활성화
    mode stop                 ← VM 정지 모드 (완전한 일관성)
    node pve-ksy              ← pve-ksy 노드에서만 실행
    performance max-workers=16 ← 병렬 작업자 16개
    storage shared
    vmid 901
```

`node pve-ksy`는 이 Job이 pve-ksy 노드에서만 실행된다는 제약이다. VM 901이 pve-ksy에 있거나, 해당 노드에서 실행하는 것이 네트워크·스토리지 접근에 유리한 경우에 사용한다.

---

## 8. CMP 통합 관점

### 8.1 두 개의 API 레이어

vzdump는 PVE API를 통해 호출하지만, PBS는 독립적인 API 서버를 가진다.

```markdown
# PVE API로 vzdump 백업 실행
POST /api2/json/nodes/{node}/vzdump
  vmid=301&storage=local-pbs&mode=snapshot

# PBS API (포트 8007)로 직접 조작
GET  https://<PBS서버>:8007/api2/json/admin/datastore/backup_storage/snapshots
POST https://<PBS서버>:8007/api2/json/admin/datastore/backup_storage/verify
```

CMP 백엔드에서 두 API를 모두 지원하는 **어댑터(Adapter) 패턴**이 필요하다. PVE API를 통한 백업 실행과, PBS API를 통한 백업 목록 조회·복구·검증을 각각 처리해야 한다.

### 8.2 백업 완료 상태 추적

PBS 백업도 PVE API의 UPID 기반 비동기 Task로 실행된다. 완료 여부는 Task 상태 조회로 추적한다.

```markdown
POST /api2/json/nodes/{node}/vzdump
  → {data: "UPID:kcy0122:..."}

GET /api2/json/nodes/{node}/tasks/{upid}/status
  → {data: {status: "stopped", exitstatus: "OK"}}
```

### 8.3 스토리지 유형별 복구 API 분기

```markdown
vzdump 백업에서 복구:
  POST /api2/json/nodes/{node}/qmrestore

PBS 백업에서 복구:
  POST /api2/json/nodes/{node}/qmrestore
    archive=<PBS 백업 ID>
    storage=local-pbs
```

PBS 백업에서 복구할 때는 `archive` 파라미터에 PBS 백업 식별자(`vm/301/2026-04-17T09:45:00Z`)를 전달한다.

### 8.4 fingerprint 관리

PBS 서버 인증서는 갱신 주기가 있다. CMP에서 PBS 스토리지를 자동 등록할 때 fingerprint를 하드코딩하면 인증서 갱신 시 연결이 끊긴다.

PBS API에서 fingerprint를 동적으로 조회하는 방식을 사용하거나, 인증서 갱신 이벤트를 모니터링하여 자동 업데이트하는 로직이 필요하다.

```bash
# PBS 서버에서 현재 fingerprint 조회
proxmox-backup-manager cert info | grep Fingerprint
```

---

## 9. 운영 체크리스트

```bash
# PBS 스토리지 활성화 상태 확인
pvesm status | grep local-pbs

# PBS 서버 응답 확인
curl -sk https://10.10.250.120:8007/api2/json/version \
  -H "Authorization: PBSAPIToken=root@pam!cmp-token:<secret>"

# 백업 목록 조회 (PVE API)
pvesh get /nodes/kcy0122/storage/local-pbs/content

# Datastore 사용량 확인 (PBS VM 내부에서)
proxmox-backup-manager datastore info backup_storage

# 최근 Verify Job 결과
# PBS Web UI: Datastore → Verify Jobs → 상태 확인

# 백업 복구 테스트 (다른 VMID로)
qmrestore /nodes/kcy0122/storage/local-pbs/... 399
qm start 399 && qm status 399
qm destroy 399 --purge
```

---

## 부록: PBS vs vzdump 선택 기준

| 환경                       | 권장 방식    | 이유                               |
| -------------------------- | ------------ | ---------------------------------- |
| 단일 노드, 소규모          | vzdump (NFS) | 별도 PBS 서버 운영 오버헤드 불필요 |
| 3노드 이상 클러스터        | PBS          | 중복 제거로 스토리지 비용 절감     |
| 파일 레벨 복구 필요        | PBS 필수     | vzdump은 전체 VM 복원만 가능       |
| 암호화 필요 (컴플라이언스) | PBS          | 클라이언트 측 암호화 지원          |
| 백업 무결성 보장           | PBS          | Verify Job 기본 제공               |
| CMP Self-Service 포털      | PBS          | 세분화된 API로 복구 UX 구현 가능   |

> - **PBS 공식 문서:** https://pbs.proxmox.com/docs/
> - **PBS API:** https://pbs.proxmox.com/docs/api-viewer/
> - **Proxmox 백업 스토리지:** https://pve.proxmox.com/pve-docs/pve-admin-guide.html#storage_pbs
