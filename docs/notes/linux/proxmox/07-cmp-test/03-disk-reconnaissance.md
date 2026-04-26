---
title: "03. 디스크 정찰 — 물리·논리 스토리지 계층의 해부"
date: 2026-04-24
lastmod: 2026-04-24
author: "Davi"
description: "5노드 Proxmox 클러스터의 물리 디스크 구성, ZFS rpool 구조, LVM 공유/로컬 구별, ARC 튜닝, iSCSI 세션 상태, NFS 마운트 매트릭스를 해부한다. 챕터 04(스토리지 자원 관리)의 전제가 되는 디스크 계층 지식을 확보하는 것이 목적이다."
slug: "disk-reconnaissance"
section: "notes"
category: "linux/proxmox/cmp-test"
tags: [proxmox, disk, zfs, lvm, iscsi, nfs, arc, storage, cmp]
order: 3
series: "CMP Pre-Test Reconnaissance Handbook"
series_order: 3
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1.1"
---

## 0. 이 챕터의 정찰 목적

챕터 02는 노드를 CPU·메모리·부하 분포 관점에서 해부했다. 본 챕터는 **같은 노드를 스토리지 관점에서 다시 해부**한다. 하나의 물리 블록 디바이스가 어떤 경로를 거쳐 VM의 가상 디스크까지 도달하는지, 그 과정의 각 계층이 5노드에서 어떻게 같고 어떻게 다른지를 보는 것이 목적이다.

스토리지 계층은 다음 6단계로 쌓여 있다.

```markdown
계층 6: VM 가상 디스크 (scsi0, virtio0, ide0, ...)     ← CMP가 노출하는 UI 수준
계층 5: PVE storage ID (pve-nd06-nfs, local-zfs, ...)   ← Datacenter Storage Management
계층 4: 파일시스템 또는 블록 프로토콜 (NFS, ZFS, LVM)
계층 3: 블록 디바이스 (sdX, nvmeXnY, zdXX, zvol)
계층 2: 전송 계층 (iSCSI, NVMe, 직결)
계층 1: 물리 디스크 (NVMe SSD, TrueNAS LUN)
```

본 챕터는 **계층 1~4**에 집중한다. 계층 5~6은 챕터 04(스토리지 자원 관리)에서 다룬다. 그러나 VM 디스크 매트릭스(계층 6)는 본 챕터 §2.6에서 **어떤 VM이 어느 스토리지에 들어있는지의 사실 매트릭스**로 박제한다 — 이게 없으면 챕터 04의 정책 분석이 공중에 뜬다.

### 0.1 정찰 전 인지와 정찰 후 인지의 격차 — 본 챕터가 드러낸 사례

본 챕터 데이터 수집 직전 시점, 핸드북 작성자는 `vg-prom` LVM Volume Group을 **nd05 전용 로컬 자원**으로 인지하고 있었다. 챕터 02 §2.5에서 nd05 CPU 상위 VM(Grafana01, Prom01)의 디스크 경로가 `/dev/vg-prom/vm-*`로 나타났고, 이 경로가 nd05에서만 관찰되는 것처럼 보였기 때문이다. 사용자(테스터)도 동일하게 "nd05 전용"으로 인지하고 있었다.

본 챕터 §2.5의 LVM 전수 조사 결과, 이 인지는 **사실과 다름**이 드러났다. `vg-prom`은 5노드 모두에 존재하는 **shared iSCSI LVM**이었다. 50 GiB짜리 동일 iSCSI LUN(시리얼 `e78276acd917de9`)이 5노드에 모두 보이고, 그 위에 LVM이 얹혀 있다. 다만 LV의 활성 플래그가 nd05에서만 `active`이고 다른 4노드에서는 `inactive` 상태이기 때문에, 노드별 관찰로는 **"nd05에만 있는 것처럼 보였다"**.

이 격차를 핸드북에 박는다. 두 가지 원칙이 여기서 도출된다.

1. **스토리지 관점 없이 자원의 정체를 단정하지 않는다.** 챕터 02는 노드 관점(CPU·부하·VM)이었기 때문에 `vg-prom`이 shared인지 local인지를 판별할 수 없었다. 같은 자원이라도 어느 계층에서 보느냐에 따라 다르게 보인다.
2. **정찰 순서가 결론을 왜곡할 수 있다.** 챕터 02만 읽은 사람은 "nd05 전용"으로 오해할 수 있다. 본 챕터에서 정정이 이뤄지지 않으면 그 오해가 테스트 설계에 박힌다 — 예를 들어 "nd05의 local storage 장애 시나리오"에 Prometheus VM을 포함시키는 오류.

이 경험이 **챕터 02를 읽을 때 반드시 챕터 03을 함께 읽어야 완전한 이해가 된다**는 핸드북 내부의 의존 관계를 형성한다.

### 0.2 본 챕터가 해소하는 미결 항목

- 챕터 00 §1.3에서 **"모든 스토리지가 단일 ZFS pool에 수렴"** 가정 — 2026-04-24 오전 nd07 추가로 상태 변동. 본 챕터에서 실체 확인.
- 챕터 01 §2.4에서 언급된 **`storage.cfg` mtime 변동** — 본 챕터 §2.6 VM 디스크 매트릭스와 교차 검증하여 어떤 자원이 추가·제거 중인지 구체화.
- 챕터 02 §2.2의 **Swap 0 + ZFS 환경** — 본 챕터 §2.4에서 **ARC 튜닝의 의도**가 드러난다.
- 챕터 02 §7.1 VM 112 지속 관찰 대상의 **디스크 계층** — 본 챕터 §2.3에서 로컬 zvol임을 재확인.

---

## 1. 개념 — 본 챕터 이해에 필요한 최소 배경

### 1.1 ZFS rpool, zvol, zd 디바이스

Proxmox 기본 설치는 OS 디스크에 **ZFS mirror로 rpool을 구성**한다. 본 환경은 5노드 모두 2개의 NVMe SSD로 mirror pool을 구성하고, 그 위에 다음 dataset/volume을 운영.

```markdown
rpool
├── ROOT/pve-1   (PVE OS 루트 파일시스템)
├── var-lib-vz   (ISO, snippet, container 템플릿)
└── data         (VM 디스크 저장 dataset)
    ├── vm-100-disk-0  (ZFS volume = zvol, block device로 노출)
    ├── vm-112-disk-0
    └── ...
```

**zvol**(ZFS volume)은 ZFS가 블록 디바이스처럼 노출하는 객체다. 파일시스템이 아니다. Linux는 이를 `/dev/zd*` (또는 `/dev/zvol/rpool/data/vm-XXX-disk-N`) 경로의 블록 디바이스로 제공하며, QEMU는 이를 raw 블록 디바이스로 VM에 꽂는다. `lsblk`에 나타나는 `zd0`, `zd16`, `zd32` 등이 모두 zvol이다. 이들은 **물리 디스크가 아니고 ZFS 내부의 가상 블록 디바이스**다.

### 1.2 ZFS ARC (Adaptive Replacement Cache)

ZFS는 읽기 캐시로 **ARC**(Adaptive Replacement Cache)를 메모리에 유지한다. Linux 기본 페이지 캐시와 다른 메커니즘이며, Proxmox는 기본적으로 시스템 RAM의 50%를 ARC 상한(`c_max`)으로 설정한다.

본 환경의 ARC 설정은 기본값과 다르다(§2.4). **5노드 모두 `c_max = 1 GiB`로 수동 튜닝**되어 있다. 이는 30 GiB 머신에서 50%(=15 GiB) 기본값이 아닌 약 3.3%에 해당하는 낮은 값이다.

이 설정이 왜 이렇게 되어 있는지의 해석은 챕터 02의 context(Swap 0, VM 오버프로비저닝 우려)와 결합된다 — 자세한 것은 §2.4에서.

### 1.3 LVM — PV / VG / LV와 Shared LVM

LVM(Logical Volume Manager)은 세 계층으로 구성된다.

- **PV (Physical Volume)**: `pvcreate`로 LVM 관리 대상으로 등록된 블록 디바이스. 본 환경에서는 iSCSI LUN(`/dev/sdX`) 위에 구성되는 경우가 많다.
- **VG (Volume Group)**: 여러 PV를 묶는 논리 그룹.
- **LV (Logical Volume)**: VG 내부에 할당된 논리 볼륨. VM 디스크로 노출되는 단위.

일반 LVM은 단일 노드만 VG에 접근한다. 그러나 **Shared LVM**(Proxmox가 지원하는 `lvm-shared` 스토리지 타입)은 다르다.

- 같은 iSCSI LUN이 여러 노드에 동시 visible
- 모든 노드가 VG metadata를 읽을 수 있음
- 그러나 **동시에 같은 LV에 쓰지 못하도록 Proxmox가 잠금 조정**
- VM이 동작 중인 노드에서만 LV가 `active open` 상태(`lvs`의 Attr 컬럼 `-wi-ao----`)
- 다른 노드에서는 LV가 `inactive` 상태(`-wi-------`)

이 구조가 **VM을 shared storage에 올린 채 노드 간 마이그레이션 가능**하게 한다. VM 정지 없이 다른 노드로 이동 가능(live migration). 본 환경의 `vg-prom`이 정확히 이 구조다.

LV Attr의 컬럼 해석:

```markdown
  -wi-ao----
  │││││││││└─ (9) 해당 없음
  ││││││││└── (8) 해당 없음
  │││││││└─── (7) Skip activation (비활성화 플래그)
  ││││││└──── (6) Target type
  │││││└───── (5) LV 상태: o=open (실제 사용 중)
  ││││└────── (4) Allocation policy
  │││└─────── (4) 고정 또는 비고정
  ││└──────── (3) LV 상태: a=active, 공백=inactive  ← 핵심 판독 위치
  │└───────── (2) Permissions: w=writable
  └────────── (1) Volume type: -=일반 LV
```

**`-wi-ao----`**는 active + open(사용 중). **`-wi-------`**는 inactive(VG만 읽히는 상태).

### 1.4 iSCSI 세션의 "0B" 디스크 — LUN 해제 흔적

iSCSI initiator(Proxmox)가 target(TrueNAS)에 세션을 맺으면, 각 exported LUN이 `/dev/sdX`로 보인다. 그런데 TrueNAS에서 LUN을 삭제하거나 mapping을 해제하면, **initiator 측 세션은 남아 있지만 그 LUN의 블록 디바이스는 크기 0으로 나타난다**.

`lsblk`에서 `0B` 크기로 나오는 iSCSI disk가 바로 이 상태다. 본 환경에서 이런 "0B 디스크"가 5노드 합쳐서 20건 이상 관찰된다(§2.2.2). 이들은 **과거에 연결되었으나 현재는 유효하지 않은 iSCSI LUN의 유령 흔적**이다.

이 상태가 야기하는 문제:

1. **iSCSI 세션 재초기화 시 timeout 유발**: `iscsid`가 존재하지 않는 LUN에 계속 재연결 시도
2. **부팅 시간 증가**: 부팅 중 iSCSI 자동 로그인에서 deadend LUN들의 timeout이 누적
3. **모니터링 툴 혼란**: CMP가 이 0B 디스크를 "정상 디스크"로 집계할 수 있음

cleanup 방법은 §7에서 다룬다. 본 챕터 범위에서는 **사실 박제까지만** 수행하고, 실제 정리는 챕터 04 또는 운영팀 인계로 처리한다 — iSCSI 세션 정리는 L3 이상 격자에 해당하여 단독 판단 금지.

### 1.5 NFS 마운트 경로의 "alias chaos"

하나의 NFS export가 **여러 다른 로컬 마운트 경로로 마운트**되는 상태를 본 핸드북은 **"alias chaos"**로 명명한다. 예를 들어:

```markdown
10.99.30.16:/mnt/pve-nd06-zfs/nfs-test-testerB → /mnt/pve/nfs-test-testerB   (정상)
10.99.30.16:/mnt/pve-nd06-zfs/nfs-test-testerB → /mnt/pve/test-nfs-001       (별칭 1)
10.99.30.16:/mnt/pve-nd06-zfs/nfs-test-testerB → /mnt/pve/test001             (별칭 2)
```

같은 실제 데이터에 **세 개의 접근 경로**가 존재한다. 이 상태는 Proxmox의 storage.cfg에서 동일 NFS export를 세 번 다른 storage ID로 등록한 결과이며, 사용자/테스터가 각자 테스트 편의상 생성한 별칭들이다.

**문제는 삭제 작업**이다. 한 경로로 접근해서 "내 데이터 아니네" 하고 지우면, 세 경로 모두에서 해당 데이터가 사라진다. 게다가 본 환경에서는 testerC의 export가 testerB의 이름으로 alias된 경우가 존재(§3.2에서 구체 사례). 이는 정리 작업을 **격자 L2 이상**으로 만든다. 본 챕터에서는 사실만 박제하고 정리 자체는 챕터 04에서 다룬다.

### 1.6 Directory storage와 마이그레이션 제약

Proxmox는 세 가지 storage 유형을 VM 디스크에 사용한다.

| 유형                                        | 예시                       | 마이그레이션                                   | Live migration           | HA 적합 |
| ------------------------------------------- | -------------------------- | ---------------------------------------------- | ------------------------ | ------- |
| **Shared** (NFS, iSCSI shared LVM, Ceph 등) | `pve-nd06-nfs`, `prom-lvm` | 가능                                           | 가능                     | 가능    |
| **Local file-based** (directory)            | `node03-dir`, `local`      | 오프라인 마이그레이션만                        | 불가                     | 부적합  |
| **Local block** (local-zfs, local-lvm)      | `local-zfs`                | 오프라인 마이그레이션 또는 storage replication | replication 구성 시 가능 | 조건부  |

본 환경에서는 세 유형이 모두 사용된다(§2.6). 특히 **`node03-dir`**는 nd03 한 노드에만 존재하는 로컬 디렉터리 스토리지로, 여기에 디스크가 있는 VM은 nd03에서만 동작 가능 — 마이그레이션·HA 둘 다 제약된다. VM 100015가 이 케이스(§2.6).

---

## 2. 정찰 명령과 출력 해석

데이터 수집: 2026-04-24 오전. 5노드 동시 수집.

### 2.1 물리 디스크 구성 — 5노드 NVMe mirror + iSCSI 다수

#### 2.1.1 NVMe OS 디스크 (5노드 동일 구성)

`lsblk -d -o NAME,SIZE,ROTA,TYPE,MODEL,SERIAL,TRAN` 결과에서 NVMe 부분만 추출.

| 노드 | NVMe 0 시리얼 | NVMe 1 시리얼 | 용도         |
| ---- | ------------- | ------------- | ------------ |
| nd01 | `...16525C`   | `...15725C`   | rpool mirror |
| nd02 | `...16325C`   | `...16225C`   | rpool mirror |
| nd03 | `...15525C`   | `...15425C`   | rpool mirror |
| nd04 | `...16025C`   | `...15125C`   | rpool mirror |
| nd05 | `...15925C`   | `...15825C`   | rpool mirror |

- **모델 통일**: 5노드 모두 `M.2 BTS-M256GB` (238.5 GiB)
- **mirror 구성**: 5노드 모두 2-way mirror (§2.3 zpool status에서 확인)
- **SMART 상태**: 5노드 10개 NVMe 모두 `PASSED`

**시리얼 번호 끝자리가 25C로 공통**이라는 점이 눈에 띈다. 같은 배치에서 공급받은 SSD임이 확실하다. 동시 장애 risk(동일 로트 결함)가 있다 — 이는 `smartctl -a`의 마모도·통전시간 모니터링으로 주기 점검 필요. 챕터 08(위험 매트릭스) 인계.

#### 2.1.2 iSCSI 디스크 — 5노드에서 공유 LUN + 대량의 "0B" 유령 디스크

`lsblk`의 `iscsi` TRAN 디스크만 추출하여 시리얼 기준 매트릭스로 정리.

| iSCSI 시리얼      | nd01      | nd02                | nd03      | nd04                | nd05      | 크기       | 해석                          |
| ----------------- | --------- | ------------------- | --------- | ------------------- | --------- | ---------- | ----------------------------- |
| `81041013d00e296` | sda (5G)  | sdc (5G)            | —         | sda (5G)            | —         | 5 GiB      | 3노드 공유                    |
| `3eb0629863ea56f` | sdb (5G)  | sdd (5G)            | —         | sdb (5G)            | —         | 5 GiB      | 3노드 공유                    |
| `e78276acd917de9` | sdc (50G) | sdf (50G)           | sda (50G) | sde (50G)           | sde (50G) | **50 GiB** | **5노드 공유 (vg-prom)**      |
| `375c023bd2e3036` | sdd (0B)  | sdg (0B)            | —         | sdf (0B)            | sda (0B)  | 0 B        | **유령 LUN**                  |
| `3c84397c8036522` | sde (20G) | sdh (20G)           | —         | sdg (20G)           | sdd (20G) | 20 GiB     | 4노드 공유                    |
| `c2bb19be5c55a0f` | sdf (80M) | sdi (80M)           | sdb (80M) | sdh (80M)           | sdb (80M) | 80 MiB     | 5노드 공유 (lvm-test-testerC) |
| `6ccd2e16fa1b795` | sdg (0B)  | sdj (0B)            | —         | sdi (0B)            | sdf (0B)  | 0 B        | **유령 LUN**                  |
| `3a4bcad67d41e6c` | sdh (0B)  | sdk (0B)            | —         | sdj (0B)            | —         | 0 B        | **유령 LUN**                  |
| `700d99093c9b7fd` | sdi (0B)  | sdl (0B)            | —         | sdk (0B)            | —         | 0 B        | **유령 LUN**                  |
| `59ebaaf7d1a929d` | sdj (0B)  | sdm (0B)            | sde (0B)  | sdl (0B)            | sdg (0B)  | 0 B        | **유령 LUN**                  |
| `b8edeefbb519845` | —         | sda (1G) + sdb (1G) | —         | sdc (1G) + sdd (1G) | —         | 1 GiB × 2  | 2노드에 중복 path             |
| `fa659d50789cdf8` | —         | sde (0B)            | —         | —                   | —         | 0 B        | **유령 LUN**                  |
| `b3b7d205f963f9e` | —         | —                   | —         | —                   | sdc (0B)  | 0 B        | **유령 LUN**                  |
| `d4fe6c8f815836d` | —         | —                   | —         | —                   | sdh (20G) | 20 GiB     | nd05 단독                     |
| `b385e51765572f5` | —         | —                   | —         | —                   | sdi (15G) | 15 GiB     | nd05 단독                     |
| `c549a38541ef4d0` | —         | —                   | —         | —                   | sdj (25G) | 25 GiB     | nd05 단독                     |
| `14d38e435880268` | —         | —                   | —         | —                   | sdk (15G) | 15 GiB     | nd05 단독                     |

**판독**:

1. **5노드 공유 LUN은 2개**: `e78276acd917de9` (50 GiB, vg-prom용)와 `c2bb19be5c55a0f` (80 MiB, testerC 테스트용). 이 두 LUN이 **모든 노드에 visible한 진짜 shared block**이다.
2. **유령 LUN 총계**: 5노드 각각에서 관찰되는 0B 디스크 합계 **약 20건**. 대응 관계(같은 시리얼이 여러 노드에 나타남)를 고려하면 **고유 유령 LUN 7~8개**. TrueNAS 측에서 LUN이 삭제·해제되었지만 PVE initiator 측 세션이 살아있는 상태.
3. **nd03의 iSCSI 연결은 부분적**: 다른 4노드에 비해 iSCSI 디스크 개수가 현저히 적다(3개만 visible). storage 평면 연결에 차이가 있을 가능성 — 챕터 05(네트워크)에서 확인 필요.
4. **nd05 단독 iSCSI 4개**(20G, 15G, 25G, 15G): 이 4개는 nd05만 접근 가능한 LUN. nd05에서만 사용되는 용도임. nd05에서만 mount되는 용도 추적 필요(§2.5에서 LVM 분석으로 보완).
5. **`b8edeefbb519845` 중복 path**: nd02와 nd04에서 같은 시리얼의 1 GiB iSCSI 디스크가 `sda+sdb` 또는 `sdc+sdd` 두 경로로 보인다. 이는 **iSCSI multipath** 설정 가능성. 확인이 필요하나, PVE에서 multipath를 명시적으로 구성한 흔적은 없어(본 데이터 범위) 단순 중복 연결로 추정. `multipath-tools` 설치 여부 확인이 필요하며 챕터 04 인계.

#### 2.1.3 zvol 블록 디바이스 분포 (`zd*`)

`lsblk`에 나타나는 `zdXX` 디바이스는 ZFS zvol이 블록 디바이스로 노출된 것. 노드별 zvol 개수.

| 노드 | zvol 개수 | 총 용량 (추정) | 특징                                 |
| ---- | --------- | -------------- | ------------------------------------ |
| nd01 | 11        | ~220 GiB       | VM 100, 116, 702 스냅샷 등           |
| nd02 | 11        | ~230 GiB       | VM 112, 108, 115, 702 등             |
| nd03 | 12        | ~240 GiB       | VM 100010, 100021, 115, 116, 702 등  |
| nd04 | 12        | ~180 GiB       | VM 100020, 101, 112(56K), 116 등     |
| nd05 | 15        | ~200 GiB       | VM 100001, 100002, 100006, 100011 등 |

nd05가 가장 많은 zvol을 보유한 것은 Prometheus/Grafana 스택 및 복수의 cloudinit base VM이 올라가 있기 때문.

**`VM 112`의 zvol이 5노드 중 3노드(nd01, nd02, nd04)에 동시 존재**한다는 점이 특이하다(§2.3 `zfs list`). VM 112는 nd02에서 실제 실행 중이고, 다른 두 노드의 `vm-112-disk-*`는 크기 56K로 거의 비어 있다 — 아마 마이그레이션 흔적이거나 stale metadata. 챕터 06에서 정리 검토.

### 2.2 zpool 상태 — 5노드 rpool 건강 상태

`zpool list`와 `zpool status` 결과 5노드 비교.

| 노드 | SIZE | ALLOC | FREE | FRAG    | CAP | DEDUP | HEALTH |
| ---- | ---- | ----- | ---- | ------- | --- | ----- | ------ |
| nd01 | 236G | 36.0G | 200G | 20%     | 15% | 1.00x | ONLINE |
| nd02 | 236G | 14.1G | 222G | 15%     | 5%  | 1.00x | ONLINE |
| nd03 | 236G | 28.8G | 207G | 16%     | 12% | 1.00x | ONLINE |
| nd04 | 236G | 34.2G | 202G | **24%** | 14% | 1.00x | ONLINE |
| nd05 | 236G | 22.3G | 214G | 20%     | 9%  | 1.00x | ONLINE |

**판독**:

1. **모든 노드 ONLINE + errors: No known data errors**: 데이터 무결성 이상 없음
2. **CAP(사용률)은 5~15%**: 모든 노드 여유 충분. 단기간 내 풀 우려 없음
3. **FRAG(단편화)**: nd04가 24%로 가장 높다. ZFS는 FRAG 50% 이상에서 성능 저하가 유의미하게 나타난다. nd04는 아직 괜찮지만 관찰 대상
4. **DEDUP 1.00x**: 5노드 모두 deduplication 비활성 (기본값, 정상). ZFS deduplication은 메모리 비용이 매우 높아 본 환경 규모(30 GiB RAM)에 부적합 — 꺼져 있는 것이 옳다.

#### 2.2.1 ZFS Scrub 자동 수행 확인

`zpool status` 출력에 모든 노드가 **`scan: scrub repaired 0B in ... with 0 errors on Sun Apr 12 00:24~25 2026`** 로 기록되어 있다.

**5노드 동일 시간대(일요일 새벽)에 자동 scrub 수행**이 확인된다. Debian/Ubuntu 시스템 기본 패키지 `zfsutils-linux`가 제공하는 `/etc/cron.d/zfsutils-linux`에 월 1회 scrub이 스케줄링되어 있다(챕터 02 §2.11의 `/etc/cron.d/` 목록에서 확인). **모든 노드에서 scrub이 정상 완료되고 에러가 없다**는 것은 NVMe 물리 무결성이 양호하다는 강한 증거다.

Scrub 소요 시간:

- nd01: 1분 36초
- nd02: 17초
- nd03: 38초
- nd04: 33초
- nd05: 9초

데이터 양에 비례하여 시간이 다르다(nd01이 가장 많은 데이터를 보유). 모든 노드가 2분 이내에 완료됨 — 데이터가 많지 않은 초기 단계임을 시사.

#### 2.2.2 mirror 구성 — 5노드 동일 패턴

```markdown
mirror-0 (ONLINE)
  ├── nvme-M.2_BTS-M256GB_...XXXC-part3  (ONLINE)
  └── nvme-M.2_BTS-M256GB_...YYYC-part3  (ONLINE)
```

**`-part3`**가 ZFS pool로 사용되는 것은 PVE 설치 시 자동 파티셔닝 결과다 — part1이 EFI, part2가 BIOS boot 또는 예약 파티션, part3부터 ZFS pool로 할당된다. 5노드 모두 동일 구조.

### 2.3 ZFS dataset 구조 — 5노드 dataset 분포

`zfs list`의 노드별 요약.

| 노드 | 총 USED | ROOT 크기 | data 크기 | var-lib-vz 크기 | dataset 개수 (data)               |
| ---- | ------- | --------- | --------- | --------------- | --------------------------------- |
| nd01 | 36.0G   | 5.42G     | 5.48G     | 25.0G           | 9 (cloudinit + disk + state 포함) |
| nd02 | 14.2G   | 4.17G     | 9.90G     | 30.4M           | 10                                |
| nd03 | 28.9G   | 8.31G     | 13.8G     | 6.77G           | 11                                |
| nd04 | 34.3G   | 12.0G     | 7.05G     | 15.2G           | 14                                |
| nd05 | 22.4G   | 4.56G     | 15.4G     | 2.34G           | 13                                |

**판독**:

1. **nd01의 `var-lib-vz`가 25 GiB로 가장 크다**: ISO 파일 또는 컨테이너 템플릿이 몰려 있을 가능성. VM `100 = PBS` 및 `100002 = docker-registry`가 nd01에 있어 ISO 접근이 잦을 수 있다
2. **nd04의 ROOT이 12 GiB**: 다른 노드의 2~3배. 로그·캐시 등이 축적되었을 가능성. `du -sh /var/log/*` 점검 필요. 챕터 07(로그) 인계
3. **nd02의 `var-lib-vz`가 30 MiB에 불과**: 이 노드는 ISO/컨테이너 템플릿을 거의 사용하지 않는다. 테스트 workload 타입이 다름을 시사
4. **compression ratio 1.0~3.3x**: 5노드 모두 ZFS compression active (`on`). 평균 1.3~1.5배 절감 효과. nd04의 `var-lib-vz`가 3.31배 compression ratio를 보여 특이 — 텍스트 파일(로그 등)이 많다는 증거

#### 2.3.1 `vm-112-disk-*` zvol의 5노드 분포

챕터 02 §2.5에서 추적한 VM 112의 zvol이 5노드 중 **3노드에 존재**한다.

| 노드 | vm-112-disk-0 USED | vm-112-disk-1 USED | 상태                                   |
| ---- | ------------------ | ------------------ | -------------------------------------- |
| nd01 | 56K                | 56K                | **stale** (실행 안 됨, 거의 빈 volume) |
| nd02 | 56K                | 56K                | —                                      |
| nd04 | 56K                | 56K                | **stale** (실행 안 됨)                 |

흥미로운 점: nd02에서 VM 112가 실행 중인데 `vm-112-disk-*`의 USED가 56K에 불과하다. 이는 ZFS compression이 극도로 잘 작동한 결과일 수도 있고(VM 내부 데이터가 매우 단순 패턴), **실제 부하는 메모리 내에서만 발생하고 디스크 I/O가 거의 없는 워크로드**일 수도 있다. VM 112의 부하 타입을 재해석할 단서다.

nd01과 nd04의 `vm-112-*`는 "이름만 같은 빈 zvol". 과거 마이그레이션 또는 복제 시도의 잔해로 추정 — 챕터 06에서 정리 검토.

#### 2.3.2 snapshot state 볼륨 (`vm-702-state-*`)

5노드 중 nd01, nd02, nd03에 **`vm-702-state-test-zfs` (327 MiB)와 `vm-702-state-test1` (393 MiB)** 두 state volume이 존재한다. 이는 VM 702의 live snapshot (실행 중 상태 저장)을 생성할 때 만들어지는 RAM 덤프 볼륨. 세 노드에 동일 이름으로 존재한다는 것은 **replication 또는 수동 복사의 결과**. 챕터 06 인계.

### 2.4 ZFS ARC 튜닝 — 수동 제한으로 VM 메모리 확보

5노드 `/proc/spl/kstat/zfs/arcstats` 결과.

| 노드 | ARC size   | c_min   | c_max       | 히트율 | Demand data 히트율 |
| ---- | ---------- | ------- | ----------- | ------ | ------------------ |
| nd01 | 860.5 MiB  | 975 MiB | **1.0 GiB** | 97.8%  | 99.8%              |
| nd02 | 997.5 MiB  | 975 MiB | **1.0 GiB** | 99.7%  | 99.8%              |
| nd03 | 1005.2 MiB | 975 MiB | **1.0 GiB** | 99.7%  | 99.8%              |
| nd04 | 1.0 GiB    | 975 MiB | **1.0 GiB** | 99.8%  | 99.9%              |
| nd05 | 816.5 MiB  | 975 MiB | **1.0 GiB** | 99.3%  | 98.4%              |

**결정적 발견**: **5노드 모두 `c_max = 1.0 GiB`로 수동 튜닝**되어 있다. PVE 기본값은 RAM의 50% = 약 15 GiB인데, 이 값에서 15배 이상 축소되었다.

#### 2.4.1 이 튜닝의 설계 의도 해석

챕터 02 §2.2에서 확인된 **Swap 0 정책**과 결합하면 의도가 드러난다.

1. **Swap이 없다**: 메모리 압박 시 fallback 영역 없음. OOM Killer가 즉시 발동
2. **ARC는 일반 페이지 캐시가 아니다**: Linux kernel이 쉽게 evict하지 못함. 메모리 압박 시 ARC가 즉시 줄어들지 않는다
3. **VM 오버프로비저닝 방지**: ARC가 기본값(15 GiB)까지 성장하면 VM에 할당할 실 메모리가 부족해짐

이 셋을 종합하면: **ARC를 1 GiB로 강제 제한하여, ZFS가 VM 메모리 공간을 침범하지 않도록 고정**한 것이다. 30 GiB 중 ARC 1 GiB + OS 2 GiB ≈ 3 GiB를 시스템이 점유하고, 나머지 27 GiB를 VM에 안전하게 배분할 수 있는 구조다.

#### 2.4.2 이 튜닝이 작동하는가 — 성능 증거

히트율이 핵심 지표다.

- **Overall hit rate 97.8~99.8%** — ZFS 캐시는 일반적으로 95% 이상이면 우수. 99% 이상은 exceptional
- **Demand data hit rate 98.4~99.9%** — VM 디스크 I/O 중 실제 데이터 read가 ARC에서 대부분 처리됨

**튜닝이 성공적**이라는 증거다. 1 GiB라는 매우 작은 ARC로도 VM workload의 hot working set을 거의 잡아낸다. 이는 VM들의 실제 working set이 그만큼 집중되어 있거나(반복 읽기 많음), VM disk의 데이터 패턴이 ZFS 압축과 잘 맞기 때문으로 해석된다.

#### 2.4.3 이 튜닝의 주체와 기록

본 데이터 수집 시점에 이 설정을 누가 했는지는 사용자 인지에서 "개발팀이 한 것으로 알고 있음, 구체적 주체 미상"으로 확인되었다. **설정 파일은 `/etc/modprobe.d/zfs.conf`** 에 존재할 가능성이 높으며, 다음 경로 중 하나에서 확인 가능.

```bash
# 튜닝 설정 확인 (read-only)
cat /etc/modprobe.d/zfs.conf 2>/dev/null
grep -r zfs_arc_max /etc/modprobe.d/ 2>/dev/null
# 실시간 값 확인
cat /sys/module/zfs/parameters/zfs_arc_max   # bytes 단위
```

본 챕터에서는 튜닝 주체를 "개발팀"으로만 기록하고, 구체 책임자와 튜닝 근거는 챕터 04에서 개발팀 인터뷰를 통해 확인한다.

### 2.5 LVM 구조 — shared LVM과 local VG의 공존

5노드 `pvs`/`vgs`/`lvs` 결과를 VG 기준으로 재구성.

#### 2.5.1 VG별 5노드 visibility 매트릭스

| VG 이름            | nd01 | nd02 | nd03 | nd04 | nd05 | PV (iSCSI serial)       | 용도                                      |
| ------------------ | ---- | ---- | ---- | ---- | ---- | ----------------------- | ----------------------------------------- |
| `vg-prom`          | ✓    | ✓    | ✓    | ✓    | ✓    | `e78276acd917de9` (50G) | **5노드 shared LVM** — Prometheus 스택 VM |
| `lvm_iscsi_vg`     | ✓    | ✓    | —    | ✓    | —    | `3eb0629863ea56f` (5G)  | **3노드 shared LVM** — VM 116             |
| `vg`               | ✓    | ✓    | —    | ✓    | —    | `81041013d00e296` (5G)  | **3노드 shared LVM** — 빈 상태            |
| `lvm-test-testerC` | ✓    | ✓    | ✓    | ✓    | ✓    | `c2bb19be5c55a0f` (80M) | **5노드 shared** — 빈 상태, 테스트용      |

**모든 LVM VG가 iSCSI 기반 shared 구조**다. Local-only LVM VG는 본 환경에 존재하지 않는다. ZFS rpool이 OS와 VM 디스크 둘 다 처리하기 때문이다.

#### 2.5.2 `vg-prom` LV 상세 (핵심 shared LVM)

5노드 모두에서 `lvs` 출력 동일.

```markdown
  LV                  VG       Attr       LSize
  vm-10020001-disk-0  vg-prom  -wi-ao----  10.00g  ← nd05에서만 active (다른 노드는 -wi-------)
  vm-10020001-disk-1  vg-prom  -wi-ao----   5.00g
  vm-10031001-disk-0  vg-prom  -wi-ao----  10.00g
  vm-10031001-disk-1  vg-prom  -wi-ao----  10.00g
```

VFree = 14.99 GiB (50 GiB 중 35 GiB가 LV로 할당). 추가 Prometheus 스택 VM을 위한 여유 공간 존재.

**VM 10020001(Prom01)과 VM 10031001(Grafana01)이 이 shared LVM을 사용**한다. 현재 nd05에서 실행 중이므로 nd05에서만 LV가 active 상태. 만약 이 VM들을 nd03으로 마이그레이션하면, nd03의 LV가 active로 전환되고 nd05의 LV는 inactive로 전환된다. **마이그레이션 가능한 구조**임이 확인된다.

#### 2.5.3 `lvm_iscsi_vg`의 LV 이름 오염

```markdown
  LV                                  Attr       LSize
  snap_vm-116-disk-0_test.qcow2       -wi-------  1.00g
  vm-116-disk-0.qcow2                 -wi-------  1.00g
```

**LV 이름에 `.qcow2` 확장자가 붙어 있다**. 이는 잘못된 이름이다. 이유:

- LVM LV는 **raw 블록 디바이스**다. 파일시스템이나 이미지 포맷 개념이 없다.
- `.qcow2`는 파일 기반 이미지(NFS/directory storage 등에서 사용)의 확장자다.
- LVM 볼륨을 `.qcow2`로 이름 붙이면 **접근 경로 `/dev/lvm_iscsi_vg/vm-116-disk-0.qcow2`**가 되며, 이는 OS 레벨에서는 raw 블록으로 열린다. 확장자가 QEMU의 이미지 포맷 감지에 영향을 주지는 않지만, **운영자·테스터의 착각 유발** 가능.

추정: **NFS에서 qcow2 이미지로 운영하다가 LVM으로 마이그레이션했을 때 볼륨 이름을 그대로 복사한 흔적**. 이는 PVE의 `qm importdisk` 또는 `qm move-disk` 명령이 실수로 이름을 그대로 유지하도록 동작한 결과일 수 있다. **네이밍 규칙 재정비 필요** — 챕터 04 인계.

#### 2.5.4 `vg`와 `lvm-test-testerC`의 의미

- **`vg`**: 빈 VG. LV 0개. 생성은 되었으나 사용되지 않음. 생성자 미상.
- **`lvm-test-testerC`**: 80 MiB의 매우 작은 PV 위에 구성. LV 0개. testerC의 LVM 테스트 흔적. 80 MiB는 운영에 실제 사용하기 불가능한 크기 — 확인 실험용.

이 두 VG 모두 **의미 있는 데이터 없음**이지만 `storage.cfg`에는 등록되어 있을 가능성 — CMP가 스토리지 목록을 조회할 때 이들이 표시된다면 UI 노이즈가 된다. 챕터 04에서 정리 대상.

### 2.6 VM 디스크 매트릭스 (계층 6) — 어느 VM이 어느 스토리지에 들어 있는가

`qm config` 5노드 수집 결과를 스토리지 ID 기준으로 역매핑.

#### 2.6.1 스토리지 ID별 VM 분포

| 스토리지 ID                       | 유형                                   | 사용 VM 수          | 주요 사용 VM                                       |
| --------------------------------- | -------------------------------------- | ------------------- | -------------------------------------------------- |
| `pve-nd06-nfs`                    | NFS (shared)                           | **가장 많음 (~25)** | 거의 모든 VM의 ISO + 상당수 VM disk                |
| `local-zfs`                       | ZFS zvol (local)                       | 15+                 | VM 112, 115, 9502, 9503, 100006, 100010, 100011 등 |
| `local`                           | directory (local)                      | 3                   | VM 104, 201 (cloudinit), 809 (disk 복제본)         |
| `nfs17-test-testerB`              | NFS (nd07 shared, **2026-04-24 추가**) | 1                   | VM 102 전체                                        |
| `nfs-test-testerD`                | NFS (nd06 shared)                      | 2                   | VM 799, 800                                        |
| `prom-lvm`                        | shared LVM (nd06 iSCSI)                | 2                   | VM 10020001, 10031001                              |
| `node03-dir`                      | directory (nd03 local only)            | 1                   | VM 100015 (**마이그레이션 제약**)                  |
| `cmptest-lvm-filebrowser-testerA` | (추정) shared LVM                      | 1                   | VM 10025001                                        |

**판독**:

1. **pve-nd06-nfs가 dominant**: ISO 전부 + VM disk 다수가 이곳에 몰려 있다. 이 NFS가 장애나면 클러스터의 **거의 모든 워크로드가 영향**을 받는다. 챕터 00 §1.3의 "단일 ZFS pool 수렴" 판독이 구체 VM 수로 확인됨
2. **local-zfs의 활용**: HA 부적합 VM, 빠른 로컬 스토리지 필요 VM, stateful 테스트 VM 등이 local-zfs 사용. VM 112가 여기에 해당
3. **node03-dir의 존재**: VM 100015(PostgresDB)가 nd03 로컬 디렉터리에 있다. 이 VM은 **마이그레이션 불가**. HA에도 등록할 수 없다. 의도적 local 배치인지 확인 필요 — 챕터 06 인계
4. **nd07 (2026-04-24 추가)의 첫 사용자**: VM 102 "56-test-testerB-clone"이 nd07 NFS에 통째로 있다. testerB의 clone 실험 자원. 본 노드 추가 직후의 첫 workload
5. **cmptest-lvm-filebrowser-testerA**: 이름에 "cmptest" 접두사가 붙어 있다. CMP 팀이 공식 테스트용으로 만든 스토리지일 가능성. 챕터 04에서 확인 필요

#### 2.6.2 이상치 VM 디스크 구성

- **VM 101 (nd04)**: `scsi0` + `scsi2`에 각 601 MiB, `scsi1` 없음. 디스크 인덱스 홀 존재 — 의도되지 않은 설정으로 추정
- **VM 102 (nd01)**: 4개 디스크 중 **`scsi0` qcow2** + **`scsi1` qcow2 with ssd=1** + **`scsi2` qcow2 with discard=on** + **`virtio0` raw(동일 경로!)**. scsi0과 virtio0이 같은 파일을 가리키는 **이중 경로** 가능성
- **VM 809 (nd03)**: `scsi0`는 `pve-nd06-nfs:809/vm-809-disk-0.qcow2`, `scsi1`은 `local:809/vm-809-disk-0.qcow2`. **파일 이름은 같지만 다른 스토리지**. 의도가 불명확 — 복제본인지, 같은 이름의 다른 데이터인지

이 이상치들은 챕터 06(가상 자원 인벤토리)에서 일괄 해석.

### 2.7 fstab과 mount 매트릭스 — NFS/CIFS 경로 대혼란

5노드 모두 `/etc/fstab`은 **`proc /proc proc defaults 0 0`** 한 줄뿐. 모든 실제 마운트는 **Proxmox의 `/etc/pve/storage.cfg`**를 통해 pvestatd가 동적으로 수행한다.

5노드 mount 결과를 분석하여 **"alias chaos" 매트릭스**를 정리.

#### 2.7.1 같은 NFS export의 다중 마운트 경로 사례

**testerB의 nfs-test-testerB** (원본: `10.99.30.16:/mnt/pve-nd06-zfs/nfs-test-testerB`):

| 마운트 경로                 | 출현 노드              | 해석                   |
| --------------------------- | ---------------------- | ---------------------- |
| `/mnt/pve/nfs-test-testerB` | nd01, nd02, nd04, nd05 | 정상 명명              |
| `/mnt/pve/test-nfs-001`     | nd01, nd03             | **별칭 1** — 임의 명명 |
| `/mnt/pve/test001`          | nd01, nd02, nd03, nd04 | **별칭 2** — 임의 명명 |

**testerC의 nfs-test-testerC** (원본: `10.99.30.16:/mnt/pve-nd06-zfs/nfs-test-testerC`):

| 마운트 경로                 | 출현 노드              | 해석                                 |
| --------------------------- | ---------------------- | ------------------------------------ |
| `/mnt/pve/nfs-test-testerC` | nd01, nd03, nd04, nd05 | 정상 명명                            |
| `/mnt/pve/test_testerC`     | nd01, nd02             | **별칭** (언더스코어)                |
| `/mnt/pve/test-ksy`         | nd01, nd03             | **이름 오염** — ksy는 testerB를 지칭 |
| `/mnt/pve/test_ksy`         | nd01, nd02             | **이름 오염** (언더스코어)           |
| `/mnt/pve/test-ksy1`        | nd04                   | **이름 오염 + 번호**                 |

**심각한 발견**: **testerC의 데이터가 "ksy"(testerB)라는 이름의 경로로 마운트**되어 있다. 이는 storage.cfg에 동일 NFS export를 두 사용자 이름을 혼용하여 여러 번 등록한 결과로 보인다. 운영자가 "내 것이 아니네" 생각하고 testerB 경로를 지우면 **testerC의 실제 데이터가 사라진다**.

#### 2.7.2 CIFS 마운트 (본 환경의 소수 사용자)

```markdown
//10.99.10.16/smb                  → /mnt/pve/smb01-0319  (nd02)
//10.99.10.16/smb                  → /mnt/pve/smb02-0319  (nd01, nd02, nd03)
//10.99.10.16/smb-test-testerB     → /mnt/pve/smb-test-testerB  (nd01, nd02, nd03, nd04)
```

같은 `smb` export가 `smb01-0319`, `smb02-0319` 두 경로로. 또 testerB의 SMB 자원도 별도 등록. **CIFS(SMB)는 소수 사용자만 활용**하는 듯 — 대다수는 NFS를 사용.

#### 2.7.3 NFS 평면 혼용 — 평면 분리 원칙 파괴 사례

챕터 00 §1.3에서 **평면 분리 원칙**(mgmt/corosync/storage/vm)이 정의되었다. 그러나 NFS 마운트 결과가 이 원칙의 부분적 파괴를 보여준다.

| NFS Export                                 | 접근 IP       | 평면     | 평가             |
| ------------------------------------------ | ------------- | -------- | ---------------- |
| `/mnt/pve-nd06-zfs/pve`                    | `10.99.30.16` | storage  | ✓ 정상           |
| `/mnt/pve-nd06-zfs/nfs-test-testerB`       | `10.99.30.16` | storage  | ✓ 정상           |
| `/mnt/pve-nd06-zfs/nfs-test-testerC`       | `10.99.30.16` | storage  | ✓ 정상           |
| `/mnt/pve-nd06-zfs/storage-test-testerE`   | `10.99.10.16` | **mgmt** | ✗ **평면 혼용**  |
| `/mnt/pve-nd06-zfs/nfs-test-testerD`       | `10.99.10.16` | **mgmt** | ✗ **평면 혼용**  |
| `/mnt/pve-nd06-zfs/webshare`               | `10.99.30.16` | storage  | ✓ (nd01, nd02만) |
| `nd07: /mnt/pve-nd07-zfs/nfs-test-testerB` | `10.99.10.17` | **mgmt** | ✗ **평면 혼용**  |

**mgmt 평면으로 흐르는 NFS 트래픽**이 상당수 존재한다. 특히 오늘 아침 추가된 `nd07`의 NFS 자원은 mgmt 평면을 통해 연결되어 있다. 이로 인한 영향:

- mgmt 평면은 Web UI, SSH, CMP API, pvestatd 트래픽과 대역폭을 공유
- 대용량 NFS read/write가 발생하면 **Web UI 응답 지연**, **CMP API timeout** 유발 가능
- Corosync는 ring0(corosync0 평면)에 있어 직접 영향 없음 — 클러스터 멤버십은 안전

**정비 권고**: 모든 NFS를 storage 평면으로 이전. 단 nd07이 storage 평면 IP를 아직 노출하지 않았을 가능성 있음 — 확인 후 조치. 챕터 04 + 챕터 05 공동 인계.

#### 2.7.4 nd07 (TrueNAS 2대 중 두 번째) — 2026-04-24 오전 추가

본 챕터 데이터 수집 시점에 **nd07이 `10.99.10.17`에 존재**한다. ZFS pool 이름은 `pve-nd07-zfs`. 현재 확인되는 export는 `nfs-test-testerB` 하나.

```markdown
10.99.10.17:/mnt/pve-nd07-zfs/nfs-test-testerB → /mnt/pve/nfs17-test-testerB
```

이 마운트는 5노드 모두에 존재하며, 마운트 포인트 이름(`nfs17-test-testerB`)에 **"nfs17"**이 포함되어 nd06과 구분된다. 현재 **VM 102(testerB의 clone 실험)가 이 공유의 첫 사용자**.

nd07의 추가 배경은 사용자 메타로 확인됨: "테스트팀과 개발팀의 TrueNAS 분리를 위해 오늘 아침 추가". 현재 상태:

- nd07의 storage 평면 IP(`10.99.30.17`?)가 아직 활성화되지 않았거나 명명되지 않음
- 현재 모든 nd07 접근이 mgmt 평면(`10.99.10.17`)을 경유
- 테스트팀의 작업이 이 NFS로 이전될 예정으로 추정

챕터 04에서 nd07의 의도된 최종 역할, 개발팀과의 자원 경계, 평면 이전 계획을 개발팀과 협의하여 확인한다.

---

## 3. 출력의 비정상 패턴과 조기 경보

### 3.1 정상 패턴

```markdown
[정상 1] zpool status: ONLINE, no errors, scrub last 30일 이내
[정상 2] ARC hit rate > 95%
[정상 3] zpool CAP < 80%
[정상 4] SMART PASSED (모든 물리 디스크)
[정상 5] lvs에서 VG가 VFree > 0 이고 LV 모두 expected 상태
[정상 6] iSCSI 0B 디스크 신규 증가 없음 (기존 유령은 존재 허용)
[정상 7] NFS 마운트 응답 < 100ms (df -h 실행 시 hang 없음)
```

### 3.2 의심 패턴

| #   | 패턴                                     | 추정 원인                              | 즉시 확인                         |
| --- | ---------------------------------------- | -------------------------------------- | --------------------------------- |
| 1   | `zpool status` DEGRADED/FAULTED          | 디스크 장애                            | smartctl -a, dmesg nvme           |
| 2   | `scrub repaired > 0B`                    | checksum 오류 — 디스크 마모 가능성     | SMART attributes 상세             |
| 3   | ARC hit rate < 85%                       | ARC 크기 부족 또는 access pattern 변화 | workload 타입 재검토              |
| 4   | `lvs` Attr에 `X` 또는 `p` 플래그         | LV 손상 또는 부분 비활성               | pvck, vgck                        |
| 5   | iSCSI 0B 디스크 신규 추가                | TrueNAS에서 LUN 삭제 후 PVE 미정리     | iscsiadm session 확인             |
| 6   | NFS 마운트 `stale NFS file handle`       | TrueNAS export 재구성                  | umount + remount                  |
| 7   | `df -h`가 특정 마운트에서 hang           | NFS 서버 연결 끊김                     | TrueNAS 가용성 확인               |
| 8   | 같은 LUN의 `sd` 디바이스가 3개 이상      | iSCSI multipath 오설정 또는 경로 중복  | multipath -ll                     |
| 9   | zvol `56K` 상태로 5노드에 같은 이름 존재 | 과거 마이그레이션/복제 잔해            | 실제 실행 노드 1곳 이외 정리 대상 |
| 10  | `lvs` LV 이름에 파일 확장자(`.qcow2`)    | 네이밍 규칙 혼란                       | 정비 대상 (챕터 04)               |

### 3.3 즉시 중단 신호

#### 신호 A: zpool CAP > 90%

```bash
zpool list -H -o name,cap | awk '$2+0 > 90'
```

ZFS는 CAP 90% 초과에서 극적인 성능 저하 발생. CAP 95% 이상이면 pool이 read-only로 전환될 수 있다. VM 디스크 확장·생성 즉시 중단 후 용량 확보.

#### 신호 B: ARC size가 c_max를 장시간 초과

```bash
arc_summary -p 1 | grep -E 'Target size|Current size'
```

Current size가 Max target size의 110% 이상을 수 시간 유지하면 **ARC 튜닝이 실패**하고 있거나 workload 특성이 변했다는 신호. OOM 가능성 증가.

#### 신호 C: iSCSI target 연결 실패

```bash
journalctl --since '10 minutes ago' | grep -iE 'iscsi|connection (lost|refused)'
```

여기에 결과가 많으면 TrueNAS 또는 storage 평면에 문제. shared LVM 사용 중인 VM(vg-prom의 Prom01/Grafana01)에 직접 영향. 즉시 인프라팀 통보.

#### 신호 D: dataset mount 실패

```bash
zfs list -o name,mountpoint,mounted | awk '$3 == "no" && $2 != "-"'
```

mountpoint가 있는데 mounted가 no인 dataset이 있으면 부팅 중 mount 실패. VM 기동 불가 원인이 될 수 있다.

---

## 4. 이 영역의 CMP 테스트 대분류와 시나리오

### 4.1 CRUD 기능 검증

#### 시나리오 4.1.1 — 스토리지 목록 조회 정합성

CMP UI가 표시하는 스토리지 목록이 `storage.cfg`와 일치하는가.

- 진입점: `pvesh get /storage`
- 사전 정찰: §2.6
- 검증: CMP UI의 스토리지 수 vs `storage.cfg` entry 수. 본 환경은 다수의 storage ID가 있으며, 특히 빈 VG(`vg`, `lvm-test-testerC`)가 UI 노이즈로 보이는지 확인

#### 시나리오 4.1.2 — VM 디스크 생성

CMP를 통해 VM에 새 디스크 추가. 각 스토리지 타입별 생성 성공 여부.

- 사전 정찰: §1.6 스토리지 타입 매트릭스
- 검증 항목:
  - `local-zfs`에 생성 → `qm config`에 반영, zvol 생성 (`zfs list`에 나타남)
  - `pve-nd06-nfs`에 생성 → qcow2 파일 생성 (`ls` 확인 가능)
  - `prom-lvm`에 생성 → shared LVM LV 생성 (`lvs`에 나타남), 5노드 모두에서 LV 메타 visible
  - `node03-dir`에 생성 → nd03의 `/data/pve-dir`에 파일 생성, **다른 노드에서는 보이지 않음**

### 4.2 스테이징 워크플로우

#### 시나리오 4.2.1 — VM 디스크 마이그레이션

VM을 shared storage에서 다른 shared storage로, 또는 local → shared로 이동.

- 진입점: `qm move-disk`
- 사전 정찰: §1.6, §2.5, §2.6
- 핵심 케이스:
  - `local-zfs:vm-112-*` → `pve-nd06-nfs` 이동 시 **VM 112가 HA 대상이 되는가** (처분 방안의 기술적 선택지)
  - `node03-dir:vm-100015-*` → `pve-nd06-nfs` 이동 시 **VM 100015가 마이그레이션 가능해지는가**

### 4.3 위험 시나리오·에러 처리

#### 시나리오 4.3.1 — 존재하지 않는 LUN에 VM 생성 시도

유령 iSCSI 디스크(0B)를 PV로 지정하고 VM 생성 시도. CMP가 에러를 명확히 노출해야 한다.

- 사전 정찰: §2.1.2
- 기대 동작: 즉시 에러 (디스크 크기 0)
- 결함 시나리오: 생성은 시작하고 알 수 없는 실패로 끝남

#### 시나리오 4.3.2 — NFS 서버 다운 상태에서 VM 기동

TrueNAS nd06을 의도적 정지 후, `pve-nd06-nfs`에 디스크가 있는 VM 기동 시도.

- 사전 정찰: §2.7.3 + §2.6
- 기대 동작: 명확한 에러 (NFS 응답 없음)
- 결함 시나리오: 무한 대기 또는 불명확한 타임아웃
- **주의**: 이 시나리오는 **운영팀 합의 하에만 수행**. TrueNAS 정지는 L4 격자 (거의 모든 VM 영향)

#### 시나리오 4.3.3 — 공유 LVM의 잠금 충돌 처리

nd05에서 실행 중인 Prom01을 nd03으로 마이그레이션 시도 중, 동시에 nd05에서 해당 VM에 설정 변경 시도.

- 사전 정찰: §2.5.2
- 기대 동작: CMP가 잠금 충돌을 감지하고 하나의 작업만 허용
- 결함 시나리오: 두 작업 모두 진행되어 데이터 불일치

### 4.4 클러스터 일관성

#### 시나리오 4.4.1 — shared LVM의 LV 상태 5노드 일관성

`vg-prom`의 LV가 VM 실행 노드에서만 `active`이고 다른 노드에서 `inactive`인 상태를 CMP가 정확히 표시하는가.

- 사전 정찰: §2.5.2
- 검증: CMP 스토리지 상세 화면에서 LV 상태 표시 확인
- 실전 시험: VM 마이그레이션 후 LV active 상태가 새 노드로 옮겨지는지 확인

#### 시나리오 4.4.2 — NFS alias의 CMP 표시

같은 NFS export가 3~5개 다른 이름으로 등록된 상태에서, CMP가 이를 어떻게 집계하는가.

- 사전 정찰: §2.7.1
- 기대 동작: 각 storage ID별 별도 표시 (PVE 레벨에서는 다른 storage로 취급됨)
- 결함 시나리오: 용량을 중복 카운팅하여 실 용량의 몇 배로 표시

---

## 5. 정찰 ↔ 테스트 단계 역방향 매핑

| 수행하려는 액션             | 선행 정찰 (본 챕터)                   | 추가 선행            |
| --------------------------- | ------------------------------------- | -------------------- |
| 새 VM 생성 (챕터 06)        | §2.6 스토리지 선택 가능성 매트릭스    | 챕터 02 노드 부하    |
| VM 마이그레이션 (챕터 06)   | §2.5.2 shared LVM, §2.6 스토리지 유형 | 챕터 01 정족수       |
| NFS 자원 삭제 (챕터 04)     | §2.7.1 alias chaos 매트릭스           | **운영자 합의 필수** |
| 스토리지 풀 확장 (챕터 04)  | §2.2, §2.3 현 용량                    | 운영팀               |
| ZFS scrub 수동 실행         | §2.2.1 자동 스케줄 확인               | 해당 없음 (L1 작업)  |
| iSCSI 세션 재연결 (챕터 04) | §2.1.2 유령 LUN 목록                  | **L3 격자**          |

---

## 6. 정찰 결과를 산출물로 정리하는 양식

### 6.1 산출물 — 디스크 베이스라인 카드 (주간 갱신)

```markdown
# 디스크 베이스라인 카드 — YYYY-MM-DD HH:MM

## 5노드 물리 디스크 상태
| 노드 | rpool CAP | FRAG | scrub 최근 | SMART |
| ---- | --------- | ---- | ---------- | ----- |

## ARC 상태
| 노드 | size | c_max | hit rate |

## shared LVM 활성 분포
| VG | 활성 노드 | LV 개수 | 용량 사용 |

## iSCSI 세션 요약
- 유효 LUN: N개
- 유령 LUN: N개 (변화 추적)

## NFS 마운트 alias 수
- 자원별 별칭 수: ...

## 이상 상태 (있는 경우)
- ...
```

### 6.2 산출물 — 스토리지 이상 보고서 (이상 식별 시)

양식은 챕터 02 §6.2와 동일 구조를 따른다.

---

## 7. 본 챕터에서 발견된 잔여 정비·추적 항목

| #   | 발견 항목                                                     | 인계 챕터         | 우선순위 | 상태                 |
| --- | ------------------------------------------------------------- | ----------------- | -------- | -------------------- |
| 1   | iSCSI 유령 LUN (0B) 약 7~8종, 5노드 합계 20+ 건               | 챕터 04 + 운영팀  | P1       | cleanup 절차 필요    |
| 2   | NFS alias chaos — testerC 데이터가 testerB 이름 경로로 마운트 | 챕터 04           | **P0**   | **즉시 매핑 문서화** |
| 3   | NFS 평면 혼용 — mgmt 평면으로 흐르는 NFS 트래픽               | 챕터 04 + 챕터 05 | P1       | storage 평면 이전    |
| 4   | LVM LV 이름에 `.qcow2` 확장자 (lvm_iscsi_vg)                  | 챕터 04           | P2       | 네이밍 규칙 정비     |
| 5   | 빈 VG (`vg`, `lvm-test-testerC`) 정리                         | 챕터 04           | P3       | 미사용 자원 정리     |
| 6   | VM 101 디스크 인덱스 홀 (scsi1 missing)                       | 챕터 06           | P3       | 설정 검증            |
| 7   | VM 112 stale zvol (nd01, nd04)                                | 챕터 06           | P3       | VM 112 처분과 연계   |
| 8   | VM 809 동일 파일명의 두 스토리지 등록                         | 챕터 06           | P2       | 의도 확인            |
| 9   | node03-dir에 VM 100015 — 마이그레이션 제약                    | 챕터 06           | P2       | 의도 확인, 이전 검토 |
| 10  | nd04 rpool FRAG 24%                                           | 챕터 03 (본 챕터) | P3       | 주간 관찰            |
| 11  | nd04 ROOT 12 GiB — 로그 축적 의심                             | 챕터 07           | P3       | 로그 점검            |
| 12  | ARC c_max 1 GiB 튜닝 주체·근거                                | 챕터 04           | P2       | 개발팀 인터뷰        |
| 13  | nd07 (2026-04-24 추가) 최종 역할 정의                         | 챕터 04           | P1       | 개발팀 협의          |
| 14  | `cmptest-lvm-filebrowser-testerA` 정체                        | 챕터 04           | P2       | CMP 팀 확인          |
| 15  | iSCSI multipath 가능성 (`b8edeefbb519845` 중복 path)          | 챕터 04           | P3       | 확인                 |

### 7.1 본 챕터에서 수행하는 즉시 정비

본 챕터의 범위 내에서 수행 가능한 정비는 **없음**. 모든 발견이 챕터 04 또는 운영팀 인계로 이월된다. 이유:

- iSCSI 세션 정리: L3 격자 (다중 노드 영향)
- NFS 마운트 정리: L2~L3 (사용자 자원 영향, 합의 필요)
- LVM 네이밍 정비: L2 (VM 재구성 수반)

본 챕터는 **"알기만 하고 건드리지 않는" 정찰 원칙**의 대표 사례가 된다. 스토리지 계층은 격자가 매우 큰 영역이며, 정찰 단계에서의 개별 정비가 금지됨을 본문에 박는다.

### 7.2 챕터 02 인지 수정 — vg-prom (본문 §0.1 참조)

챕터 02 작성 시점 및 그 직전 대화에서 `vg-prom`을 "nd05 전용 로컬 자원"으로 오인했다. 본 챕터 §2.5.2에서 **shared iSCSI LVM임이 확정**되었다. 이 오해의 교훈은 §0.1에 본문으로 박았다. 본 항목은 잔여 정비가 아니라 **기록 수정 완료**로 분류한다.

---

## 부록 A. 명령 치트 시트

```bash
# === 5노드 디스크 건강 체크 (1분) ===
NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"
for n in $NODES; do
  echo "=== [$n] ==="
  ssh "$n" "zpool list -o name,cap,frag,health; \
            arc_summary -p 1 2>/dev/null | grep -E 'Current size|Max target' | head -2"
done

# === iSCSI 유령 LUN 빠른 확인 ===
for n in $NODES; do
  echo "=== [$n] 0B iSCSI ==="
  ssh "$n" "lsblk -d -o NAME,SIZE,TRAN | awk '\$2==\"0B\" && \$3==\"iscsi\"'"
done

# === shared LVM 활성 분포 ===
for n in $NODES; do
  ssh "$n" "echo '--- $n ---'; lvs vg-prom 2>/dev/null | awk 'NR>1 {print \$1, \$3}'"
done

# === NFS 마운트 수 (alias chaos 추적) ===
for n in $NODES; do
  cnt=$(ssh "$n" "mount -t nfs,nfs4 | wc -l")
  echo "[$n] NFS mounts: $cnt"
done
```

## 부록 B. 다음 챕터로의 인계

| 본 챕터 발견                             | 챕터 04 (스토리지 자원 관리) 처리 |
| ---------------------------------------- | --------------------------------- |
| iSCSI 유령 LUN 20+건                     | cleanup 절차 정의 및 실행         |
| NFS alias chaos (testerC ↔ testerB 혼동) | 매핑 문서화, 정리 우선순위        |
| NFS 평면 혼용                            | storage 평면 이전 계획            |
| nd07 최근 추가, mgmt 평면 사용 중        | 의도된 최종 역할 + 이전 계획      |
| ARC c_max 수동 튜닝                      | 개발팀 인터뷰                     |
| LVM 네이밍 오염                          | 네이밍 규칙 정비                  |

| 본 챕터 발견                | 챕터 05 (네트워크) 처리 |
| --------------------------- | ----------------------- |
| nd03 iSCSI 가시 디스크 적음 | storage 평면 연결 점검  |
| NFS 평면 혼용               | mgmt 평면 부하 분석     |

| 본 챕터 발견                      | 챕터 06 (가상 자원) 처리  |
| --------------------------------- | ------------------------- |
| VM 112 stale zvol (nd01, nd04)    | 일괄 정리 대상            |
| VM 100015 node03-dir 제약         | 의도 확인 + 이전 검토     |
| VM 101, 102, 809 이상 디스크 구성 | 개별 점검                 |
| prom-lvm의 LV VFree 14.99 GiB     | Prometheus 스택 확장 여유 |

| 본 챕터 발견     | 챕터 07 (로그) 처리 |
| ---------------- | ------------------- |
| nd04 ROOT 12 GiB | 로그 축적 점검      |

| 본 챕터 발견                          | 챕터 08 (위험 매트릭스) 처리 |
| ------------------------------------- | ---------------------------- |
| NVMe 동일 로트 공급 (시리얼 25C 공통) | 동시 장애 risk               |
| 모든 워크로드 pve-nd06-nfs 수렴       | SPOF 정량화                  |

## 부록 C. 참고 자료

| 주제                   | URL                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| ZFS on Linux (OpenZFS) | https://openzfs.github.io/openzfs-docs/                                                                |
| Proxmox ZFS root       | https://pve.proxmox.com/wiki/ZFS_on_Linux                                                              |
| Proxmox shared LVM     | https://pve.proxmox.com/wiki/Storage:_LVM                                                              |
| ZFS ARC tuning         | https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Module%20Parameters.html#zfs-arc-max |
| LVM Shared VG          | https://man7.org/linux/man-pages/man7/lvmlockd.7.html                                                  |
| iSCSI on Proxmox       | https://pve.proxmox.com/wiki/Storage:_iSCSI                                                            |

---

> **다음 챕터**: `04-storage-resource-management.md` — `storage.cfg`를 해부하고 각 storage ID의 정체, 등록 배경, 정비 대상을 확인한다. 본 챕터의 잔여 정비 항목 15건이 챕터 04의 핵심 입력이 된다.
