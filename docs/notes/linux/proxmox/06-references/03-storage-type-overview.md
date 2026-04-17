---
title: "Proxmox 스토리지 타입 완전 정리"
date: 2026-04-14
lastmod: 2026-04-16
author: "Davi"
description: "Linux 디스크 레이어(PV→VG→LV)부터 Proxmox 스토리지 플러그인(Directory, LVM-Thin, ZFS, NFS, Ceph, PBS)까지 계층별로 정리한 레퍼런스."
slug: "storage-type-overview"
section: "notes"
category: "proxmox/ref."
tags: [proxmox, lvm, zfs, nfs, ceph, pbs, storage, lvm-thin, lvmthin, directory]
order: 3
series: "Proxmox VE 학습 시리즈"
#series_order: 0
status: "active"
draft: false
search: true
toc: true
difficulty: "intermediate"
version: "Proxmox VE 9.1"
---

## 1. 전체 구조를 먼저 그려라

스토리지를 이해하는 가장 빠른 방법은 "레이어(layer)"로 나눠 보는 것이다. Proxmox가 스토리지를 사용하는 흐름은 아래처럼 쌓인다.

```
[물리 디스크 / VirtualBox 디스크 이미지]
         ↓
[파티션 / 블록 디바이스 (/dev/sda, /dev/vda 등)]
         ↓
[볼륨 관리 계층 (LVM) 또는 파일시스템 직접 마운트]
         ↓
[Proxmox 스토리지 플러그인이 그 위에서 관리]
         ↓
[VM 디스크 이미지 / 백업 / ISO / CT 볼륨]
```

Proxmox 스토리지 타입이란 결국 "맨 위 레이어에서 어떤 방식으로 VM 디스크를 할당하고 관리하느냐"를 결정하는 플러그인이다. 그 아래에 LVM이 있든, ZFS가 있든, NFS로 마운트된 경로가 있든 무관하게, Proxmox는 그 위에 적절한 플러그인을 올려서 쓴다.

---

## 2. Linux 디스크 레이어: 물리 디스크 → LVM

### 2-1. 물리 디스크와 블록 디바이스

모든 스토리지의 출발점은 물리 디스크(또는 VirtualBox 이미지처럼 OS가 블록 디바이스로 바라보는 것)다. Linux는 이것을 `/dev/sda`, `/dev/vda` 같은 블록 디바이스(block device) 경로로 노출한다. 블록 디바이스는 "임의의 위치를 블록 단위로 읽고 쓸 수 있는 장치"를 의미한다.

### 2-2. LVM 계층: PV → VG → LV

LVM(Logical Volume Manager)은 하나 이상의 블록 디바이스를 추상화해서 유연하게 논리적 볼륨을 만들어주는 커널 서브시스템이다.

| 계층 | 이름 | 역할 |
| ---- | ---- | ---- |
| 1단계 | **PV** (Physical Volume) | 블록 디바이스(`/dev/sda1` 등)를 LVM이 인식하는 단위로 초기화한 것 |
| 2단계 | **VG** (Volume Group) | 하나 이상의 PV를 묶어서 하나의 "가상 디스크 풀"을 만든 것. 이 풀 안에서 LV를 잘라서 쓴다 |
| 3단계 | **LV** (Logical Volume) | VG를 잘라서 만든 "가상 파티션". 파일시스템을 올리거나 Proxmox가 VM 디스크로 직접 사용 |

### 2-3. LVM-Thick vs LVM-Thin: 핵심 차이

LV를 만들 때 공간을 "언제 실제로 할당하느냐"에 따라 두 가지 방식이 갈린다.

**LVM-Thick (일반 LVM):**
- LV를 생성할 때 선언한 크기만큼 물리 공간을 **즉시** 확정해서 예약한다.
- 20GB LV를 만들면 VG에서 20GB가 바로 없어진다.
- 스냅샷을 만들면 "변경 예정 블록을 복사할 공간"을 미리 별도로 할당해야 하므로(CoW 방식), 스냅샷 공간이 부족하면 스냅샷이 깨진다.
- 오버 프로비저닝 불가. 단순하고 예측 가능한 구조.

**LVM-Thin (씬 프로비저닝):**
- VG 안에 먼저 **Thin Pool**을 만들고, 그 위에 Thin Volume을 올린다.
- Thin Volume은 선언 크기보다 실제 물리 할당이 적어도 된다. 실제로 데이터가 써질 때 블록이 할당된다. 이게 **지연 할당(deferred allocation)**이다.
- 예: Thin Pool이 50GB인데, 각 20GB짜리 Thin Volume 5개를 만들 수 있다(합계 100GB). 실제 사용량이 50GB를 넘으면 그때 꽉 찬다.
- 스냅샷이 훨씬 효율적이다. Thin Volume과 스냅샷이 같은 데이터 영역을 공유하고, 변경된 블록만 추적하는 RoW(Redirect-on-Write) 구조이기 때문이다.
- Proxmox에서 **Linked Clone**과 VM 스냅샷이 가능한 이유가 이 Thin Pool 구조 덕분이다.

---

## 3. ZFS: "볼륨 관리자 + 파일시스템"을 하나로 합친 것

### 3-1. ZFS가 다른 이유

전통적인 Linux 구조에서는 "블록 디바이스 → LVM → 파일시스템(ext4, xfs 등)" 이렇게 세 레이어가 분리되어 있다. ZFS는 이 세 레이어를 **하나의 시스템으로 통합**한다.

ZFS는 스토리지 풀(zpool)을 기반으로 직접 파일시스템과 블록 볼륨(zvol)을 관리하기 때문에, LVM 같은 별도 볼륨 관리자가 필요 없다.

### 3-2. ZFS 계층 구조

```
[물리 디스크 1, 2, 3 ...]
         ↓
[vdev (virtual device): 디스크 1~N개의 RAID 그룹 단위]
         ↓
[zpool: 하나 이상의 vdev로 구성된 최상위 스토리지 풀]
         ↓
[dataset (파일시스템) 또는 zvol (블록 볼륨)]
```

- **vdev**: zpool을 구성하는 최소 단위. 단일 디스크, 미러(RAID-1), RAIDZ(RAID-5 계열) 등 구성 가능.
- **zpool**: 서버의 최상위 스토리지 풀. 여러 vdev로 구성된다.
- **dataset**: zpool 내에서 파일시스템 역할. 쿼터, 압축, 스냅샷 등을 개별 설정 가능.
- **zvol**: dataset 대신 "블록 디바이스"처럼 쓰이는 볼륨. Proxmox에서 VM 디스크를 ZFS에 올리면 zvol 단위로 생성된다.

### 3-3. ZFS의 핵심 메커니즘

- **CoW (Copy-on-Write)**: 데이터를 덮어쓰지 않고, 변경 시 새로운 블록에 먼저 쓰고 메타데이터 포인터를 업데이트한다. 이 덕분에 스냅샷이 극히 빠르고 가볍다.
- **체크섬 기반 무결성 검증**: 모든 블록에 체크섬을 달아, 읽을 때마다 손상 여부를 자동 감지하고 복구한다(self-healing).
- **압축 & 중복 제거(dedup)**: 인라인에서 LZ4/GZIP 등으로 압축, 동일 블록 dedup 가능. 단 dedup은 메모리를 많이 쓰므로 기본 비활성화.
- **ARC 캐시**: RAM을 L1 캐시로, 선택적으로 SSD를 L2ARC(L2 캐시)로 쓰는 계층형 캐시 구조.

### 3-4. ZFS vs LVM: 무엇을 언제 쓰나

| 항목 | LVM / LVM-Thin | ZFS |
| ---- | -------------- | --- |
| 메모리 요구량 | 낮음 | 높음 (1TB당 1GB RAM 권장) |
| 순수 I/O 성능 | 더 빠름, 오버헤드 적음 | 보통~높음 (CPU bound) |
| 데이터 무결성 | 체크섬 없음 | 종단간 체크섬, self-healing |
| 스냅샷 안정성 | 많이 쌓이면 성능 저하 | CoW 기반으로 안정적 |
| Proxmox VM 복제 지원 | 미지원 | 네이티브 스냅샷 활용 가능 |
| 하드웨어 RAID 호환성 | 우수 | 직접 디스크 접근 필요, 하드웨어 RAID와 충돌 가능 |

---

## 4. Proxmox 스토리지 타입 분류

Proxmox는 스토리지를 크게 두 가지 종류로 나눈다.

- **파일 기반(file-based)**: 파일시스템 위의 디렉터리를 스토리지로 씀. VM 디스크 이미지를 파일(qcow2, raw 등)로 저장.
- **블록 기반(block-based)**: 파일시스템을 거치지 않고 블록 디바이스를 직접 VM에 제공. 블록을 raw하게 다룸.

### 4-1. Directory (파일 기반)

- 구조: Linux 어느 파일시스템(ext4, xfs 등)이든 마운트된 디렉터리를 그대로 스토리지로 쓴다.
- VM 디스크는 해당 디렉터리 아래 파일(`.qcow2`, `.raw`)로 저장된다.
- 가장 단순한 구조. ISO 이미지, CT 템플릿, 백업 파일 저장에 적합.
- 스냅샷: qcow2 포맷을 쓰면 파일 레벨 스냅샷 가능(성능 불리).
- Proxmox 설치 시 기본으로 생기는 **local** 스토리지가 이 타입이다.

### 4-2. LVM (Thick)

- 구조: LVM VG를 직접 Proxmox 스토리지로 등록. VM 디스크 하나당 LV 하나가 생성됨.
- 할당 즉시 물리 공간 확정(Thick). 오버 프로비저닝 불가.
- 블록 기반이라 성능은 단순하고 예측 가능하지만, 스냅샷 지원이 제한적(Thick 스냅샷은 별도 공간 필요).
- Proxmox에서 VM 스냅샷(메모리 포함)은 불가능하다.

### 4-3. LVM-Thin

- 구조: VG 안에 Thin Pool LV를 만들고, 그 위에 Proxmox가 VM 디스크마다 Thin Volume을 생성.
- 지연 할당으로 스토리지 효율이 높고, 오버 프로비저닝 가능.
- **스냅샷과 Linked Clone 지원**: Thin Volume 간에 CoW 체인을 형성할 수 있어, Proxmox의 VM 스냅샷 및 Linked Clone 기능을 활용할 수 있다.
- 현재 학습 환경의 **local-lvm**이 이 타입.

### 4-4. ZFS

- 구조: zpool 위에 zvol 단위로 VM 디스크를 생성. 파일시스템 + 볼륨 관리자 통합.
- CoW 기반 스냅샷, 체크섬 무결성, 압축, RAID-Z 내장.
- Proxmox VM 복제(replication) 기능이 ZFS 스냅샷을 활용해 동작한다.
- 메모리 요구량이 높다. 최적 성능을 위해 RAM 여유가 필요.
- 현재 학습 환경의 **local-zfs**가 이 타입.

### 4-5. NFS

- 구조: 다른 서버(또는 NAS)가 네트워크로 공유한 디렉터리를 Proxmox 노드에 마운트해서 **파일 기반 스토리지**로 쓴다.
- NFS 서버 측에서 `/etc/exports`로 디렉터리를 공개, Proxmox 노드들은 이걸 마운트해서 같은 경로를 바라본다.
- 여러 노드가 동일한 NFS 경로를 공유하기 때문에 **멀티 노드 공유 스토리지**로 동작한다. HA나 라이브 마이그레이션에 활용 가능.
- 성능과 가용성은 NFS 서버의 품질에 종속됨. NFS 서버가 내려가면 스토리지도 오프라인 됨.
- 현재 학습 환경의 **shared**가 이 타입.

### 4-6. Ceph (RBD)

- 구조: Ceph는 여러 노드의 물리 디스크를 하나의 **분산 오브젝트 스토리지 클러스터**로 묶는 소프트웨어다.
- Proxmox는 Ceph의 **RBD(RADOS Block Device)**를 통해 VM 디스크를 블록 디바이스처럼 사용한다.
- LVM처럼 OS 레벨 블록 디바이스에 직접 올라가는 게 아니라, Ceph가 디스크와 Proxmox 사이에 "분산 스토리지 계층"으로 끼어들어 모든 디스크 I/O를 가로채는 구조다.
- 특징: 수평 확장(OSD 노드 추가로 용량/성능 확장), 3중 복제로 고가용성 제공, 노드 장애 시에도 데이터 보호.
- 단점: 10GbE 이상의 전용 네트워크 필요, 최소 3노드 이상 권장, 운영 복잡도가 높다.
- 소규모 환경이나 단일 노드에서는 실익이 없다. 멀티 노드 클러스터를 위한 스토리지다.

### 4-7. PBS (Proxmox Backup Server)

- 구조: PBS는 앞의 스토리지 타입들과 **다른 레이어**에 있다. VM 디스크를 올리는 곳이 아니라, **백업 데이터를 저장하는 전용 서버**다.
- PVE가 VM을 백업할 때, PBS는 디스크 내용을 **청크(chunk)** 단위로 쪼개서 해시 기반으로 저장한다. 동일 청크가 이미 있으면 재사용, 없으면 새로 저장하는 방식으로 **중복 제거(deduplication)**를 한다.
- 첫 백업은 full에 가깝지만, 이후 백업은 변경된 청크만 추가로 저장하는 **증분 백업** 구조다.
- PVE에서 `type: pbs`로 등록된 스토리지 항목은 "PBS 서버에 접속하기 위한 설정"이고, 실제 데이터는 PBS 서버 내부의 datastore에 쌓인다.
- PBS 서버 자체는 전용 ISO(Debian 기반)로 별도 VM 또는 물리 머신으로 운영하는 것이 정석이다.

---

## 5. 전체 타입 비교

| 타입 | 분류 | 기반 | 스냅샷 | 공유 가능 | 주요 용도 |
| ---- | ---- | ---- | ------ | --------- | --------- |
| Directory | 파일 기반 | 임의 파일시스템 디렉터리 | qcow2 한정 | X (기본) | ISO, 백업, 단순 VM |
| LVM (Thick) | 블록 기반 | LVM LV | 제한적 | X | 단순 VM 디스크 |
| LVM-Thin | 블록 기반 | LVM Thin Pool | 가능 (RoW) | X | VM 디스크, 스냅샷/클론 |
| ZFS | 파일+블록 통합 | zpool / zvol | CoW, 안정적 | 부분적 | VM 디스크, 고무결성 환경 |
| NFS | 파일 기반 (네트워크) | 원격 NFS 서버 디렉터리 | qcow2 한정 | O | 멀티 노드 공유, 백업 |
| Ceph RBD | 블록 기반 (분산) | Ceph 클러스터 | 가능 | O | 멀티 노드 HA 클러스터 |
| PBS | 백업 전용 | PBS 서버 chunk store | N/A | O | VM/CT 증분 백업 |

---

## 6. 학습 환경 스토리지 매핑

현재 학습 환경:

| 스토리지 ID | 타입 | 기반 | 주 용도 |
| ----------- | ---- | ---- | ------- |
| `local` | Directory | `/var/lib/vz` | ISO, 스크립트, 백업 |
| `local-lvm` | LVM-Thin | `pve` VG의 `data` thin-pool | VM 디스크 기본 위치 |
| `local-zfs` | ZFS | `local-zfs` zpool (별도 디스크) | VM 디스크, Replication, HA |
| `shared` | NFS | pve-ksy:/mnt/nfs_shared | 멀티 노드 공유, 백업 파일 |
| `local-pbs` | PBS | VM 501 bkp-api (10.10.250.120) | 증분 백업, Verify |

"VM 디스크를 어디에 올릴까" = `local-lvm` 또는 `local-zfs`, "백업을 어디에 저장할까" = `shared` 또는 `local-pbs`로 역할이 나뉘어져 있다.

---

## 참고 자료

| 주제 | URL |
| ---- | --- |
| Proxmox 스토리지 공식 문서 | https://pve.proxmox.com/pve-docs/pve-admin-guide.html#chapter_storage |
| LVM 공식 (Red Hat) | https://docs.redhat.com/ko/documentation/red_hat_enterprise_linux/9/html-single/configuring_and_managing_logical_volumes/index |
| ZFS 공식 문서 (OpenZFS) | https://openzfs.github.io/openzfs-docs/ |
| Proxmox ZFS 가이드 | https://pve.proxmox.com/pve-docs/pve-admin-guide.html#chapter_zfs |
| Proxmox NFS 스토리지 | https://pve.proxmox.com/pve-docs/pve-admin-guide.html#storage_nfs |
| Proxmox Ceph 가이드 | https://pve.proxmox.com/pve-docs/pve-admin-guide.html#chapter_pveceph |
| PBS 공식 문서 | https://pbs.proxmox.com/docs/ |
| ZFS vs LVM (Proxmox 포럼) | https://forum.proxmox.com/threads/zfs-vs-lvm.html |
