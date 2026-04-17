---
title: "ZFS 스토리지 구성 & Replication"
date: 2026-04-10
lastmod: 2026-04-17
author: "Davi"
description: "ZFS 아키텍처(vdev/zpool/dataset/zvol), LVM-Thin과의 스냅샷 메커니즘 차이, ashift 설계 원칙, Proxmox Storage Replication의 내부 동작, autotrim vs 배치 TRIM 전략까지."
slug: "zfs"
section: "notes"
category: "proxmox/storage"
tags: [proxmox, zfs, zpool, zvol, snapshot, replication, pvesr, trim, ashift, cow, row]
order: 3
series: "Proxmox VE 학습 시리즈"
series_order: 12
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목        | 내용                                               |
| ----------- | -------------------------------------------------- |
| 선행 문서   | `04-storage/01-lvm-disk.md`                        |
| ZFS 풀 이름 | `local-zfs`                                        |
| 물리 디스크 | `ata-VBOX_HARDDISK_VB17cb9e23-ac9d7e33` (100G VDI) |
| 클러스터    | test (3노드: pve / pve-ksy / kcy0122)              |

---

## 1. ZFS 아키텍처 — 볼륨 관리자와 파일시스템의 통합

전통적인 Linux 스토리지 구조는 세 레이어가 분리되어 있다:

```markdown
[블록 디바이스] → [LVM 볼륨 관리자] → [파일시스템 (ext4, xfs)]
```

ZFS는 이 세 레이어를 **하나의 시스템으로 통합**한다. 별도의 LVM이 필요 없고, 파일시스템과 볼륨 관리가 단일 스택 안에서 이루어진다.

```markdown
[물리 디스크 1, 2, 3 ...]
         ↓ vdev
[vdev — 물리 디스크의 RAID 그룹 단위]
         ↓ zpool
[zpool — 하나 이상의 vdev로 구성된 최상위 스토리지 풀]
         ↓
         ├── dataset (파일시스템 — 마운트 포인트를 갖는 디렉터리)
         └── zvol    (블록 볼륨 — VM 디스크로 사용)
```

| 구성 요소   | 역할                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------- |
| **vdev**    | zpool을 구성하는 최소 단위. 단일 디스크, Mirror(RAID-1), RAIDZ(RAID-5 계열) 등 구성 가능 |
| **zpool**   | 서버의 최상위 스토리지 풀. 여러 vdev로 구성                                              |
| **dataset** | zpool 내 파일시스템. 마운트 포인트를 가지며 쿼터·압축·스냅샷 개별 설정 가능              |
| **zvol**    | 블록 디바이스처럼 동작하는 볼륨. Proxmox가 VM 디스크를 ZFS에 올리면 zvol 단위로 생성     |

Proxmox에서 VM 디스크를 `local-zfs`에 올리면 각 디스크가 `local-zfs/vm-<VMID>-disk-<N>` 이름의 zvol로 생성된다.

---

## 2. ZFS 핵심 메커니즘

### 2.1 CoW/RoW — 모든 것의 기반

ZFS는 공식적으로 "CoW 파일시스템"으로 분류되지만, 실제 동작은 LVM-Thin과 동일한 **RoW(Redirect-on-Write)** 방식이다.

```markdown
기존 블록 B에 쓰기 요청 발생:
  1. 새로운 블록 위치 B'를 선택
  2. 새 데이터를 B'에 기록
  3. 메타데이터(uberblock)의 포인터를 B → B'로 교체
  4. 기존 블록 B는 더 이상 참조되지 않으면 해제
```

블록을 덮어쓰지 않기 때문에:

- 스냅샷 생성이 메타데이터 포인터 조작만으로 즉각적으로 이루어진다
- 쓰기 도중 전원이 꺼져도 이전 상태가 그대로 남아 있다 (아토믹 쓰기)

### 2.2 체크섬 기반 무결성 검증 (Self-Healing)

ZFS는 모든 블록에 체크섬(Checksum)을 기록한다. 데이터를 읽을 때마다 체크섬을 검증하고, 손상이 감지되면 Mirror나 RAIDZ의 다른 복사본에서 자동 복구한다. 이 기능을 **self-healing**이라고 한다.

LVM은 체크섬 검증이 없다. 디스크가 조용히 잘못된 데이터를 반환해도(Silent Data Corruption) 알아낼 방법이 없다. ZFS가 미션 크리티컬 데이터에 선호되는 이유다.

### 2.3 ARC 캐시 (Adaptive Replacement Cache)

ZFS는 RAM을 **ARC(Adaptive Replacement Cache)**로 활용한다. 최근 접근한 데이터와 자주 접근한 데이터를 모두 추적하는 적응형 알고리즘으로, LRU(Least Recently Used) 방식보다 캐시 효율이 높다.

선택적으로 SSD를 **L2ARC**로 구성하면 RAM에 올라오지 못한 데이터의 2차 캐시로 사용할 수 있다.

ZFS가 RAM을 많이 요구하는 이유가 여기 있다. 일반적으로 스토리지 1TB당 1GB RAM을 권장한다.

### 2.4 LVM-Thin vs ZFS 비교

| 항목                     | LVM-Thin                | ZFS                           |
| ------------------------ | ----------------------- | ----------------------------- |
| 스냅샷 메커니즘          | RoW (포인터 교체)       | RoW (포인터 교체)             |
| 체크섬 무결성            | 없음                    | 종단간 체크섬 + self-healing  |
| 압축                     | 없음                    | 인라인 압축 (LZ4, GZIP, ZSTD) |
| 네이티브 Replication     | 없음                    | `zfs send \| zfs receive`     |
| 메모리 요구량            | 낮음                    | 높음 (ARC 캐시)               |
| 순수 I/O 성능            | 더 빠름 (오버헤드 적음) | 보통~높음 (체크섬 CPU 비용)   |
| Proxmox Replication 지원 | 미지원                  | **네이티브 지원**             |

---

## 3. 현재 환경 분석

```bash
zpool list -v

# NAME                                      SIZE  ALLOC   FREE  FRAG  CAP  HEALTH
# local-zfs                                99.5G  20.9G  78.6G    5%   21%  ONLINE
#   ata-VBOX_HARDDISK_VB17cb9e23-ac9d7e33  100G  20.9G  78.6G    5%  21.0%

zpool get all local-zfs | grep -E "ashift|autotrim|autoexpand|health"
# local-zfs  ashift      12    local    ← 수동으로 설정된 값
# local-zfs  autotrim    off   default
# local-zfs  autoexpand  off   default
# local-zfs  health      ONLINE
```

### 3.1 ashift=12의 의미

`ashift`는 ZFS 풀의 최소 I/O 단위(섹터 크기)를 2의 거듭제곱으로 표현한다. `ashift=12`는 2¹² = 4096 bytes = 4KB를 의미한다.

현대 HDD·SSD는 내부적으로 4KB 섹터를 사용하지만, 호환성을 위해 512B 섹터인 것처럼 보고하는 경우가 있다. ZFS가 이것을 그대로 믿고 512B로 정렬하면 **4KB 섹터 경계에 걸쳐서 쓰기**가 발생하고 성능이 크게 저하된다.

`ashift=12`로 명시하면 ZFS가 4KB 단위로 정렬하여 I/O 효율이 최적화된다.

> **주의:** `ashift`는 **풀 생성 시에만 설정 가능**하다. 나중에 변경할 수 없다. VirtualBox 가상 디스크는 기본적으로 512B로 보고하지만, 실제 호스트 디스크가 4KB 섹터라면 `ashift=12`를 명시해야 한다.

### 3.2 autotrim=off

`autotrim`은 ZFS가 블록을 해제할 때마다 즉시 TRIM 명령을 디스크로 보내는 옵션이다. 기본값이 `off`인 이유는 성능 영향 때문이다.

VM 디스크에 데이터를 쓰고 지우는 과정에서 빈번하게 TRIM이 발생하면, 특히 SSD에서 쓰기 증폭(Write Amplification)이 늘어날 수 있다. 대신 `zpool trim` 명령을 주기적으로 실행하는 **배치 TRIM 전략**이 권장된다.

배치 TRIM 자동화는 `05-ha-and-automation/02-ha-with-storage.md §6`에서 다룬 systemd Timer로 이미 구성되어 있다.

### 3.3 현재 데이터셋 구조

```bash
zfs list

# NAME                         USED  AVAIL  REFER  MOUNTPOINT
# local-zfs                   20.9G  75.5G    96K  /local-zfs
# local-zfs/vm-100-disk-0     5.11G  75.5G  5.10G  -
# local-zfs/vm-301-cloudinit    76K  75.5G    76K  -
# local-zfs/vm-301-disk-0     2.04G  75.5G  2.03G  -
# local-zfs/vm-301-disk-1       76K  75.5G    76K  -
# local-zfs/vm-501-disk-0     2.32G  75.5G  2.32G  -
# local-zfs/vm-501-disk-1     1.97G  75.5G  1.97G  -
# local-zfs/vm-800-disk-0     7.42G  75.5G  7.42G  -
# local-zfs/vm-9201-disk-0    2.08G  75.5G  2.08G  -
```

각 VM 디스크가 독립적인 데이터셋(zvol)으로 분리되어 있다. `USED`와 `REFER`가 거의 동일한 것은 해당 데이터셋에 스냅샷이 없거나 적다는 뜻이다.

`vm-301-disk-0`의 `USED(2.04G)` > `REFER(2.03G)` 차이는 Replication 스냅샷이 차지하는 용량이다.

---

## 4. Proxmox Storage Replication — 내부 동작

### 4.1 Replication이 ZFS를 선택한 이유

Proxmox Replication은 **`zfs send | zfs receive`를 자동화한 것**이다. ZFS의 네이티브 스냅샷 전송 기능을 활용하기 때문에, Replication은 ZFS 또는 ZFS 위에 올라간 VM에만 사용 가능하다. LVM-Thin 위의 VM에는 적용되지 않는다.

### 4.2 증분 전송 메커니즘

최초 복제 시에는 전체 데이터를 전송하지만, 이후부터는 **이전 스냅샷과 현재 스냅샷 사이의 변경분(델타)**만 전송한다.

```markdown
최초 복제:
  kcy0122: vm-301-disk-0 (2GB)
         ─── zfs send ────────────→ pve-ksy: local-zfs/vm-301-disk-0 (2GB)

5분 후 복제:
  kcy0122: @snap1 → @snap2 (변경분: 50MB)
         ─── zfs send -i @snap1 @snap2 ────→ pve-ksy: (델타 50MB만 전송)
```

현재 로그에서 확인된 Replication 스냅샷:

```bash
zfs list -t all | grep vm-301

# local-zfs/vm-301-disk-0                                 2.04G  75.5G  2.03G  -
# local-zfs/vm-301-disk-0@__replicate_301-1_1776386435__  1.14M      -  2.03G  -
# local-zfs/vm-301-disk-0@__replicate_301-1_1776386704__   412K      -  2.03G  -
# local-zfs/vm-301-disk-0@__replicate_301-0_1776386700__   836K      -  2.03G  -
```

스냅샷 이름 규칙: `@__replicate_{JobID}_{Unix타임스탬프}__`

스냅샷별 `USED` 값(1.14M, 412K, 836K)이 해당 복제 주기 동안 변경된 블록의 크기다. 현재 VM 활동이 적으므로 델타가 매우 작다.

### 4.3 복제 작업 설정 및 상태

```bash
pvesr status

# JobID  Enabled  Target        LastSync              NextSync              Duration  State
# 301-0  Yes      local/pve-ksy  2026-04-17_09:45:00  2026-04-17_09:50:00   4.49s   OK
# 301-1  Yes      local/pve      2026-04-17_09:40:35  2026-04-17_09:50:00  34.59s   SYNCING
```

`301-0`(→ pve-ksy)는 4.49초에 완료된 반면, `301-1`(→ pve)은 34.59초가 걸리고 있다. 같은 데이터를 전송하는데 노드에 따라 소요 시간이 다른 것은 네트워크 상태나 대상 노드의 ZFS 풀 상태 차이를 반영한다.

**`pvesr run --id` vs `pvesr schedule-now`:**

| 명령                       | 실행 방식              | Guest Agent 없을 때 fsfreeze | 에러 출력 |
| -------------------------- | ---------------------- | ---------------------------- | --------- |
| `pvesr run --id 301-0`     | 포어그라운드 직접 실행 | 타임아웃 에러 콘솔 출력      | 명시적    |
| `pvesr schedule-now 301-0` | systemd 타이머 큐 등록 | 조용히 스킵 후 진행          | 억제      |

### 4.4 페일오버 시 Replication 방향 자동 전환

VM 301이 `kcy0122 → pve-ksy`로 페일오버되면, Proxmox CRM이 복제 작업의 소스 노드를 자동으로 `pve-ksy`로 전환한다. 페일백 시에도 자동으로 원래 방향으로 복원된다.

페일오버 이후 수동 개입 없이 복제가 재개되는 것이 Proxmox Replication의 핵심 특징이다.

### 4.5 `/etc/hosts` 필수 등록

Replication은 내부적으로 SSH를 통해 `zfs receive`를 실행한다. 이때 IP가 아닌 **호스트명(hostname)**으로 연결을 시도한다. `/etc/hosts`에 각 노드가 등록되어 있지 않으면 `SYNCING` 상태에서 무한 대기한다.

```bash
# 세 노드 전부에 동일하게 적용 필요
cat /etc/hosts
# 10.10.250.115 pve.proxmox.letech.kr    pve
# 10.10.250.117 pve-ksy.proxmox.letih.kr pve-ksy
# 10.10.250.119 kcy0122.proxmox.letech.kr kcy0122

# hostname으로 SSH 접근 가능 여부 확인
ssh root@pve-ksy "zpool list"
```

---

## 5. ZFS 진단 명령어

```bash
# 풀 상태 요약
zpool list
zpool list -v                      # 각 vdev 포함

# 풀 상태 상세 (DEGRADED/FAULTED 여부)
zpool status local-zfs

# 풀 속성 전체 조회
zpool get all local-zfs

# 데이터셋 목록
zfs list
zfs list -t all                    # 스냅샷 포함
zfs list -t snapshot               # 스냅샷만

# 특정 VM의 데이터셋 조회
zfs list -t all | grep vm-301

# 데이터셋 속성 확인
zfs get compression,compressratio,used,referenced local-zfs/vm-301-disk-0

# 수동 TRIM 실행
zpool trim local-zfs

# TRIM 상태 확인
zpool status -t local-zfs

# scrub 실행 (체크섬 기반 무결성 검사)
zpool scrub local-zfs

# Proxmox 스토리지 상태
pvesm status | grep local-zfs

# Replication 상태
pvesr status
journalctl -t pvesr -n 50
```

---

## 6. CMP 설계 관점

### 6.1 ZFS 스토리지 등록 API

```markdown
# 노드에 ZFS 스토리지 추가
POST /api2/json/storage
  type=zfspool
  pool=local-zfs
  content=images,rootdir

# 풀 목록 조회
GET /api2/json/nodes/{node}/disks/zfs
```

### 6.2 Replication API

```markdown
# Replication Job 생성
POST /api2/json/nodes/{node}/replication
  id=301-0
  target=pve-ksy
  schedule=*/5

# Replication 상태 조회
GET /api2/json/nodes/{node}/replication

# 즉시 실행 (비동기 — UPID 반환)
POST /api2/json/nodes/{node}/replication/{id}/schedule_now
```

### 6.3 주의사항

- Replication Job은 소스 노드에서 생성해야 한다 (`pvesr create-local-job`은 Proxmox 9.x 전용 명령)
- 대상 노드의 ZFS 풀 이름이 소스와 동일해야 한다
- VM 마이그레이션 후 복제 방향이 자동 전환되므로, CMP에서 복제 상태를 주기적으로 폴링하여 현재 소스 노드를 추적해야 한다

---

## 7. 트러블슈팅

<DocEmbed
  src="notes/linux/proxmox/06-references/07-troubleshooting.md"
  anchor="### ZFS TRIM 실패 (HDD 에뮬레이션)"
  title="zpool trim 실패 / VirtualBox 디스크 SSD 전환 / systemd 재시도 로직"
/>

---

## 부록: 검증 체크리스트

```bash
# ZFS 풀 상태
zpool status local-zfs
# → state: ONLINE, errors: No known data errors 확인

# Replication 상태
pvesr status
# → 모든 Job State: OK 확인

# 복제 스냅샷 확인
zfs list -t snapshot | grep replicate
# → 최근 타임스탬프의 스냅샷 존재 확인

# TRIM 타이머 상태
systemctl list-timers | grep zpool
# → 등록된 타이머와 다음 실행 시각 확인

# Scrub 스케줄 확인 (정기 무결성 검사)
zpool status local-zfs | grep scan
# → scrub repaired 0B in XX:XX:XX with 0 errors 형태 확인
```

> - **ZFS 공식 문서:** https://openzfs.github.io/openzfs-docs/
> - **Proxmox Storage Replication:** https://pve.proxmox.com/wiki/Storage_Replication
> - **Proxmox ZFS 스토리지:** https://pve.proxmox.com/pve-docs/pve-admin-guide.html#chapter_zfs
