---
title: "백업 체계 심화 — 스케줄·보존·PBS"
date: 2026-04-10
lastmod: 2026-04-16
author: "Davi"
description: "Datacenter 백업 스케줄 설계, jobs.cfg 구조, prune-backups 정책 충돌 해소, Fleecing, PBS 증분 백업 아키텍처 비교까지."
slug: "backup-deep-dive"
section: "notes"
category: "proxmox/backup"
tags: [proxmox, vzdump, backup, jobs-cfg, prune-backups, retention, pbs, fleecing, schedule, bwlimit]
order: 2
series: "Proxmox VE 학습 시리즈"
series_order: 9
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
| 선행 문서     | `03-backup/01-backup-restore.md`               |
| 클러스터      | test (3노드: pve / pve-ksy / kcy0122)          |
| 백업 스토리지 | `shared` (NFS, 10.10.250.117 — pve-ksy 제공)   |
| 백업 대상     | VM 201 (dev-api-01), VM 300, VM 301, VM 900 등 |

---

## 1. Proxmox 백업 시스템의 전체 구조

### 1.1 핵심 구성 요소

| 구성 요소         | 역할                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **vzdump**        | 백업 실행 엔진. VM 디스크와 설정을 하나의 아카이브로 만든다. CLI 직접 호출 또는 스케줄러 호출    |
| **qmrestore**     | 복구 실행 엔진. vzdump 아카이브에서 VM 복원. CT는 `pct restore`                                  |
| **jobs.cfg**      | Datacenter 레벨 백업 스케줄 정의 파일. `/etc/pve/jobs.cfg`에 저장, pmxcfs로 클러스터 전체 동기화 |
| **storage.cfg**   | 백업 파일 저장 위치 결정. `content`에 `backup`이 포함된 스토리지만 백업 대상으로 사용 가능       |
| **prune-backups** | 백업 보존 정책. 오래된 백업 자동 삭제 규칙. 스토리지 단위 또는 Job 단위로 설정                   |
| **알림 시스템**   | 백업 성공/실패 시 알림. Proxmox 9.x부터 `notification-system` 방식으로 전환                      |

### 1.2 VM 단위 백업 vs Datacenter 단위 백업

| 구분      | VM 단위 백업 (Ad-hoc)                               | Datacenter 단위 백업 (Scheduled)    |
| --------- | --------------------------------------------------- | ----------------------------------- |
| 실행 주체 | 관리자 수동 실행                                    | pvedaemon이 스케줄에 따라 자동 실행 |
| 실행 방법 | Web UI → VM → Backup → Backup now 또는 `vzdump` CLI | Web UI → Datacenter → Backup → Add  |
| 설정 저장 | 저장 안 됨 (일회성)                                 | `/etc/pve/jobs.cfg`에 영구 저장     |
| 범위      | 특정 VM 하나                                        | 클러스터 전체 또는 필터링된 VM 그룹 |
| 용도      | 업데이트 전 긴급 백업                               | 정기 백업 정책, DR 전략 구현        |
| CMP 대응  | Self-Service 포털의 "지금 백업" 버튼                | 백업 정책 엔진, 스케줄 관리 API     |

---

## 2. vzdump 심화

### 2.1 Snapshot 모드와 Guest Agent의 관계

`01-backup-restore.md §2.2`에서 다룬 Snapshot 모드의 데이터 일관성 문제를 해결하는 열쇠가 Guest Agent다. vzdump는 스냅샷 직전에 `guest-fsfreeze-freeze`를 보내 파일시스템 I/O를 일시 중단하고, 스냅샷 완료 후 `guest-fsfreeze-thaw`로 해제한다.

```bash
# VM 내부에서 Guest Agent 동작 확인
systemctl status qemu-guest-agent

# 백업 로그에서 fsfreeze 동작 확인
grep -i "freeze\|thaw\|agent" /var/lib/vz/dump/vzdump-qemu-201-*.log
```

> CMP 관점: VM 생성 시 Guest Agent를 자동 설치하도록 Cloud-Init 템플릿에 포함시키는 것이 백업 품질을 보장하는 핵심 전략이다. Guest Agent 없는 VM에 Snapshot 모드 백업을 돌리는 것은 준비 안 된 백업이다.

### 2.2 비정상 종료된 백업의 잔해 처리

백업이 중간에 실패하면 임시 디렉토리(`.tmp`)가 남는다.

```bash
# 잔해 확인
ls -la /mnt/pve/shared/dump/*.tmp

# 대응하는 .vma 파일이 없으면 백업 자체가 실패한 것 → 안전하게 삭제
rm -rf /mnt/pve/shared/dump/vzdump-*.tmp
```

`.tmp` 잔해가 있다는 것은 해당 백업이 완료되지 않았다는 뜻이다. 복구에 사용할 수 없는 불완전한 파일이므로 정리한다.

### 2.3 대역폭 제한 (bwlimit)

백업은 대량의 디스크 읽기를 발생시킨다. 제한 없이 실행하면 같은 노드의 다른 VM들이 I/O 경합으로 느려질 수 있다.

```bash
# 50 MB/s로 제한 (51200 KB/s)
vzdump 201 --mode snapshot --storage shared --bwlimit 51200

# jobs.cfg에서도 설정 가능
# bwlimit 51200
```

실무 전략: 낮 시간 백업이라면 bwlimit를 걸어 서비스 영향을 최소화하고, 야간 백업이라면 제한을 풀거나 높여 백업 시간을 단축한다.

> CMP 관점: 고객 등급별로 다른 bwlimit을 적용한다. 프리미엄 고객은 제한 없이, 스탠다드 고객은 제한을 걸어 공유 인프라 품질을 보장.

### 2.4 Fleecing — Proxmox 9.x

Snapshot 모드 백업의 성능을 개선하기 위한 기술이다. 일반적인 Snapshot 백업은 스냅샷 생성 후 원본 디스크에서 데이터를 읽는데, 이때 VM의 쓰기 I/O와 경합이 발생한다.

Fleecing은 스냅샷 시점의 데이터를 **별도의 임시 공간(Fleece Target)에 먼저 복사**해두고, 백업 엔진이 그 복사본을 읽는 방식이다. 원본 디스크에 대한 I/O 경합이 줄어들어 VM 성능 영향이 최소화된다.

임시 공간이 추가로 필요하고, 스토리지 지원 여부에 따라 사용 가능 여부가 달라진다. 학습 환경에서는 비활성 상태(`fleecing 0`)로 두는 것이 적합하다.

---

## 3. Datacenter 레벨 백업 자동화

### 3.1 jobs.cfg 해부

```bash
cat /etc/pve/jobs.cfg

# vzdump: backup-8a0d2f63-a1ca         ← Job 유형(vzdump)과 고유 ID
#     schedule fri 11:12               ← 실행 스케줄: 매주 금요일 11시 12분
#     bwlimit 51200                    ← I/O 제한: 50 MB/s
#     compress zstd                    ← 압축 알고리즘
#     enabled 1                        ← 활성화 상태 (0이면 비활성)
#     fleecing 0                       ← Fleecing 비활성화
#     mode snapshot                    ← 백업 모드
#     notes-template {{cluster}}, {{guestname}}, {{node}}, {{vmid}}
#     notification-mode notification-system
#     prune-backups keep-daily=1,keep-last=2   ← 보존 정책
#     storage shared                   ← 백업 저장 스토리지
#     vmid 900                         ← 대상 VM (특정 VMID 지정)
```

`jobs.cfg`는 pmxcfs를 통해 클러스터 전체에 실시간 동기화된다. 한 노드에서 수정하면 다른 노드에서도 즉시 반영된다.

### 3.2 schedule 문법

Proxmox schedule은 systemd Calendar Event 문법을 기반으로 한다.

| schedule 표현       | 의미                             |
| ------------------- | -------------------------------- |
| `daily 02:00`       | 매일 새벽 2시                    |
| `mon,wed,fri 23:00` | 월, 수, 금 밤 11시               |
| `sat 03:00`         | 매주 토요일 새벽 3시             |
| `01:00`             | 매일 새벽 1시 (요일 생략 = 매일) |
| `mon..fri 22:00`    | 월~금 매일 밤 10시               |
| `*-*-01 04:00`      | 매월 1일 새벽 4시                |

### 3.3 대상 필터링

| 필터 방식 | 설정 예시          | 동작                        |
| --------- | ------------------ | --------------------------- |
| `vmid`    | `vmid 100,201,300` | 지정된 VMID만 백업          |
| 전체 백업 | vmid 미지정        | 클러스터 내 모든 VM/CT 백업 |
| `exclude` | `exclude 999`      | 특정 VM을 백업에서 제외     |
| `pool`    | `pool production`  | 특정 리소스 풀의 VM만 백업  |
| `node`    | `node kcy0122`     | 특정 노드의 VM만 백업       |

전체 백업(vmid 미지정)을 기본으로 쓰면 새로 만든 VM도 자동으로 백업 대상에 포함된다. 특정 VM만 제외하고 싶으면 `exclude`를 쓰는 것이 관리가 편하다. 반대로 `vmid`로 지정하면 새 VM을 만들 때마다 Job을 수정해야 하므로 누락 위험이 있다.

### 3.4 notes-template

백업 파일에 자동으로 생성되는 `.notes` 파일의 내용 템플릿이다.

| 변수            | 치환되는 값                    |
| --------------- | ------------------------------ |
| `{{cluster}}`   | 클러스터 이름 (예: `test`)     |
| `{{guestname}}` | VM/CT 이름 (예: `dev-api-01`)  |
| `{{node}}`      | 실행 노드 이름 (예: `kcy0122`) |
| `{{vmid}}`      | VM ID (예: `201`)              |

Web UI의 Backup 목록에서 이 메모가 표시되어 어느 클러스터·노드에서 만든 백업인지 식별할 수 있다.

---

## 4. 보존 정책(Retention Policy) 설계

### 4.1 prune-backups 충돌 해소

보존 정책은 두 레벨에서 설정할 수 있어 충돌 가능성이 있다.

- **스토리지 레벨:** `storage.cfg`의 `prune-backups` 설정
- **Job 레벨:** `jobs.cfg`의 `prune-backups` 설정

**우선순위 규칙:** Job에 `prune-backups`가 명시되어 있으면 **Job 설정이 우선**한다. 해당 Job으로 만든 백업은 Job 규칙대로 정리된다.

그러나 **수동 백업(Ad-hoc vzdump)**은 Job을 거치지 않으므로, 스토리지 레벨 정책이 적용된다. `shared` 스토리지에 `keep-all=1`이 설정되어 있다면, 수동 백업은 영원히 쌓인다.

```markdown
shared 스토리지: keep-all=1
  ├── backup-8a0d2f63 Job → keep-daily=1,keep-last=2 (Job 우선)
  │     ↓ Job이 만든 백업 → Job 규칙대로 정리됨
  └── 수동 vzdump 실행 → 스토리지의 keep-all=1 적용
        ↓ 수동 백업 → 영원히 남음 ← 주의
```

운영 환경에서 수동 백업을 허용한다면, 스토리지 레벨 정책도 적절한 keep-last나 keep-daily를 설정해야 한다.

### 4.2 보존 정책 설계 가이드

| 환경      | 권장 정책                                   | 이유                           |
| --------- | ------------------------------------------- | ------------------------------ |
| 학습/개발 | `keep-last=3`                               | 최근 3개면 충분. 스토리지 절약 |
| 스테이징  | `keep-daily=3,keep-last=2`                  | 3일치 + 최근 2개. 빠른 롤백    |
| 프로덕션  | `keep-daily=7,keep-weekly=4,keep-monthly=3` | 7일 + 4주 + 3개월. 규정 준수   |
| 금융/의료 | 위 + `keep-yearly=3`                        | 연간 백업. 감사(Audit) 대응    |

---

## 5. PBS(Proxmox Backup Server) — 증분 백업 아키텍처

> 현재 학습 환경에는 PBS가 설치되어 있지 않다. CMP 프로젝트에서 백업 아키텍처를 설계할 때 반드시 알아야 할 개념으로 정리한다.

### 5.1 vzdump vs PBS 비교

| 항목          | vzdump (로컬 백업)             | PBS (전용 백업 서버)            |
| ------------- | ------------------------------ | ------------------------------- |
| 백업 방식     | 전체 디스크 이미지 복사 (Full) | 증분 백업 — 변경된 블록만 전송  |
| 중복 제거     | 없음                           | 인라인 중복 제거(Deduplication) |
| 암호화        | 선택 사항                      | 클라이언트 측 암호화 기본 지원  |
| 무결성 검증   | 없음                           | 내장 Verify Job 지원            |
| 네트워크 효율 | 매번 전체 전송                 | 변경분만 전송                   |
| 복구 범위     | 전체 VM 복원만                 | 파일 레벨 복구 가능             |

### 5.2 증분 백업의 원리

vzdump는 매번 VM의 전체 디스크를 복사한다. 32GB 디스크 VM을 매일 백업하면, 데이터 변경이 1GB뿐이어도 매일 32GB를 전송하고 저장해야 한다. 7일이면 224GB.

PBS는 다르다. 첫 백업만 Full로 전송하고, 이후에는 변경된 블록만 전송한다. **Fixed-Size Chunk 기반 Content-Addressable Storage**로 구현되는데, 각 4MB 청크의 해시를 비교해서 이전 백업과 동일한 청크는 건너뛴다.

```markdown
vzdump: [Full 32GB] [Full 32GB] [Full 32GB] ... → 7일: ~224GB
PBS:    [Full 32GB] [+1GB delta] [+1GB delta] ... → 7일: ~38GB
```

### 5.3 CMP 백업 아키텍처 설계 시 고려사항

- **API 분리:** vzdump은 Proxmox VE API(`/api2/json/nodes/{node}/vzdump`)로 호출하지만, PBS는 독립적인 API 서버를 가진다. CMP 백엔드에서 두 API를 모두 지원하는 어댑터(Adapter) 패턴이 필요하다.
- **스토리지 유형:** vzdump 백업은 NFS/dir 스토리지에 파일로 저장되고, PBS 백업은 PBS Datastore에 저장된다. `storage.cfg` 유형이 다르게 정의된다.
- **복구 UX:** vzdump은 전체 VM 복구만 가능하지만, PBS는 파일 레벨 복구를 지원한다. "이 파일만 복구" 같은 세밀한 기능을 CMP에서 제공하려면 PBS가 필수다.
- **비용 구조:** PBS는 별도 서버가 필요하므로 초기 비용이 있지만, 중복 제거로 장기적으로 스토리지 비용을 절감한다.

---

## 6. 실습 기록

### 6.1 모드별 백업 비교

VM 201이 실행 중인 상태에서 세 가지 모드로 각각 백업하고 결과를 비교했다.

```bash
# Snapshot 모드 (VM 실행 유지)
vzdump 201 --mode snapshot --storage shared --compress zstd

# Stop 모드 (짧은 다운타임)
vzdump 201 --mode stop --storage shared --compress zstd

# 무압축 Snapshot (파일 크기 비교용)
vzdump 201 --mode snapshot --storage shared

# 파일 크기 비교
ls -lh /mnt/pve/shared/dump/vzdump-qemu-201-*
# → zstd 압축 파일이 무압축 대비 50~60% 크기임을 확인
```

Stop 모드에서는 다른 터미널에서 ping이 끊기는 것을 확인했고, Snapshot 모드에서는 끊김 없이 유지되었다.

### 6.2 Datacenter 백업 Job 생성

Web UI에서 `Datacenter → Backup → Add`로 새 Job 생성:

- **대상:** 전체 VM (All)
- **스케줄:** `daily 03:00`
- **스토리지:** shared
- **모드:** Snapshot
- **압축:** zstd
- **보존 정책:** `keep-daily=3,keep-weekly=2`

```bash
# 생성 후 확인
cat /etc/pve/jobs.cfg

# 다른 노드에서도 동일한 내용이 보이는지 확인 (pmxcfs 동기화)
ssh root@pve "cat /etc/pve/jobs.cfg"
```

### 6.3 복구 실습

```bash
# VM 300의 백업을 다른 VMID(399)로 복구
qmrestore /mnt/pve/shared/dump/vzdump-qemu-300-*.vma.zst 399

# 복구된 VM 399 부팅 확인
qm start 399
qm status 399
# → status: running 확인

# local-lvm으로 복구하여 속도 비교
qmrestore /mnt/pve/shared/dump/vzdump-qemu-300-*.vma.zst 399 \
  --storage local-lvm

# 테스트 완료 후 정리
qm destroy 399 --purge
```

### 6.4 보존 정책 동작 확인

```bash
# 시뮬레이션 (실제 삭제 안 함)
pvesm prune-backups shared --type qemu --vmid 300 \
  --keep-last 2 --dry-run

# 실제 적용
pvesm prune-backups shared --type qemu --vmid 300 \
  --keep-last 2
```

---

## 부록: 검증 체크리스트

```bash
# Datacenter 백업 Job 상태 확인
cat /etc/pve/jobs.cfg

# 백업 파일 목록 및 크기
ls -lh /mnt/pve/shared/dump/

# 보존 정책 시뮬레이션 (삭제 없이)
pvesm prune-backups shared --type qemu \
  --keep-daily 3 --keep-weekly 2 --dry-run

# 백업 로그 마지막 줄 확인 (성공/실패)
tail -3 /mnt/pve/shared/dump/vzdump-qemu-201-*.log
# → "INFO: Finished Backup of VM 201" 확인

# 복구 테스트 (backup verification)
qmrestore /mnt/pve/shared/dump/vzdump-qemu-201-*.vma.zst 299 \
  --storage local-lvm
qm start 299
qm status 299
qm destroy 299 --purge
```

> - **공식 문서:** https://pve.proxmox.com/pve-docs/chapter-vzdump.html
> - **공식 문서 — Backup Jobs:** https://pve.proxmox.com/pve-docs/pve-admin-guide.html#chapter_backup
> - **PBS 공식 문서:** https://pbs.proxmox.com/docs/
