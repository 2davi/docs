---
title: "Proxmox VE 실습 - Disk와 LVM-Thin"
date: 2026-04-09
lastmod: 2026-04-09
author: "Davi"
description: "VM 백업/복구와 관련한 Proxmox 개념과 CLI 조작을 다룬다."
slug: "proxmox-vm-backup-and-restore"
section: "notes"
category: "linux"
tags: [proxmox, qemu, kvm, rest-api, cloud-init, guest-agent, vzdump, snapshot, clone, backup, restore, template, upid]
order: 110
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 11
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## Outline

```markdown
[Phase 1] sdb → pve VG 확장
  pvcreate /dev/sdb
  vgextend pve /dev/sdb
  vgs 확인 → PFree 변화 관찰

[Phase 2] sdc → 독립 VG + Thin Pool + 스토리지 등록
  pvcreate /dev/sdc
  vgcreate lab-vg /dev/sdc
  lvcreate -L 7G -T lab-vg/lab-pool
  pvesm add lvmthin lab-storage ...
  lvs, pvesm status 확인

[Phase 3] Cleanup (역순)
```

<DocEmbed
  src="/notes/linux/proxmox/00-proxmox-outline"
  anchor="이전-환경"
  title="실습 전 Proxmox 디스크/스토리지 환경"
  />

---

## 1. Proxmox Disk 관리

### 1.1 가상 디스크이미지 추가

![VirtualBox VM Setting - Proxmox Disk](./assets/20260410_001.png)

![VirtualBox VM Setting - Add Disk](./assets/20260410_002.png)

![VirtualBox VM Setting - Create VirtualBox Disk Image](./assets/20260410_003.png)
가상 디스크 이미지(VDI)를 선택하여 적당한 용량의 디스크를 추가한다.

### 1.2 Proxmox에서 확인

```bash
lsblk
# Linux에 연결된 모든 디스크와 파티션, LVM 트리를 시각적으로 보여주는 명령어

> NAME                 MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS
> sda                    8:0    0   64G  0 disk  # OS가 설치된 Main Disk
> ├─sda1                 8:1    0 1007K  0 part  # 부팅 및 EFI 파티션 (용량이 작은 것들)
> ├─sda2                 8:2    0  512M  0 part  # 부팅 및 EFI 파티션 (용량이 작은 것들)
> └─sda3                 8:3    0 63.5G  0 part  # LVM 파티션: 하위에는 3개의 LV가 달려 있다.
>   ├─pve-swap         252:0    0  5.8G  0 lvm  [SWAP]  ## 스왑(가상 메모리) 파티션
>   ├─pve-root         252:1    0 26.4G  0 lvm  /       ## PVE hostOS가 깔린 루트 파일 시스템
> ## 아래의 두 pve-data_tmeta & _tdata를 합쳐 하나의 pve-data LVM Thin-Pool을 구성한다.
>   ├─pve-data_tmeta   252:2    0    1G  0 lvm          ## `local-lvm`이 사용하는 Thin-Pool: Meta
>   │ └─pve-data-tpool 252:4    0 29.3G  0 lvm
>   │   └─pve-data     252:5    0 29.3G  1 lvm
>   └─pve-data_tdata   252:3    0 29.3G  0 lvm          ## `local-lvm`이 사용하는 Thin-Pool: Data
>     └─pve-data-tpool 252:4    0 29.3G  0 lvm
>       └─pve-data     252:5    0 29.3G  1 lvm
> sdb                    8:16   0   10G  0 disk       # 추가한 디스크: Proxmos-9.1-1_1.vdi
> sdc                    8:32   0   10G  0 disk       # 추가한 디스크: Proxmos-9.1-1_2.vdi
> sr0                   11:0    1 1024M  0 rom   # CD/DVD-ROM 드라이브 (ISO 등)
```

두 디스크는 각각 다음 용도로 사용한다:

```markdown
sdb (10G) → vgextend pve      : 기존 VG 확장, PFree 0 해소
sdc (10G) → vgcreate lab-vg   : 신규 VG + Thin Pool + Proxmox 스토리지 등록
```

---

## Phase 1: 기존 VG 확장 **(`vgextend`)**: VFree 0 해소

```bash
pvcreate /dev/sdb
>   Physical volume "/dev/sdb" successfully created.
# Physical Volume 생성

vgextend pve /dev/sdb
>   Volume group "pve" successfully extended
# 이미 존재하는 Proxmox 기본 Volume Group "pve"에 Physical Volume "/dev/sdb"를 붙여서 확장

vgs
>   VG  #PV #LV #SN Attr   VSize  VFree
>   pve   2   4   0 wz--n- 73.49g <10.00g
#      Attr    w(쓰기 허용), z(리사이즈 허용), n(일반 VG)
#      #PV     1      → 2 (sda와 sdb 두 개의 PV가 붙어있는 Volume Group)
#      VSize   63.50g → 73.49g (sdb의 10GB가 VG에 붙음)
#      VFree   0      → <10.00g (여유 Volume 증가)
```

> **물리 디스크(PV)의 경계를 무시하고 하나의 연속된 풀로 다룬다.**
> OS 재시작도, 언마운트도 없이 온라인 상태(CMP)에서 "스토리지 용량이 부족하다"고 말하면 이 명령 두 줄로 해결된다.

```bash
pvs
>   PV         VG  Fmt  Attr PSize   PFree
>   /dev/sda3  pve lvm2 a--  <63.50g      0
>   /dev/sdb   pve lvm2 a--  <10.00g <10.00g
#  방금 등록한 sdb만 PV 목록에 드러난다. sdc는 아직 PV가 아님.
#  두 PV가 하나의 VG "pve"에 할당되어 있다.
```

> `/dev/sda3`은 PFree 0으로 꽉 차있고, `/dev/sdb`는 10GB 전부 VFree.
> **물리적으로는 서로 다른 디스크**가 같은 VG("pve")로 묶여 있다.
> **LVM은 이 두 PV를 하나의 연속 공간처럼 추상화한다.**

---

## Phase 2: 독립 VG 생성 및 Thin Pool 구성 **(`vgcreate` + `lvcreate -T`)**

`sdc` 디스크를 사용해서 빈 볼륨 그룹 `pve-sub`를 만들고, **실제로 가상머신 디스크를 담을 수 있는 7GB짜리 Thin-Pool을 만드는 작업이다.**

```bash
root@kcy0122:~# pvcreate /dev/sdc
>   Physical volume "/dev/sdc" successfully created.

vgcreate pve-sub /dev/sdc
>   Volume group "pve-sub" successfully created
# 등록한 PV "/dev/sdc"로 새로운 Volume Group을 만든다.

vgs
>   VG      #PV #LV #SN Attr   VSize   VFree
>   pve       2   4   0 wz--n-  73.49g <10.00g
>   pve-sub   1   0   0 wz--n- <10.00g <10.00g
#      VG    pve → pve & pve-sub (새 Volume Group이 목록에 추가되었다.)

lvcreate -L 7G -T pve-sub/lab-pool
>   Thin pool volume with chunk size 64.00 KiB can address at most <15.88 TiB of data.
>   Logical volume "lab-pool" created.
# Logical Volume (Thin-Pool)을 생성한다.
#    -L : Data 용량 지정 (Meta 용량은 Data 기준으로 계산된다.*)
#    -T Thin-Pool을 생성한다는 옵션
#    pve-sub/lab-pool : "pve-sub" VG 안에 "lab-pool"이란 이름으로 생성

lvs
>   LV            VG      Attr       LSize   Pool Origin Data%  Meta%  Move Log Cpy%Sync Convert
>   data          pve     twi-aotz-- <29.29g             18.98  1.76
>   root          pve     -wi-ao---- <26.43g
>   swap          pve     -wi-ao----  <5.79g
>   vm-201-disk-0 pve     Vwi---tz--  32.00g data
>   lab-pool      pve-sub twi-a-tz--   7.00g             0.00   10.74
```

> \* - tmeta 크기 = max(2MiB 최소값, Pool 크기 × chunk 크기 기반 매핑 항목 수 × 64bytes)

```bash
lvs -a pve-sub
>   LV               VG      Attr       LSize Pool Origin Data%  Meta%  Move Log Cpy%Sync Convert
>   lab-pool         pve-sub twi-a-tz-- 7.00g             0.00   10.74
>   [lab-pool_tdata] pve-sub Twi-ao---- 7.00g
>   [lab-pool_tmeta] pve-sub ewi-ao---- 8.00m
>   [lvol0_pmspare]  pve-sub ewi------- 8.00m
```

| 항목                    | 설명                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`(pve VG)          | 기존에 있던 29.29G 짜리 Thin-Pool.                                                                                                                                                                   |
| `root`(pve VG)          | OS가 깔린 26.43G 짜리 일반 논리 볼륨. (파일 시스템 포맷된 디스크)                                                                                                                                    |
| `swap`(pve VG)          | 5.79G 짜리 스왑 파티션. 메모리 부족 시 가상 메모리로 사용한다.                                                                                                                                       |
| `vm-201-disk-0`(pve VG) | 32G 짜리 VM 201의 디스크. Pool 컬럼값인 `data`는, `data`라는 이름의 Thin-Pool에서 용량을 끌어다 쓴다는 뜻이다. Thin Provisioning으로 동작하여, 실제 데이터가 안 찼으면 물리 용량을 다 차지하지 않음. |
| `lab-pool`(pve-sub VG)  | 새로 추가한 7GB 짜리 Thin-Pool. 새삥이라 Data%는 0%이다.                                                                                                                                             |

**Attr(속성) 해석: `twi-a-tz--`**

1. t: Volume type (이 볼륨의 종류가 thin pool이라는 뜻)
2. w: Permissions (writable, 쓰기 가능)
3. i: Allocation policy (inherited, 상속됨)
4. -: Fixed minor (미지정)
5. a: State (active, 활성화되어 사용 가능 상태)
6. - (또는 o): Open state (현재 마운트되거나 사용 중이면 o가 찍히는데, 넌 방금 만들고 안 써서 - 상태임. 반면 위의 data 풀은 o가 찍혀있지?)
7. t: Target type (thin, 씬 프로비저닝 대상)
8. z: Zero (zeroing, 새로 할당되는 블록을 0으로 덮어씀)

> 생성한 Thin-Pool을 사용하여 LVM-Thin 스토리지를 Proxmox에 등록한다.

```bash
pvesm add lvmthin lab-storage \
  --vgname pve-sub \
  --thinpool lab-pool \
  --content images,rootdir
```

---

## Phase 3: Cleanup (역순 해제)

> 작업 사항을 역순으로 되돌린다.
> **순서가 들리면 orphaned volume이 남거나 클러스터 에러 로그가 쏟아질 수 있다.**

```markdown
Proxmox 스토리지 등록 해제 → LV/Thin Pool 삭제 → VG 삭제 → PV 해제
```

**STEP 1. Proxmox Storage 등록 해제:**

```bash
pvesm remove lab-storage
cat /etc/pve/storage.cfg
```

```bash
cat /etc/pve/storage.cfg

> dir: local
>         path /var/lib/vz
>         content import,iso,backup,vztmpl
> 
> lvmthin: local-lvm
>         thinpool data
>         vgname pve
>         content rootdir,images
> 
> nfs: shared
>         export /mnt/nfs_shared
>         path /mnt/pve/shared
>         server 10.10.250.117
>         content vztmpl,iso,images,rootdir,import,backup,snippets
>         prune-backups keep-all=1
# 아래 블록이 제거됨.
# lvmthin: lab-storage
#         thinpool lab-pool
#         vgname pve-sub
#         content rootdir,images
# 등록/해제는 WebUI에서도 순식간에 동기화된다.
```

**STEP 2. LV/Thin-Pool 삭제:**

```bash
lvremove pve-sub/lab-pool
> Do you really want to remove active logical volume pve-sub/lab-pool? [y/n]: y
>   Logical volume "lab-pool" successfully removed.
# [lab-pool_tdata], [lab-pool_tmeta], [lvol0_pmspare]가 함께 날아간다.

lvs -a pve-sub
>
# pve-sub VG는 lab-pool에만 할당된 Volume Group이기 때문에,
# LV 목록에서 "pve-sub"를 달고 있는 녀석을 찾을 수가 없다. 아무것도 출력되지 않는 게 정상.
```

**STEP 3. VG/PV 삭제:**

```bash
vgremove pve-sub
pvremove /dev/sdc
pvs
vgs
```

```bash
vgremove pve-sub
>   Volume group "pve-sub" successfully removed
# Volume Group 삭제

pvremove /dev/sdc
>   Labels on physical volume "/dev/sdc" successfully wiped.
# Physical Volume 삭제

pvs
>   PV         VG  Fmt  Attr PSize   PFree
>   /dev/sda3  pve lvm2 a--  <63.50g      0
>   /dev/sdb   pve lvm2 a--  <10.00g <10.00g
vgs
>   VG  #PV #LV #SN Attr   VSize  VFree
>   pve   2   4   0 wz--n- 73.49g <10.00g
```
