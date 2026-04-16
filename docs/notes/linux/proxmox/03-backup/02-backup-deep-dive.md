---
title: "Proxmox VE 실습 - 백업 체계 심화"
date: 2026-04-10
lastmod: 2026-04-10
author: "Davi"
description: "vzdump 심화, Datacenter 스케줄, 보존 정책, 복구 시나리오, PBS 개요를 다룬다."
slug: "proxmox-backup-deep-dive"
section: "notes"
category: "linux"
tags: [proxmox, qemu, kvm, vzdump, backup, restore, retention, prune, pbs, jobs-cfg, fleecing, schedule]
order: 120
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 12
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목          | 내용                                           |
| ------------- | ---------------------------------------------- |
| Proxmox VE    | 9.1-1 (Debian Bookworm 기반)                   |
| 선행 문서     | `11-proxmox-lvm-disk.md`                       |
| 클러스터      | test (3노드: pve, pve-ksy, kcy0122)            |
| 백업 스토리지 | shared (NFS, 10.10.250.117 — pve-ksy 제공)     |
| 백업 대상     | VM 201 (dev-api-01), VM 300, VM 301, VM 900 등 |

> 이 문서는 `11-proxmox-lvm-disk.md`에서 다룬 vzdump/qmrestore 기초를 전제로 한다. 여기서는 Datacenter 레벨 스케줄, 보존 정책, PBS 아키텍처까지 확장한다.

---

## 1. Proxmox 백업 시스템의 전체 구조

### 1.1 백업 관련 핵심 구성 요소

| 구성 요소         | 역할                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **vzdump**        | 백업 실행 엔진. VM/CT의 디스크와 설정을 하나의 아카이브(Archive) 파일로 만든다. CLI에서 직접 호출하거나, 스케줄러가 호출. |
| **qmrestore**     | 복구 실행 엔진. vzdump이 만든 아카이브에서 VM을 복원. CT는 `pct restore`를 사용.                                          |
| **jobs.cfg**      | Datacenter 레벨 백업 스케줄 정의 파일. `/etc/pve/jobs.cfg`에 저장되며, pmxcfs를 통해 클러스터 전체에 동기화.              |
| **storage.cfg**   | 백업 파일의 저장 위치 결정. `content`에 `backup`이 포함된 스토리지만 백업 대상 스토리지로 사용 가능.                      |
| **prune-backups** | 백업 보존 정책. 오래된 백업을 자동 삭제하는 규칙. 스토리지 단위 또는 Job 단위로 설정 가능.                                |
| **알림 시스템**   | 백업 성공/실패 시 알림 전송. Proxmox 9.x부터 `notification-system` 방식으로 전환됨.                                       |

### 1.2 백업의 두 가지 레벨

| 구분      | VM 단위 백업 (Ad-hoc)                               | Datacenter 단위 백업 (Scheduled)    |
| --------- | --------------------------------------------------- | ----------------------------------- |
| 실행 주체 | 관리자가 수동으로 실행                              | pvedaemon이 스케줄에 따라 자동 실행 |
| 실행 위치 | Web UI → VM → Backup → Backup now 또는 CLI `vzdump` | Web UI → Datacenter → Backup → Add  |
| 설정 저장 | 저장 안 됨 (일회성)                                 | `/etc/pve/jobs.cfg`에 영구 저장     |
| 범위      | 특정 VM 하나                                        | 클러스터 전체 또는 필터링된 VM 그룹 |
| 용도      | 업데이트 전 스냅샷, 긴급 백업                       | 정기 백업 정책 운영, DR 전략 구현   |
| CMP 대응  | Self-Service 포털의 "지금 백업" 버튼                | 백업 정책 엔진, 스케줄 관리 API     |

VM 단위 백업은 "지금 당장 이 문서 저장(Ctrl+S)"이고, Datacenter 단위 백업은 "매일 밤 자동으로 전체 프로젝트를 Git에 커밋하는 CI/CD 파이프라인(Pipeline)"이다.

---

## 2. vzdump 심화

### 2.1 백업 모드(Mode) 보충

**Snapshot 모드에서 QEMU Guest Agent의 역할:**

Snapshot 모드의 약점인 "파일시스템 불일치"를 해결하는 열쇠가 Guest Agent이다. VM 내부에 `qemu-guest-agent`가 설치되어 있으면, vzdump은 스냅샷 직전에 `fs-freeze` 명령을 보내 게스트 파일시스템의 I/O를 일시 중지시키고, 스냅샷 완료 후 `fs-thaw`로 해제한다.

VM 201의 설정에 `agent: enabled=1`이 이미 있으므로, Guest Agent가 설치되어 있다면 이 메커니즘이 동작한다.

```bash
# VM 내부에서 확인
systemctl status qemu-guest-agent
```

> CMP 관점에서, VM 생성 시 Guest Agent를 자동 설치하도록 Cloud-Init 템플릿에 포함시키는 것이 백업 품질을 보장하는 핵심 전략이다.

**Suspend 모드의 현재 상태 (Proxmox 9.x):**

Proxmox 9.x에서 Suspend 모드는 내부적으로 Snapshot 모드와 거의 동일하게 동작한다. 과거에는 실제로 VM을 일시 정지시켰지만, 현재는 스토리지가 스냅샷을 지원하면 Snapshot 모드로 자동 폴백(Fallback)된다. 실무적으로는 Stop과 Snapshot 두 가지만 구분하면 충분하다. Suspend 모드는 하위 호환성(Backward Compatibility)을 위해 남아 있는 것.

### 2.2 백업 파일 포맷과 네이밍 규칙

shared 스토리지의 실제 백업 파일:

```bash
/mnt/pve/shared/dump/
  ├── vzdump-qemu-300-2026_04_10-11_12_01.vma.zst       # 백업 데이터 (압축)
  ├── vzdump-qemu-300-2026_04_10-11_12_01.vma.zst.notes # 메모 (notes-template)
  └── vzdump-qemu-300-2026_04_10-11_12_01.log           # 백업 실행 로그
```

파일명 구조:

```
vzdump - qemu - 300 - 2026_04_10-11_12_01 . vma . zst
  ↑        ↑     ↑           ↑               ↑     ↑
도구명   VM타입  VMID       타임스탬프       포맷  압축
```

| 확장자     | 의미                                             |
| ---------- | ------------------------------------------------ |
| `.vma`     | VMA(Virtual Machine Archive) 포맷 — Proxmox 고유 |
| `.vma.zst` | zstd 압축 적용                                   |
| `.vma.gz`  | gzip 압축 적용                                   |
| `.vma.lzo` | lzo 압축 적용                                    |
| `.vma.dat` | 무압축 백업 파일                                 |
| `.notes`   | notes-template으로 생성된 메모 파일              |
| `.log`     | 백업 실행 과정의 상세 로그                       |

> 환경에서 `.tmp` 디렉토리가 4개 남아 있었다. 이것은 백업이 비정상 종료되었을 때 남는 임시 파일이다. 대응하는 `.vma` 파일이 없으면 백업 자체가 실패한 것이므로 수동 삭제해도 안전하다: `rm -rf /mnt/pve/shared/dump/vzdump-*.tmp`

### 2.3 대역폭 제한(Bandwidth Limit)

`jobs.cfg`에 `bwlimit 51200`가 설정되어 있다. 이건 백업 I/O를 **50 MB/s (51200 KB/s)**로 제한한다는 뜻이다.

백업은 대량의 디스크 읽기를 발생시키는데, 제한 없이 돌리면 같은 노드의 다른 VM들이 I/O 경합(Contention)으로 느려질 수 있다. 프로덕션 환경에서 낮 시간에 백업을 돌릴 때는 bwlimit을 걸어서 서비스 영향을 최소화하고, 야간 백업이라면 제한을 풀거나 높여서 백업 시간을 단축할 수 있다.

> CMP 관점: 고객 등급별로 다른 bwlimit을 적용하는 것이 일반적이다. 프리미엄(Premium) 고객은 제한 없이, 스탠다드(Standard) 고객은 제한을 걸어서 공유 인프라의 품질을 보장.

### 2.4 Fleecing — Proxmox 9.x 신기능

Fleecing은 Snapshot 모드 백업의 성능을 개선하기 위한 기술이다. 일반적인 Snapshot 백업은 스냅샷 생성 후 원본 디스크에서 데이터를 읽는데, 이때 VM의 쓰기 I/O와 경합이 발생할 수 있다. Fleecing은 스냅샷 시점의 데이터를 별도의 임시 공간(Fleece Target)에 먼저 복사해놓고, 백업 엔진이 그 복사본을 읽는 방식이다.

원본 디스크에 대한 I/O 경합이 줄어들어 VM 성능 영향이 최소화된다. 다만 임시 공간이 추가로 필요하고, 스토리지 지원 여부에 따라 사용 가능 여부가 달라지므로 학습 환경에서는 비활성 상태(`fleecing 0`)로 두는 것이 맞다.

---

## 3. Datacenter 레벨 백업 — 자동화된 백업 정책

### 3.1 jobs.cfg 해부

클러스터에 설정된 백업 Job을 한 줄씩 분석한다:

```bash
cat /etc/pve/jobs.cfg

> vzdump: backup-8a0d2f63-a1ca           # Job 유형(vzdump)과 고유 ID
>     schedule fri 11:12                  # 실행 스케줄: 매주 금요일 11시 12분
>     bwlimit 51200                       # I/O 대역폭 제한: 50 MB/s
>     compress zstd                       # 압축 알고리즘: zstd
>     enabled 1                           # 활성화 상태 (0이면 비활성)
>     fleecing 0                          # 플리싱(Fleecing) 비활성화
>     mode snapshot                       # 백업 모드: Snapshot (무중단)
>     notes-template {{cluster}}, {{guestname}}, {{node}}, {{vmid}}
>     notification-mode notification-system  # 알림 방식
>     prune-backups keep-daily=1,keep-last=2 # 보존 정책
>     storage shared                      # 백업 저장 스토리지
>     vmid 900                            # 대상 VM (특정 ID 지정)
```

### 3.2 schedule 문법

Proxmox의 schedule은 systemd Calendar Event 문법을 기반으로 한다.

| schedule 표현       | 의미                               |
| ------------------- | ---------------------------------- |
| `daily 02:00`       | 매일 새벽 2시                      |
| `mon,wed,fri 23:00` | 월, 수, 금 밤 11시                 |
| `sat 03:00`         | 매주 토요일 새벽 3시               |
| `01:00`             | 매일 새벽 1시 (요일 생략 = 매일)   |
| `mon..fri 22:00`    | 월요일부터 금요일까지 매일 밤 10시 |
| `*-*-01 04:00`      | 매월 1일 새벽 4시                  |

### 3.3 대상 필터링 — vmid, pool, node, exclude

| 필터 방식   | 설정 예시          | 동작                             |
| ----------- | ------------------ | -------------------------------- |
| **vmid**    | `vmid 100,201,300` | 지정된 VM ID만 백업              |
| 전체 백업   | vmid 미지정        | 클러스터 내 모든 VM/CT 백업      |
| **exclude** | `exclude 999`      | 특정 VM을 백업에서 제외          |
| **pool**    | `pool production`  | 특정 리소스 풀(Pool)의 VM만 백업 |
| **node**    | `node kcy0122`     | 특정 노드의 VM만 백업            |

> "전체 백업(vmid 미지정)"을 기본으로 쓰면 새로 만든 VM도 자동으로 백업 대상에 포함된다. 특정 VM만 빼고 싶으면 `exclude`를 쓰는 게 관리가 편하다. 반대로 `vmid`로 특정 VM만 지정하면, 새 VM을 만들 때마다 Job을 수정해야 하니까 빠뜨릴 위험이 있다.

### 3.4 notes-template

사용 가능한 변수:

| 변수                | 치환되는 값                  |
| ------------------- | ---------------------------- |
| `\{\{cluster\}\}`   | 클러스터 이름 (예: test)     |
| `\{\{guestname\}\}` | VM/CT 이름 (예: dev-api-01)  |
| `\{\{node\}\}`      | 실행 노드 이름 (예: kcy0122) |
| `\{\{vmid\}\}`      | VM ID (예: 201)              |

`.notes` 파일을 열어보면 이 변수들이 치환된 텍스트가 들어 있다. Web UI의 Backup 목록에서 이 메모가 표시되므로, 어떤 백업이 어떤 클러스터/노드에서 만들어졌는지 한눈에 식별할 수 있다.

---

## 4. 보존 정책(Retention Policy)

### 4.1 prune-backups 옵션

| 옵션             | 동작                                                                  |
| ---------------- | --------------------------------------------------------------------- |
| `keep-all=1`     | 모든 백업을 영구 보존. 삭제 안 함. 스토리지 용량 고갈 위험!           |
| `keep-last=N`    | 가장 최근 N개의 백업만 유지. 시간 무관, 개수 기준.                    |
| `keep-daily=N`   | 최근 N일간 하루 1개씩 유지. 하루에 여러 번 백업해도 마지막 것만 남김. |
| `keep-weekly=N`  | 최근 N주간 주 1개씩 유지.                                             |
| `keep-monthly=N` | 최근 N개월간 월 1개씩 유지.                                           |
| `keep-yearly=N`  | 최근 N년간 년 1개씩 유지.                                             |

### 4.2 현재 환경의 보존 정책 분석

두 가지 보존 정책이 설정되어 있다:

**1) shared 스토리지 (storage.cfg): `keep-all=1`**

모든 백업을 영구 보존. shared에 12GB 이상의 백업이 쌓여 있고, 삭제되지 않고 계속 누적된다. NFS 스토리지가 145GB인데 25GB를 이미 쓰고 있으니까, VM이 늘어나고 백업이 쌓이면 수 주 내에 용량 문제가 발생할 수 있다.

**2) backup-8a0d2f63-a1ca Job (jobs.cfg): `keep-daily=1,keep-last=2`**

이 Job으로 만든 백업은 "최근 2개"와 "하루 1개"를 유지. 매주 금요일에 백업이 돌면, 직전 2개의 백업 파일만 남고 나머지는 자동 삭제된다.

> **storage.cfg의 `keep-all=1`과 Job의 `prune-backups`가 충돌할 때:** Job에 `prune-backups`가 명시되어 있으면 **Job 설정이 우선**한다. 따라서 backup-8a0d2f63 Job이 만든 백업은 Job의 규칙대로 정리된다. 하지만 수동 백업(Ad-hoc vzdump)은 Job을 거치지 않으므로 스토리지의 `keep-all=1`이 적용되어 영원히 남는다. shared 스토리지에 쌓여 있는 `.vma.dat` 파일들이 바로 이 경우.

### 4.3 보존 정책 설계 가이드

| 환경                 | 권장 정책                                   | 이유                                  |
| -------------------- | ------------------------------------------- | ------------------------------------- |
| 학습/개발            | `keep-last=3`                               | 최근 3개면 충분. 스토리지 절약.       |
| 스테이징(Staging)    | `keep-daily=3,keep-last=2`                  | 3일치 + 최근 2개. 빠른 롤백 대응.     |
| 프로덕션(Production) | `keep-daily=7,keep-weekly=4,keep-monthly=3` | 7일 + 4주 + 3개월. 규정 준수 충족.    |
| 금융/의료            | 위 + `keep-yearly=3`                        | 연간 백업까지 보존. 감사(Audit) 대응. |

> CMP에서는 고객 등급(Tier)에 따라 다른 보존 정책을 적용하고, Proxmox API를 통해 Job 단위로 주입하는 구조.

---

## 5. 복구(Restore) 시나리오

### 5.1 복구 시 주의사항

| 시나리오             | 처리 방법                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| VMID 충돌            | 같은 VMID의 VM이 이미 존재하면 복구 실패. 다른 VMID를 지정하거나, 기존 VM을 먼저 삭제해야 한다.                        |
| 다른 노드로 복구     | 백업 파일이 있는 스토리지에 대상 노드가 접근 가능해야 한다. 공유 스토리지(NFS) 사용 시 어떤 노드에서든 복구 가능.      |
| 다른 스토리지로 복구 | `--storage` 옵션으로 지정. 원본이 local-lvm이었어도 shared로 복구 가능하고 그 반대도 가능.                             |
| 네트워크 충돌        | 복구된 VM은 원본과 같은 MAC 주소와 IP 설정을 가진다. 원본이 아직 실행 중이면 IP/MAC 충돌이 발생할 수 있으므로 주의.    |
| 부분 복구            | 전체 VM이 아닌 특정 파일만 복구하려면, VM을 임시 VMID로 복구 → 필요한 파일 추출 → 임시 VM 삭제하는 절차를 밟아야 한다. |

### 5.2 복구 테스트의 중요성

백업은 복구할 수 있어야 의미가 있다. "백업했다"가 아니라 "복구에 성공했다"가 진짜 완료.

복구 테스트 방법: 백업 파일을 다른 VMID로 복구 → 부팅 확인 → 서비스 정상 동작 확인 → 테스트 VM 삭제. 이 과정을 자동화하는 것이 CMP의 "Backup Verification" 기능이다.

---

## 6. PBS(Proxmox Backup Server) — 차세대 백업 아키텍처

> 현재 학습 환경에는 설치되어 있지 않다. CMP 프로젝트에서 백업 아키텍처를 설계할 때 반드시 알아야 하는 개념으로 정리한다.

### 6.1 vzdump vs PBS 비교

| 항목            | vzdump (로컬 백업)             | PBS (전용 백업 서버)                              |
| --------------- | ------------------------------ | ------------------------------------------------- |
| 백업 방식       | 전체 디스크 이미지 복사 (Full) | 증분 백업(Incremental) — 변경된 블록만 전송       |
| 중복 제거       | 없음                           | 인라인 중복 제거(Deduplication) 지원              |
| 암호화          | 선택 사항                      | 클라이언트 측 암호화(Client-Side Encryption) 지원 |
| 무결성 검증     | 없음                           | 내장 검증(Verify Job) 지원                        |
| 네트워크 효율   | 매번 전체 전송                 | 변경분만 전송 — 대역폭 절약 극대화                |
| 저장 효율       | 백업 수 × 전체 크기            | 중복 제거로 실제 용량 대폭 절감                   |
| 복구 범위       | 전체 VM 복원만 가능            | 파일 레벨 복구(File-Level Restore) 가능           |
| 관리 인터페이스 | Proxmox Web UI 내 통합         | 독립적인 PBS Web UI + API                         |

### 6.2 증분 백업(Incremental Backup)의 원리

vzdump은 매번 VM의 전체 디스크를 복사한다. 32GB 디스크의 VM을 매일 백업하면, 데이터 변경이 1GB뿐이어도 매일 32GB를 전송하고 저장해야 한다. 7일이면 224GB.

PBS는 다르다. 첫 백업만 Full로 전송하고, 이후에는 변경된 블록(Changed Block)만 전송한다. Fixed-Size Chunk 기반 Content-Addressable Storage로 구현하는데, 각 4MB 청크(Chunk)의 해시(Hash)를 비교해서 이전 백업과 동일한 청크는 건너뛰는 방식이다.

같은 32GB VM의 7일치 백업이 vzdump으로는 ~224GB, PBS로는 ~40GB 수준(변경량에 따라 다름)으로 줄어들 수 있다.

### 6.3 CMP 백업 아키텍처 설계 시 고려사항

- **API 차이:** vzdump은 Proxmox VE API(`/api2/json/nodes/{node}/vzdump`)로 호출하지만, PBS는 독립적인 API 서버를 가진다. CMP 백엔드에서 두 API를 모두 지원하는 어댑터(Adapter) 패턴이 필요할 수 있다.
- **스토리지 유형:** vzdump 백업은 NFS/dir 스토리지에 파일로 저장되고, PBS 백업은 PBS Datastore에 저장된다. `storage.cfg`에서 유형이 다르게 정의된다.
- **복구 UX:** vzdump은 전체 VM 복구만 가능하지만, PBS는 파일 레벨 복구를 지원한다. CMP UI에서 "이 파일만 복구" 같은 세밀한 기능을 제공하려면 PBS가 필수.
- **비용 구조:** PBS는 별도 서버가 필요하므로 초기 비용이 있지만, 중복 제거로 장기적으로 스토리지 비용을 절감한다. CMP의 과금(Billing) 모델과 연동해야 한다.

---

## 7. 실습 기록

### 7.1 모드별 백업 비교

VM 201(dev-api-01)이 실행 중인 상태에서 세 가지 모드로 각각 백업하고 결과를 비교했다.

```bash
# 1. Snapshot 모드 (VM 실행 유지)
vzdump 201 --mode snapshot --storage shared --compress zstd

# 2. Stop 모드 (VM 정지됨)
vzdump 201 --mode stop --storage shared --compress zstd

# 3. 무압축 Snapshot (파일 크기 비교용)
vzdump 201 --mode snapshot --storage shared
```

> 각 백업 후 `ls -lh /mnt/pve/shared/dump/vzdump-qemu-201-*`로 파일 크기를 확인하고, 로그 마지막 줄의 소요 시간을 비교. Stop 모드에서는 다른 터미널에서 ping이 끊기는 것을 확인했고, Snapshot 모드에서는 끊김 없이 유지되었다.

### 7.2 Datacenter 백업 Job 생성

Web UI에서 Datacenter → Backup → Add로 새 Job 생성:

- **대상:** 전체 VM (All)
- **스케줄:** `daily 03:00`
- **스토리지:** shared
- **모드:** Snapshot
- **압축:** zstd
- **보존 정책:** `keep-daily=3,keep-weekly=2`

생성 후 `cat /etc/pve/jobs.cfg`로 새 Job이 저장된 것을 확인. 다른 노드에서도 동일한 내용이 보이는지 확인하여 pmxcfs 동기화를 검증했다.

### 7.3 복구 실습

```bash
# 시나리오 1: VM 300의 백업을 다른 VMID(399)로 복구
qmrestore /mnt/pve/shared/dump/vzdump-qemu-300-2026_04_10-11_12_01.vma.zst 399

# 시나리오 2: 복구된 VM 399 부팅 확인
qm start 399

# 시나리오 3: local-lvm으로 복구하여 속도 비교
qmrestore /mnt/pve/shared/dump/vzdump-qemu-300-2026_04_10-11_12_01.vma.zst 399 \
  --storage local-lvm

# 시나리오 4: 테스트 완료 후 정리
qm destroy 399
```

### 7.4 보존 정책 동작 확인

```bash
# 시뮬레이션 (실제 삭제 안 함)
pvesm prune-backups shared --type qemu --vmid 300 --keep-last 2 --dry-run

# 실제 적용
pvesm prune-backups shared --type qemu --vmid 300 --keep-last 2
```

> `--dry-run`을 반드시 먼저 실행해서 어떤 백업이 삭제될지 미리 확인. 삭제는 되돌릴 수 없다.

### 7.5 .tmp 잔해 정리

```bash
ls -la /mnt/pve/shared/dump/*.tmp
rm -rf /mnt/pve/shared/dump/vzdump-*.tmp
```

---

> **공식 문서:** https://pve.proxmox.com/pve-docs/chapter-vzdump.html
> **공식 문서:** https://pve.proxmox.com/pve-docs/pve-admin-guide.html#chapter_backup
> **PBS 공식:** https://pbs.proxmox.com/docs/
