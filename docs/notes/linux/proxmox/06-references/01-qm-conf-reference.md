---
title: "Proxmox VE VM 설정 파일(qm.conf) 심화 레퍼런스"
date: 2026-04-07
lastmod: 2026-04-07
author: "Davi"
description: "qm.conf의 모든 속성을 카테고리별로 분류하고, 각 값의 의미와 실전 선택 기준을 정리한다."
slug: "proxmox-qm-conf-reference"
section: "notes"
category: "proxmox/references"
tags: [proxmox, qemu, kvm, vm-config, qm-conf, scsi, virtio, cloud-init, cpu, memory, network, disk]
order: 1
series: "Proxmox VE 학습 시리즈"
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 0. 이 문서의 목적

`/etc/pve/qemu-server/<VMID>.conf` 파일은 VM의 모든 것을 정의하는 **단일 소스 오브 트루스(Single Source of Truth)**이다. Web UI에서 클릭하든, `qm set`을 치든, REST API로 PUT을 보내든, 결국 이 파일이 바뀌는 것이다.

이 문서는 공식 매뉴얼(`qm.conf(5)`)의 전체 속성을 **실전 관점에서** 재구성한다.

> **공식 원본:** https://pve.proxmox.com/pve-docs/qm.conf.5.html

---

## 1. 네 .conf 파일 해부

먼저 네가 만든 `101.conf`의 각 줄이 뭘 의미하는지 하나씩 짚고 가자.

```
boot: order=ide2
```
→ **부팅 순서.** `ide2`(= ISO가 마운트된 가상 CD-ROM)에서 먼저 부팅하라는 뜻. OS 설치가 끝나면 `order=scsi0`로 바꿔야 하드디스크에서 부팅된다.

```
cores: 2
```
→ **소켓당 코어 수.** `sockets` 속성(기본값 1)과 곱해서 총 vCPU 수가 결정된다. 지금은 1소켓 × 2코어 = vCPU 2개.

```
ide2: local:iso/debian-13.3.0-amd64-netinst.iso,media=cdrom,size=754M
```
→ **IDE 채널 2번에 연결된 장치.** `local` 스토리지의 ISO 파일을 가상 CD-ROM(`media=cdrom`)으로 마운트. `size=754M`은 정보성(Informational) 값으로, 실제 동작에 영향 없음.

```
memory: 2048
```
→ **RAM 할당량(MiB).** 2048 MiB = 2 GiB.

```
meta: creation-qemu=10.1.2,ctime=1775550070
```
→ **메타데이터.** 이 VM을 생성할 때 사용된 QEMU 버전과 생성 시각(Unix Timestamp). Proxmox가 내부적으로 관리하는 값이고, 수동 수정할 일 없다.

```
name: test-vm
```
→ **VM 표시 이름.** Web UI와 `qm list`에서 보이는 이름. VMID와 달리 고유할 필요 없다.

```
net0: virtio=BC:24:11:BD:56:51,bridge=vmbr0
```
→ **첫 번째 네트워크 인터페이스.** VirtIO 모델의 NIC를 `vmbr0` 브릿지에 연결. MAC 주소는 자동 생성된 것.

```
scsi0: local-lvm:vm-101-disk-0,size=32G
```
→ **SCSI 컨트롤러 0번 슬롯에 연결된 디스크.** `local-lvm` 스토리지에 `vm-101-disk-0`이라는 이름으로 32GiB 볼륨이 생성되어 있다.

```
scsihw: virtio-scsi-single
```
→ **SCSI 컨트롤러 하드웨어 모델.** 이것은 디스크 자체가 아니라, 디스크를 VM에 연결하는 "어댑터"의 종류를 지정하는 것이다.

```
smbios1: uuid=a07e80f9-...
```
→ **SMBIOS(System Management BIOS) 정보.** VM의 하드웨어 식별 UUID. 게스트 OS가 `dmidecode`로 조회하면 이 값이 나온다.

```
vmgenid: f4d29804-...
```
→ **VM Generation ID.** Windows가 스냅샷 롤백이나 클론을 감지하는 데 사용하는 식별자. Linux에서는 무시해도 된다.

---

## 2. 카테고리별 속성 레퍼런스

### 2.1 CPU

| 속성 | 형식 | 기본값 | 설명 |
|------|------|--------|------|
| `cores` | 정수 (1~N) | `1` | 소켓당 코어 수 |
| `sockets` | 정수 (1~N) | `1` | CPU 소켓 수. 총 vCPU = sockets × cores |
| `cpu` | 복합 문자열 | `kvm64` | CPU 에뮬레이션 타입. 아래 상세 설명 참고 |
| `vcpus` | 정수 (1~N) | `0` | CPU 핫플러그(Hotplug) 시 초기 활성 vCPU 수. 0이면 전부 활성 |
| `cpulimit` | 실수 (0~128) | `0` | CPU 사용률 제한. 0이면 제한 없음. 2코어 호스트면 최대값 2 |
| `cpuunits` | 정수 (1~262144) | cgroup v2: `100` | CPU 가중치(Weight). 값이 클수록 경합 시 더 많은 CPU 시간을 받음 |
| `affinity` | 문자열 | (없음) | VM 프로세스를 특정 호스트 코어에 고정. 예: `0,5,8-11` |
| `numa` | 불린 | `0` | NUMA 토폴로지 에뮬레이션 활성화 |

**cpu 속성 상세:**

`cpu` 속성은 단순 문자열이 아니라, 여러 하위 옵션을 쉼표로 결합한 복합 값이다.

```
cpu: host,flags=+aes;+pdpe1gb,hidden=1
```

| 하위 옵션 | 설명 |
|-----------|------|
| `cputype` (기본 키) | 에뮬레이션할 CPU 모델. 아래 표 참고 |
| `flags` | 추가 CPU 플래그. `+FLAG`로 활성화, `-FLAG`로 비활성화. 세미콜론(`;`)으로 구분 |
| `hidden` | `1`이면 KVM 가상머신임을 숨김. GPU 패스스루(Passthrough) 시 NVIDIA 드라이버 우회용 |
| `phys-bits` | 물리 메모리 주소 비트 수. `host`로 설정하면 호스트 값을 따름 |

**주요 cputype 선택 가이드:**

| 타입 | 용도 |
|------|------|
| `host` | 호스트 CPU의 모든 기능을 그대로 노출. **성능 최고.** 단, 라이브 마이그레이션(Live Migration) 시 대상 노드의 CPU가 동일하거나 상위여야 함 |
| `kvm64` (기본값) | 범용 가상 CPU. 마이그레이션 호환성이 가장 높음. 성능은 `host` 대비 떨어짐 |
| `x86-64-v2-AES` | x86-64 마이크로아키텍처 레벨 v2 + AES. 적당한 성능과 마이그레이션 호환성의 균형 |
| `EPYC` / `Cascadelake-Server` 등 | 특정 실제 CPU를 에뮬레이션. 같은 세대 CPU 간 마이그레이션 가능 |

**실전 판단 기준:** 단일 노드(네 환경)에서는 `host`가 최선이다. 클러스터에서 라이브 마이그레이션이 필요하면, 클러스터 내 가장 낮은 CPU 세대에 맞춰 공통 타입을 선택해야 한다.

---

### 2.2 메모리 (Memory)

| 속성 | 형식 | 기본값 | 설명 |
|------|------|--------|------|
| `memory` | 정수 (MiB) | `512` | VM에 할당할 최대 RAM. Balloon 사용 시 이 값이 상한 |
| `balloon` | 정수 (MiB) | (없음, 0이면 비활성화) | Balloon 드라이버의 최소 보장 메모리. `0`이면 Ballooning 자체를 끔 |
| `shares` | 정수 (0~50000) | `1000` | Auto-Ballooning 시 메모리 가중치. 값이 높을수록 더 많이 받음 |
| `allow-ksm` | 불린 | `1` | KSM(Kernel Samepage Merging) 허용. 동일 페이지를 공유하여 메모리 절약 |

**Balloon 메커니즘:**

`memory: 4096`이고 `balloon: 1024`라면, VM은 최대 4GiB까지 쓸 수 있지만, 호스트가 메모리 압박을 느끼면 Balloon 드라이버가 게스트 내부에서 메모리를 "부풀려" 회수하여 최소 1GiB까지 줄일 수 있다. 게스트 입장에서는 가용 메모리가 줄어든 것처럼 보인다.

개발/테스트 환경에서 여러 VM을 띄울 때 유용하지만, 운영 환경에서는 `balloon: 0`으로 비활성화하고 고정 메모리를 할당하는 것이 안정적이다.

---

### 2.3 디스크 (Storage Devices)

Proxmox에서 VM에 디스크를 연결하는 방법은 **버스 타입(Bus Type)** 에 따라 4가지가 있다.

| 버스 | 속성명 | 슬롯 | 특징 |
|------|--------|------|------|
| IDE | `ide[0-3]` | 최대 4개 | 레거시. CD-ROM에 주로 사용. 성능 낮음 |
| SATA | `sata[0-5]` | 최대 6개 | 중간 성능. 일부 레거시 OS 호환용 |
| SCSI | `scsi[0-30]` | 최대 31개 | VirtIO SCSI와 함께 사용 시 **최고 성능.** 권장 |
| VirtIO Block | `virtio[0-15]` | 최대 16개 | 준가상화(Paravirtualized) 블록 디바이스. 성능 우수하나 SCSI 대비 기능 부족 |

**디스크 속성의 공통 하위 옵션:**

모든 버스 타입의 디스크 속성은 동일한 하위 옵션 구조를 공유한다. 네 `.conf`의 `scsi0` 줄을 기준으로 설명한다.

```
scsi0: local-lvm:vm-101-disk-0,size=32G
```

이것은 최소 형태이고, 실전에서는 이렇게 확장할 수 있다:

```
scsi0: local-lvm:vm-101-disk-0,size=32G,cache=writeback,discard=on,ssd=1,iothread=1,backup=1
```

| 하위 옵션 | 값 | 기본값 | 설명 |
|-----------|-----|--------|------|
| `file` (기본 키) | `스토리지:볼륨명` | — | 디스크가 저장된 위치와 볼륨 이름 |
| `size` | 디스크 크기 | — | 정보성 값. 실제 크기 변경은 `qm resize` 사용 |
| `cache` | 아래 표 참고 | (없음) | 캐시 모드. 성능과 데이터 안전성의 트레이드오프 |
| `discard` | `on` / `ignore` | `ignore` | TRIM/Discard 명령 전달 여부. SSD 백엔드 + 씬 프로비저닝(Thin Provisioning) 시 `on` 권장 |
| `ssd` | `1` / `0` | `0` | 게스트에 SSD로 노출. `discard=on`과 함께 사용 시 게스트가 TRIM을 발행함 |
| `iothread` | `1` / `0` | `0` | I/O 스레드 분리. SCSI에서만 지원. 디스크별 독립 I/O 처리로 성능 향상 |
| `backup` | `1` / `0` | `1` | vzdump 백업에 이 디스크를 포함할지 여부 |
| `replicate` | `1` / `0` | `1` | 복제(Replication) 작업에 포함할지 여부 |
| `aio` | `io_uring` / `native` / `threads` | (자동) | 비동기 I/O 엔진. `io_uring`이 최신이고 성능 최고 |
| `format` | `raw` / `qcow2` / `vmdk` | (스토리지 의존) | 디스크 이미지 포맷 |
| `media` | `disk` / `cdrom` | `disk` | 미디어 타입 |
| `snapshot` | `1` / `0` | — | QEMU 스냅샷 모드. 켜면 VM 종료 시 디스크 변경분 폐기 (일시적 사용) |
| `serial` | 문자열 | — | 디스크 시리얼 넘버. 게스트 내부에서 식별용 |
| `ro` | `1` / `0` | — | 읽기 전용 (SCSI만 지원) |

**cache 모드 선택 가이드:**

| 모드 | 호스트 캐시 | 게스트 캐시 | 안전성 | 성능 | 적합한 상황 |
|------|------------|------------|--------|------|-------------|
| `none` | 미사용 | 미사용 | 높음 | 좋음 | **기본 권장값.** 대부분의 워크로드 |
| `writeback` | 사용 | 사용 | 중간 | **최고** | 데이터 유실 감수 가능한 개발/테스트 환경 |
| `writethrough` | 사용 | 미사용 | 높음 | 낮음 | 읽기 위주 워크로드 |
| `directsync` | 미사용 | 미사용 | **최고** | 최저 | 데이터 무결성이 최우선인 경우 |
| `unsafe` | 사용 | 사용 | **최저** | 최고 | 일시적 벤치마크/테스트 전용. 절대 운영 금지 |

**I/O 쓰로틀링(Throttling) 옵션:**

디스크별로 I/O 대역폭과 IOPS를 제한할 수 있다. CMP에서 "서비스 등급(Service Tier)" 을 구현할 때 핵심이 되는 옵션이다.

| 옵션 | 단위 | 설명 |
|------|------|------|
| `mbps` | MB/s | 읽기+쓰기 합산 대역폭 제한 |
| `mbps_rd` / `mbps_wr` | MB/s | 읽기/쓰기 별도 제한 |
| `mbps_max` | MB/s | 버스트(Burst) 허용 최대 대역폭 |
| `iops` | ops/s | 읽기+쓰기 합산 IOPS 제한 |
| `iops_rd` / `iops_wr` | ops/s | 읽기/쓰기 별도 제한 |
| `iops_max` | ops/s | 버스트 허용 최대 IOPS |
| `*_max_length` | 초 | 버스트 지속 가능 시간 |

---

### 2.4 SCSI 컨트롤러 (scsihw)

```
scsihw: virtio-scsi-single
```

이 속성은 독립적으로 이해해야 한다. 디스크(`scsi0`, `scsi1`, ...)가 "하드디스크"라면, `scsihw`는 그 하드디스크를 메인보드에 연결하는 **"어댑터 카드"** 의 종류다.

| 값 | 설명 | 권장 여부 |
|-----|------|----------|
| `lsi` (기본값) | LSI Logic 에뮬레이션. 레거시 호환용 | △ |
| `lsi53c810` | 더 오래된 LSI 칩셋 | × |
| `megasas` | LSI MegaRAID 에뮬레이션 | × |
| `pvscsi` | VMware Paravirtual SCSI. VMware에서 마이그레이션 시 | △ |
| `virtio-scsi-pci` | VirtIO SCSI (공유 큐). 모든 디스크가 하나의 큐를 공유 | ○ |
| `virtio-scsi-single` | VirtIO SCSI (개별 큐). 디스크마다 독립 큐. `iothread=1`과 조합 시 **최고 성능** | **◎ 강력 권장** |

`virtio-scsi-single` + `iothread=1` 조합이 현재 Proxmox에서 달성할 수 있는 최고의 디스크 I/O 성능 구성이다.

---

### 2.5 네트워크 (Network)

```
net0: virtio=BC:24:11:BD:56:51,bridge=vmbr0
```

`net[0-N]` 속성으로 네트워크 인터페이스를 정의한다.

| 하위 옵션 | 값 | 기본값 | 설명 |
|-----------|-----|--------|------|
| `model` (기본 키) | 아래 표 참고 | — | NIC 에뮬레이션 모델. `=` 뒤에 MAC 주소가 붙음 |
| `bridge` | 브릿지명 | (없음) | 연결할 Linux 브릿지. 미지정 시 KVM 내부 NAT 네트워크 사용 |
| `firewall` | `1` / `0` | — | Proxmox 방화벽 적용 여부 |
| `tag` | 정수 (1~4094) | — | VLAN 태그 |
| `trunks` | VLAN ID 목록 | — | VLAN 트렁킹. 세미콜론(`;`)으로 구분 |
| `rate` | 실수 (MB/s) | — | 대역폭 제한 |
| `macaddr` | `XX:XX:XX:XX:XX:XX` | 자동 생성 | MAC 주소 수동 지정 |
| `mtu` | 정수 (1~65520) | (브릿지 따름) | MTU 크기. VirtIO에서만 지원. `1`이면 브릿지 MTU 자동 상속 |
| `queues` | 정수 (0~64) | — | 멀티큐(Multi-Queue) 패킷 처리. 고성능 네트워크 시 vCPU 수에 맞춰 설정 |
| `link_down` | `1` / `0` | `0` | 케이블 뽑힌 상태 시뮬레이션 |

**NIC 모델 선택 가이드:**

| 모델 | 성능 | 호환성 | 적합한 상황 |
|------|------|--------|-------------|
| `virtio` | **최고** | Linux/최신 Windows | **기본 선택.** 준가상화로 CPU 오버헤드 최소 |
| `e1000` | 좋음 | 거의 모든 OS | VirtIO 드라이버가 없는 게스트 OS용 |
| `e1000e` | 좋음 | 최신 OS | e1000의 개선판 |
| `vmxnet3` | 좋음 | VMware 환경 | VMware에서 마이그레이션한 VM |
| `rtl8139` | 낮음 | 아주 오래된 OS | Windows XP 이전. 사용 안 함 |

---

### 2.6 부팅 (Boot)

| 속성 | 형식 | 기본값 | 설명 |
|------|------|--------|------|
| `boot` | `order=장치1;장치2;...` | — | 부팅 순서. 세미콜론으로 구분. 예: `order=scsi0;net0` |
| `bios` | `seabios` / `ovmf` | `seabios` | BIOS 구현체. UEFI 부팅이 필요하면 `ovmf` |
| `efidisk0` | 볼륨 + 옵션 | — | OVMF(UEFI) 사용 시 EFI 변수를 저장할 디스크 |
| `machine` | 복합 문자열 | (자동) | QEMU 머신 타입 |

**machine 속성 상세:**

```
machine: type=q35,viommu=intel
```

| 하위 옵션 | 값 | 설명 |
|-----------|-----|------|
| `type` | `pc` (i440fx) / `q35` | 칩셋 타입. PCIe 패스스루 시 `q35` 필요 |
| `viommu` | `intel` / `virtio` | 가상 IOMMU. `intel`은 `q35`에서만 동작 |
| `enable-s3` / `enable-s4` | 불린 | S3(Sleep)/S4(Hibernate) 절전 모드 지원 |

**UEFI 부팅 구성 예시:**

```
bios: ovmf
efidisk0: local-lvm:vm-101-disk-1,efitype=4m,pre-enrolled-keys=1,size=528K
machine: type=q35
```

`efitype=4m`은 새로운 규격이고 Secure Boot를 지원한다. `pre-enrolled-keys=1`이면 Microsoft와 배포판의 Secure Boot 키가 사전 등록된다.

---

### 2.7 디스플레이 (VGA)

| 속성 | 형식 | 기본값 | 설명 |
|------|------|--------|------|
| `vga` | 복합 문자열 | `std` | 그래픽 카드 에뮬레이션 |

```
vga: type=virtio,memory=32
```

| VGA 타입 | 설명 |
|----------|------|
| `std` (기본값) | 표준 VGA. 대부분의 경우 충분 |
| `virtio` | 준가상화 GPU. 2D 성능 우수, Linux 환경에서 권장 |
| `virtio-gl` | 3D 가속(VirGL) 지원 VirtIO GPU |
| `qxl` / `qxl2` / `qxl3` / `qxl4` | SPICE 프로토콜용. 숫자는 모니터 수 |
| `cirrus` | 레거시. 아주 오래된 Windows용 |
| `serial0`~`serial3` | 그래픽 카드 없이 시리얼 콘솔만 사용. **Cloud-Init 이미지의 표준 설정** |
| `none` | 그래픽 카드 없음. GPU 패스스루 시 |

**`serial0`을 VGA로 사용하는 이유:** Cloud 이미지는 대부분 시리얼 콘솔 출력을 전제로 만들어져 있다. `--serial0 socket --vga serial0`은 Cloud-Init 템플릿의 관용적(Idiomatic) 구성이다.

---

### 2.8 QEMU Guest Agent

```
agent: enabled=1,freeze-fs-on-backup=1,fstrim_cloned_disks=1
```

| 하위 옵션 | 기본값 | 설명 |
|-----------|--------|------|
| `enabled` | `0` | Guest Agent 활성화. **반드시 켜라** |
| `freeze-fs-on-backup` | `1` | 백업 시 파일시스템 동결. 데이터 일관성 확보 |
| `fstrim_cloned_disks` | `0` | 디스크 이동/마이그레이션 후 자동 fstrim 실행. 씬 프로비저닝 시 공간 회수에 유용 |
| `type` | `virtio` | 통신 채널 타입. ISA는 레거시용 |

---

### 2.9 Cloud-Init

Cloud-Init 관련 속성들은 VM을 프로비저닝(Provisioning)할 때만 의미가 있다. 첫 부팅 시 Cloud-Init 데몬이 이 값들을 읽어 게스트를 자동 설정한다.

| 속성 | 설명 |
|------|------|
| `ciuser` | 생성할 사용자명 |
| `cipassword` | 사용자 비밀번호. **SSH 키 사용을 권장**, 비밀번호는 비권장 |
| `sshkeys` | SSH 공개키. URL-Encoded 형태. 한 줄에 하나씩 |
| `ipconfig[0-N]` | 네트워크 설정. `ip=dhcp` 또는 `ip=10.0.0.10/24,gw=10.0.0.1` |
| `nameserver` | DNS 서버 |
| `searchdomain` | DNS 검색 도메인 |
| `citype` | Cloud-Init 포맷. `nocloud`(Linux) / `configdrive2`(Windows) |
| `ciupgrade` | 첫 부팅 후 자동 `apt upgrade` 실행 여부. 기본 `1` |
| `cicustom` | 사용자 정의 Cloud-Init YAML 파일 경로. `user=local:snippets/config.yaml` |

---

### 2.10 기타 중요 속성

| 속성 | 형식 | 기본값 | 설명 |
|------|------|--------|------|
| `acpi` | 불린 | `1` | ACPI 활성화. 끄면 게스트가 정상 종료(Shutdown) 시그널을 못 받음 |
| `onboot` | 불린 | `0` | **호스트 부팅 시 VM 자동 시작.** 운영 VM은 `1`로 설정 |
| `startup` | `order=N,up=초,down=초` | — | 자동 시작 순서와 지연. 예: `order=1,up=30` = 1번째로 시작, 30초 대기 후 다음 VM 시작 |
| `protection` | 불린 | `0` | 보호 모드. `1`이면 VM 삭제와 디스크 제거가 차단됨 |
| `tablet` | 불린 | `1` | USB 태블릿 장치. VNC 마우스 동기화용. 콘솔 전용 VM은 `0`으로 끄면 컨텍스트 스위칭 절감 |
| `hotplug` | 문자열 | `network,disk,usb` | 핫플러그 허용 장치 유형. `cpu`, `memory`도 추가 가능 |
| `kvm` | 불린 | `1` | KVM 하드웨어 가속. `0`이면 순수 소프트웨어 에뮬레이션(매우 느림) |
| `localtime` | 불린 | (OS 의존) | RTC를 로컬 시간으로 설정. Windows VM은 자동 활성화 |
| `ostype` | 문자열 | `other` | 게스트 OS 타입. Proxmox가 OS별 최적화를 적용하는 기준 |
| `template` | 불린 | `0` | 템플릿 여부. `1`이면 VM 시작 불가, Clone 전용 |
| `lock` | 문자열 | (없음) | VM 잠금 상태. `backup`, `clone`, `migrate` 등 작업 중 자동 설정 |
| `tags` | 문자열 | — | 태그. 메타 정보. Web UI에서 필터링/정리용 |
| `description` | 문자열 | — | 설명. `.conf` 파일에서는 `#`으로 시작하는 주석으로 저장됨 |
| `hookscript` | 문자열 | — | 라이프사이클 이벤트(시작/정지 등) 시 실행할 스크립트 경로 |
| `args` | 문자열 | — | QEMU에 직접 전달할 임의 인자. **전문가 전용** |

**ostype 값 목록:**

| 값 | 게스트 OS |
|-----|----------|
| `l26` | Linux 커널 2.6 ~ 6.x (**현대 Linux 전부**) |
| `l24` | Linux 커널 2.4 (레거시) |
| `win11` | Windows 11 / Server 2022 / Server 2025 |
| `win10` | Windows 10 / Server 2016 / Server 2019 |
| `win8` | Windows 8 / Server 2012 |
| `win7` | Windows 7 |
| `wvista` | Windows Vista |
| `wxp` | Windows XP |
| `w2k8` | Windows Server 2008 |
| `w2k3` | Windows Server 2003 |
| `w2k` | Windows 2000 |
| `solaris` | Solaris / OpenSolaris |
| `other` (기본값) | 미지정 |

`ostype`을 정확히 설정하면 Proxmox가 해당 OS에 맞는 최적화를 적용한다. 예를 들어 Windows 타입이면 RTC를 로컬 시간으로 자동 설정하고, Hyper-V Enlightenments를 활성화한다.

---

### 2.11 하드웨어 패스스루 (PCI Passthrough)

```
hostpci0: 0000:01:00.0,pcie=1,x-vga=1
```

| 하위 옵션 | 설명 |
|-----------|------|
| `host` | 호스트 PCI 장치 ID. `lspci`로 확인 |
| `pcie` | PCIe 모드. `q35` 머신 타입 필요 |
| `x-vga` | VGA 패스스루. GPU 패스스루 시 `1` |
| `rombar` | ROM BAR 노출 여부 |
| `driver` | `vfio`(기본) / `keep`. `keep`은 호스트 드라이버 유지 |
| `mdev` | Mediated Device 타입. vGPU 등 |

PCI 패스스루를 사용하면 **해당 VM은 라이브 마이그레이션이 불가능**해진다.

---

### 2.12 TPM (Trusted Platform Module)

```
tpmstate0: local-lvm:vm-101-disk-2,size=4M,version=v2.0
```

Windows 11은 TPM 2.0을 요구한다. `version=v2.0`으로 설정하라. 이 값은 **생성 후 변경 불가**이다.

---

## 3. 실전 .conf 예시: 최적화된 Linux VM

네가 만든 101.conf를 실전 수준으로 끌어올리면 이렇게 된다.

```ini
# Debian 13 Test VM — 최적화 구성
agent: enabled=1,freeze-fs-on-backup=1,fstrim_cloned_disks=1
balloon: 0
boot: order=scsi0
cores: 2
cpu: host
ide2: local:iso/debian-13.3.0-amd64-netinst.iso,media=cdrom
memory: 2048
name: test-vm
net0: virtio=BC:24:11:BD:56:51,bridge=vmbr0,firewall=1
onboot: 0
ostype: l26
scsi0: local-lvm:vm-101-disk-0,size=32G,discard=on,ssd=1,iothread=1
scsihw: virtio-scsi-single
serial0: socket
```

원래 네 `.conf`에서 바뀐 것들:

- `agent: enabled=1` 추가 → Guest Agent 활성화
- `balloon: 0` 추가 → Ballooning 비활성화 (메모리 고정 할당)
- `boot: order=scsi0` → OS 설치 후 하드디스크 부팅으로 변경
- `cpu: host` 추가 → 최고 CPU 성능
- `ostype: l26` 추가 → Linux 최적화 적용
- `scsi0`에 `discard=on,ssd=1,iothread=1` 추가 → 디스크 I/O 최적화
- `net0`에 `firewall=1` 추가 → 방화벽 활성화
- `serial0: socket` 추가 → 시리얼 콘솔 접근 가능

자동 생성된 `smbios1`, `vmgenid`, `meta`는 건드리지 않았다. Proxmox가 알아서 관리하는 값이다.

---

## 부록: 출처

| 문서 | URL |
|------|-----|
| qm.conf(5) 공식 매뉴얼 | https://pve.proxmox.com/pve-docs/qm.conf.5.html |
| qm(1) CLI 매뉴얼 | https://pve.proxmox.com/pve-docs/qm.1.html |
| VM 설정 공식 가이드 | https://pve.proxmox.com/pve-docs/pve-admin-guide.html#qm_virtual_machines_settings |
| Cloud-Init 지원 | https://pve.proxmox.com/wiki/Cloud-Init_Support |
| QEMU Guest Agent | https://pve.proxmox.com/wiki/Qemu-guest-agent |
| PCI Passthrough | https://pve.proxmox.com/wiki/PCI_Passthrough |
