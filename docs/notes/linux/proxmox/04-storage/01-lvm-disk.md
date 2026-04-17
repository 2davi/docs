---
title: "LVM 디스크 확장 & Thin Pool 구성"
date: 2026-04-09
lastmod: 2026-04-16
author: "Davi"
description: "LVM 계층 구조(PV→VG→LV), LVM-Thick vs LVM-Thin 스냅샷 메커니즘 차이, vgextend로 기존 VG 확장, 독립 VG+Thin Pool 생성 후 Proxmox 스토리지 등록까지 3-Phase 실습."
slug: "lvm-disk"
section: "notes"
category: "proxmox/storage"
tags: [proxmox, lvm, lvm-thin, pv, vg, lv, thin-pool, pvesm, storage, cow, row]
order: 1
series: "Proxmox VE 학습 시리즈"
series_order: 10
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목        | 내용                                                         |
| ----------- | ------------------------------------------------------------ |
| 선행 문서   | `02-vm-lifecycle/01-vm-create.md`                            |
| 노드명      | kcy0122                                                      |
| 추가 디스크 | `sdb` (10G), `sdc` (10G) — VirtualBox에서 추가한 가상 디스크 |

---

## 1. Proxmox 스토리지 레이어 구조

Proxmox가 스토리지를 사용하는 흐름은 다음과 같이 쌓인다:

```markdown
[물리 디스크 / VirtualBox 가상 디스크 이미지]
         ↓
[블록 디바이스 (/dev/sda, /dev/sdb ...)]
         ↓
[볼륨 관리 계층 — LVM 또는 ZFS]
         ↓
[Proxmox 스토리지 플러그인 (lvmthin, zfspool, dir, nfs ...)]
         ↓
[VM 디스크 이미지 / 백업 / ISO / CT 볼륨]
```

Proxmox 스토리지 타입은 맨 위 레이어에서 "어떤 방식으로 VM 디스크를 할당하고 관리하느냐"를 결정하는 플러그인이다. 그 아래에 LVM이 있든, ZFS가 있든, NFS 마운트 경로가 있든 무관하게, Proxmox는 그 위에 적절한 플러그인을 올려서 사용한다.

---

## 2. LVM 계층 구조 — PV → VG → LV

LVM(Logical Volume Manager)은 하나 이상의 블록 디바이스를 추상화하여 유연하게 논리 볼륨을 만드는 리눅스 커널 서브시스템이다.

```markdown
물리 디스크 /dev/sda3 (63.5G)  +  /dev/sdb (10G)
                     ↓ pvcreate
        PV (Physical Volume) — LVM이 인식하는 단위로 초기화
                     ↓ vgcreate / vgextend
    VG (Volume Group) "pve" — PV를 묶은 가상 디스크 풀 (73.5G)
                     ↓ lvcreate
   LV (Logical Volume) — VG에서 잘라낸 가상 파티션
     ├── pve/root    (26.4G) — OS 루트 파일시스템
     ├── pve/swap    ( 5.8G) — 스왑
     └── pve/data   (29.3G) — LVM-Thin Pool (VM 디스크 영역)
```

| 계층                     | 역할                                                                        |
| ------------------------ | --------------------------------------------------------------------------- |
| **PV** (Physical Volume) | 블록 디바이스를 LVM이 인식하는 단위로 초기화한 것                           |
| **VG** (Volume Group)    | 하나 이상의 PV를 묶어 만든 가상 디스크 풀. 이 풀 안에서 LV를 잘라 쓴다      |
| **LV** (Logical Volume)  | VG에서 잘라낸 가상 파티션. 파일시스템을 올리거나 Proxmox가 VM 디스크로 사용 |

LVM의 핵심 가치는 **물리 디스크 경계를 무시한 추상화**다. `/dev/sda3`이 꽉 차도 `/dev/sdb`를 같은 VG에 편입하면 논리적으로 연속된 풀처럼 확장된다. OS 재시작이나 언마운트 없이 온라인 상태에서 수행할 수 있다.

---

## 3. LVM-Thick vs LVM-Thin — 스냅샷 메커니즘의 차이

LV를 만들 때 공간을 "언제 실제로 할당하느냐"에 따라 두 방식이 갈린다.

### 3.1 LVM-Thick — 즉시 할당 + CoW 스냅샷

LV를 생성하면 선언한 크기만큼 물리 공간을 **즉시 확정**한다. 20GB LV를 만들면 VG에서 20GB가 바로 감소한다. 오버 커밋(Over-commit) 불가.

스냅샷은 교과서적 의미의 **CoW(Copy-on-Write)** 방식이다.

```markdown
스냅샷 생성 시점:
  [원본 LV] ──── 메타데이터(포인터)만 복사 ────→ [스냅샷 LV]

이후 원본에 쓰기 발생 시:
  1. 변경 전 원본 블록을 스냅샷 전용 공간으로 먼저 복사
  2. 원본 블록을 새 데이터로 덮어씀
```

스냅샷 전용 공간을 미리 고정 크기로 확보해야 하고, 그 공간이 꽉 차면 스냅샷이 invalid 상태가 된다. 쓰기마다 복사 오버헤드가 발생한다.

**Proxmox에서 LVM-Thick으로는 VM 스냅샷(메모리 포함)이 불가능하다.** Thick LV는 스냅샷 지원이 제한적이어서 Proxmox가 VM 스냅샷 기능을 위해 필요로 하는 COW 체인 구조를 만들 수 없다.

### 3.2 LVM-Thin — 지연 할당 + RoW 스냅샷

VG 안에 **Thin Pool**을 먼저 만들고, 그 위에 Thin Volume을 올린다. Thin Volume은 선언 크기보다 실제 물리 할당이 적어도 된다. 실제로 데이터가 써질 때 비로소 블록이 할당된다. 이것이 **지연 할당(Deferred Allocation)** 이다.

오버 커밋이 가능하다: 50GB Thin Pool에 20GB짜리 VM 디스크 3개(합계 60GB)를 만들 수 있다. 실제 사용량 합계가 50GB를 초과하는 순간 pool이 꽉 찬다.

스냅샷은 **RoW(Redirect-on-Write)** 방식이다.

```markdown
스냅샷 생성 시점:
  원본 Thin Volume과 스냅샷이 같은 Thin Pool 블록을 공유 (복사 없음)

이후 원본에 쓰기 발생 시:
  1. 원본 블록을 복사하지 않고 Thin Pool의 새로운 블록에 데이터를 직접 기록
  2. 원본 Thin Volume의 블록 포인터를 새 위치로 교체
  3. 스냅샷은 기존 블록 포인터를 그대로 유지 → 이전 데이터를 자동 보존
```

명시적 블록 복사 동작이 없다. 포인터 리다이렉트만으로 스냅샷이 이전 데이터를 참조하도록 유지된다. Proxmox의 VM 스냅샷과 Linked Clone이 이 구조를 활용한다.

### 3.3 세 방식 비교

| 항목                  | LVM-Thick (CoW)          | LVM-Thin (RoW)      | ZFS (CoW로 불림)   |
| --------------------- | ------------------------ | ------------------- | ------------------ |
| 원본 블록 덮어쓰기    | ✗                        | ✗                   | ✗                  |
| 명시적 블록 복사      | **✓** (쓰기마다)         | ✗                   | ✗                  |
| 새 위치에 데이터 기록 | ✗ (원본 위치 유지)       | ✓                   | ✓                  |
| 포인터 교체           | ✓                        | ✓                   | ✓                  |
| 스냅샷 공간           | 고정 크기 별도 확보 필요 | Thin Pool 유동 공유 | zpool 내 유동 관리 |
| 쓰기 오버헤드         | 높음 (복사 비용)         | 낮음                | 낮음               |
| Proxmox VM 스냅샷     | 불가                     | **가능**            | **가능**           |
| Linked Clone          | 불가                     | **가능**            | **가능**           |

> ZFS는 공식적으로 "CoW 파일시스템"으로 분류되지만, 실제 동작은 "기존 블록 복사 없이 새 위치에 쓰고 포인터를 교체"하는 RoW에 해당한다. LVM-Thin과 ZFS를 같은 계열로 묶어 이해하는 것이 실무적으로 더 유용하다.

---

## 4. Proxmox 기본 파티션 구조 확인

```bash
lsblk

# NAME                 MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS
# sda                    8:0    0   64G  0 disk
# ├─sda1                 8:1    0 1007K  0 part   # BIOS boot
# ├─sda2                 8:2    0  512M  0 part   # EFI
# └─sda3                 8:3    0 63.5G  0 part   # LVM PV
#   ├─pve-swap         252:0    0  5.8G  0 lvm  [SWAP]
#   ├─pve-root         252:1    0 26.4G  0 lvm  /
#   ├─pve-data_tmeta   252:2    0    1G  0 lvm          # Thin Pool 메타데이터
#   │ └─pve-data-tpool 252:4    0 29.3G  0 lvm
#   │   └─pve-data     252:5    0 29.3G  1 lvm
#   └─pve-data_tdata   252:3    0 29.3G  0 lvm          # Thin Pool 데이터
#     └─pve-data-tpool 252:4    0 29.3G  0 lvm
#       └─pve-data     252:5    0 29.3G  1 lvm
# sdb                    8:16   0   10G  0 disk   # 추가 디스크 1
# sdc                    8:32   0   10G  0 disk   # 추가 디스크 2
```

`pve-data_tmeta`와 `pve-data_tdata`가 합쳐져 하나의 `pve-data` LVM-Thin Pool을 구성한다. `local-lvm` 스토리지가 이 풀을 사용한다.

---

## 5. 실습 — 3-Phase LVM 랩

### Phase 1: 기존 VG 확장 (`vgextend`) — VFree 0 해소

기존 `pve` VG가 `sda3`으로 꽉 찬 상태에서, `sdb`를 편입하여 여유 공간을 확보한다.

```bash
# 1. sdb를 PV로 초기화
pvcreate /dev/sdb
#   Physical volume "/dev/sdb" successfully created.

# 2. 기존 pve VG에 sdb 편입
vgextend pve /dev/sdb
#   Volume group "pve" successfully extended

# 3. 결과 확인
vgs
#   VG  #PV #LV #SN Attr   VSize  VFree
#   pve   2   4   0 wz--n- 73.49g <10.00g
#         ↑ sda3 + sdb 두 PV가 하나의 VG로 묶임
#                              ↑ VFree가 0에서 10G로 증가

pvs
#   PV         VG  Fmt  Attr PSize   PFree
#   /dev/sda3  pve lvm2 a--  <63.50g      0
#   /dev/sdb   pve lvm2 a--  <10.00g <10.00g
```

sda3은 PFree 0으로 꽉 차있고, sdb는 10GB 전부가 VFree다. 물리적으로 다른 디스크이지만 같은 VG("pve")로 묶여 LVM이 하나의 연속 공간처럼 추상화한다.

> CMP 관점: 스토리지 용량 부족 알람이 발생했을 때, 노드를 재시작하거나 언마운트 없이 이 두 줄(`pvcreate` + `vgextend`)로 온라인 확장이 가능하다. API로는 `POST /nodes/{node}/disks/lvm` 엔드포인트를 사용한다.

---

### Phase 2: 독립 VG + Thin Pool 생성 및 스토리지 등록

`sdc`로 새 VG를 만들고, Thin Pool을 구성하여 Proxmox 스토리지로 등록한다.

```bash
# 1. sdc를 PV로 초기화
pvcreate /dev/sdc
#   Physical volume "/dev/sdc" successfully created.

# 2. 새 VG 생성
vgcreate pve-sub /dev/sdc
#   Volume group "pve-sub" successfully created

vgs
#   VG      #PV #LV #SN Attr   VSize   VFree
#   pve       2   4   0 wz--n-  73.49g <10.00g
#   pve-sub   1   0   0 wz--n- <10.00g <10.00g   ← 신규 VG

# 3. Thin Pool 생성
lvcreate -L 7G -T pve-sub/lab-pool
#   Thin pool volume with chunk size 64.00 KiB can address at most <15.88 TiB of data.
#   Logical volume "lab-pool" created.
#
# -L : Pool 데이터 용량 (메타데이터 크기는 데이터 기준으로 자동 계산)
# -T : Thin Pool 생성 옵션
# pve-sub/lab-pool : VG명/LV명

lvs
#   LV            VG      Attr       LSize   Pool Origin Data%  Meta%
#   data          pve     twi-aotz-- <29.29g             18.98  1.76
#   root          pve     -wi-ao---- <26.43g
#   swap          pve     -wi-ao----  <5.79g
#   vm-201-disk-0 pve     Vwi---tz--  32.00g data
#   lab-pool      pve-sub twi-a-tz--   7.00g             0.00   10.74
#                                                               ↑ Meta% 10.74%
```

**Meta% 10.74%에 대하여:** 새로 만든 7GB Thin Pool의 메타데이터 사용량이 처음부터 10%대인 것이 이상하게 보일 수 있다. 이것은 정상이다.

LVM-Thin 메타데이터는 Pool 크기와 무관한 **고정 최소값**이 존재한다. Pool이 작을수록 메타데이터 오버헤드의 비율이 상대적으로 높게 나타난다. 실제 데이터가 채워지면서 Meta%의 비율은 자연스럽게 줄어든다. 대규모 프로덕션 Pool에서는 Meta%가 1~2% 수준으로 낮아진다.

```bash
# Thin Pool 내부 구조 확인 (-a: 숨겨진 내부 LV 포함)
lvs -a pve-sub
#   LV               VG      Attr       LSize Pool Origin Data%  Meta%
#   lab-pool         pve-sub twi-a-tz-- 7.00g             0.00   10.74
#   [lab-pool_tdata] pve-sub Twi-ao---- 7.00g               ← 데이터 영역
#   [lab-pool_tmeta] pve-sub ewi-ao---- 8.00m               ← 메타데이터 영역
#   [lvol0_pmspare]  pve-sub ewi------- 8.00m               ← 메타데이터 스페어
```

**Attr 필드 해석 (`twi-a-tz--`):**

| 위치 | 값         | 의미                                                |
| ---- | ---------- | --------------------------------------------------- |
| 1    | `t`        | 타입: Thin Pool                                     |
| 2    | `w`        | 권한: 쓰기 가능                                     |
| 3    | `i`        | 할당 정책: inherited (상속)                         |
| 4    | `-`        | Fixed minor: 미지정                                 |
| 5    | `a`        | 상태: active (활성화됨)                             |
| 6    | `-` or `o` | Open state: `-`는 미사용, `o`는 현재 마운트/사용 중 |
| 7    | `t`        | Target type: thin                                   |
| 8    | `z`        | Zeroing: 새로 할당되는 블록을 0으로 초기화          |

```bash
# 4. Proxmox 스토리지로 등록
pvesm add lvmthin lab-storage \
  --vgname   pve-sub \
  --thinpool lab-pool \
  --content  images,rootdir

# 등록 확인
pvesm status
# Name         Type      Status     Total (KiB)   Used (KiB) Available (KiB)    %
# lab-storage  lvmthin   active       7340032            0        7340032    0.00%

cat /etc/pve/storage.cfg | grep -A4 lab-storage
# lvmthin: lab-storage
#     thinpool lab-pool
#     vgname pve-sub
#     content rootdir,images
```

---

### Phase 3: Cleanup — 역순 해제

설정을 역순으로 되돌린다. **순서를 어기면 orphaned volume이 남거나 클러스터 에러 로그가 쏟아진다.**

```markdown
올바른 해제 순서:
Proxmox 스토리지 등록 해제 → LV/Thin Pool 삭제 → VG 삭제 → PV 해제
```

```bash
# STEP 1. Proxmox 스토리지 등록 해제
pvesm remove lab-storage

# 해제 확인 (storage.cfg에서 lab-storage 블록이 사라짐)
cat /etc/pve/storage.cfg

# STEP 2. LV/Thin Pool 삭제
lvremove pve-sub/lab-pool
# Do you really want to remove active logical volume pve-sub/lab-pool? [y/n]: y
#   Logical volume "lab-pool" successfully removed.
# [lab-pool_tdata], [lab-pool_tmeta], [lvol0_pmspare]가 함께 삭제됨

lvs -a pve-sub
# (아무것도 출력되지 않음 — 정상)

# STEP 3. VG 삭제
vgremove pve-sub
#   Volume group "pve-sub" successfully removed

# STEP 4. PV 해제
pvremove /dev/sdc
#   Labels on physical volume "/dev/sdc" successfully wiped.

# 최종 상태 확인
pvs
#   PV         VG  Fmt  Attr PSize   PFree
#   /dev/sda3  pve lvm2 a--  <63.50g      0
#   /dev/sdb   pve lvm2 a--  <10.00g <10.00g

vgs
#   VG  #PV #LV #SN Attr   VSize  VFree
#   pve   2   4   0 wz--n- 73.49g <10.00g
```

Phase 1에서 확장한 `sdb`는 `pve` VG에 그대로 남아 VFree로 유지된다.

---

## 6. LVM 진단 명령어 요약

```bash
# 전체 블록 디바이스 트리
lsblk

# PV 목록
pvs
pvs -o pv_name,pv_size,pv_free,vg_name

# VG 목록
vgs
vgs -o vg_name,pv_count,lv_count,vg_size,vg_free

# LV 목록 (Thin Pool 포함)
lvs
lvs -o lv_name,lv_size,pool_lv,data_percent,metadata_percent

# 숨겨진 내부 LV까지 포함
lvs -a

# 특정 VM VMID의 LV만 필터링
lvs | grep vm-201

# Proxmox 스토리지 상태
pvesm status

# 스토리지 설정 파일
cat /etc/pve/storage.cfg
```

---

## 부록: 검증 체크리스트

```bash
# Phase 1 완료 후
vgs
# → pve VG의 #PV=2, VSize=~73.5G, VFree=~10G 확인

pvs
# → /dev/sda3 (pve, PFree=0), /dev/sdb (pve, PFree=~10G) 확인

# Phase 2 완료 후
pvesm status | grep lab-storage
# → lab-storage lvmthin active ... 확인

# Phase 3 완료 후
pvs | grep sdc
# → 출력 없음 (sdc PV 완전 해제 확인)

pvesm status | grep lab-storage
# → 출력 없음 (스토리지 등록 해제 확인)
```

> **공식 문서:** https://pve.proxmox.com/pve-docs/pve-admin-guide.html#chapter_storage
