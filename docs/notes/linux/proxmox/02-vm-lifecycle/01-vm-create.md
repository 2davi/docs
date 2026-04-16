---
title: "VM 생성 & 초기 설정"
date: 2026-04-07
lastmod: 2026-04-16
author: "Davi"
description: "qm create 명령 구조, .conf 파일 해부, QEMU 가상화 레이어, QEMU Guest Agent, VirtualBox Nested 환경 제약사항까지."
slug: "vm-create"
section: "notes"
category: "proxmox"
tags: [proxmox, qemu, kvm, virtio, e1000, nested-virt, guest-agent, lvm-thin, vm-lifecycle]
order: 1
series: "Proxmox VE 학습 시리즈"
series_order: 3
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목            | 내용                          |
| --------------- | ----------------------------- |
| Proxmox VE      | 9.1-1 (Debian Bookworm 기반)  |
| 선행 문서       | `01-setup/01-installation.md` |
| 관리 인터페이스 | `https://127.0.0.1:8006`      |
| 노드명          | kcy0122                       |

---

## 1. VM 라이프사이클 개요

Proxmox에서 QEMU/KVM 가상 머신은 다음 흐름을 따른다.

```markdown
생성(Create) → 구성(Configure) → 시작(Start) → 운용
     ↓                                            ↓
  복제(Clone)                             스냅샷(Snapshot)
     ↓                                            ↓
  템플릿(Template)                        롤백(Rollback)
                                                  ↓
                          백업(Backup) ←─ 삭제(Destroy)
                               ↓
                          복구(Restore)
```

Web UI에서 버튼 하나를 클릭하는 모든 행위는 내부적으로 `https://<host>:8006/api2/json/` 엔드포인트에 대한 REST API 호출이다. CLI(`qm`)도 마찬가지로 이 API를 내부적으로 사용한다. CMP를 개발한다는 것은 이 API를 프로그래밍적으로 호출하는 것이다. CLI로 먼저 손을 익히는 이유가 여기 있다.

> - **공식 API 레퍼런스:** https://pve.proxmox.com/pve-docs/api-viewer/index.html
> - **공식 CLI 매뉴얼:** https://pve.proxmox.com/pve-docs/qm.1.html

---

## 2. VM이란 무엇인가 — QEMU 프로세스 관점

Proxmox에서 "VM 하나"는 실질적으로 **QEMU 프로세스 하나**다. `qm start <VMID>`를 실행하면, Proxmox는 `/etc/pve/qemu-server/<VMID>.conf` 파일을 읽고, 그 내용대로 `qemu-system-x86_64` 프로세스를 띄운다.

`.conf` 파일은 QEMU에게 전달하는 **레시피**다. "CPU 몇 개, RAM 얼마, 디스크는 어디에, NIC 모델은 무엇"을 선언하는 텍스트 파일에 불과하다. VM의 실체는 이 파일이 아니라 이 파일을 읽고 생성된 프로세스다.

### 2.1 `.conf` 파일 구조 해부

`qm create 100`만 실행하면 생성되는 최소 설정 파일:

```bash
cat /etc/pve/qemu-server/100.conf

boot:
meta: creation-qemu=10.1.2,ctime=1775548839
smbios1: uuid=5e4cc988-e5a2-4557-a09d-0f8311a0e455
vmgenid: d4ef9356-c095-49a9-aeb3-d300f8ce7f3e
```

각 필드의 의미:

| 필드      | 의미                                                                            |
| --------- | ------------------------------------------------------------------------------- |
| `boot`    | 부팅 순서. 비어있으면 Proxmox 기본값으로 자동 결정                              |
| `meta`    | QEMU 버전, 생성 시각(Unix timestamp) — Proxmox 내부 추적용                      |
| `smbios1` | SMBIOS(System Management BIOS) UUID. 게스트 OS가 하드웨어를 식별하는 값         |
| `vmgenid` | VM Generation ID. 스냅샷 롤백·클론 시 OS에게 "VM 상태가 바뀌었다"고 알리는 신호 |

`vmgenid`는 Microsoft가 Hyper-V를 위해 만들고 QEMU가 구현한 메커니즘이다. Windows VM이 스냅샷에서 롤백될 때 Active Directory 복제 충돌을 방지하는 데 사용된다. Linux에서도 시간 동기화 데몬(chrony, ntpd)이 이 값을 감지하고 시계를 강제 재동기화하도록 설계할 수 있다.

전체 `.conf` 필드 레퍼런스는 `06-references/01-qm-conf-reference.md`에서 다룬다.

---

## 3. VM 생성 명령어

```bash
qm create <VMID> [OPTIONS]
```

`qm create`는 `.conf` 파일을 생성하는 명령이다. 디스크를 지정하면 스토리지 풀에서 LV(Logical Volume) 또는 ZFS dataset을 할당하고, NIC를 지정하면 tap 디바이스를 브릿지에 연결할 준비를 한다. 하지만 QEMU 프로세스가 실제로 뜨는 시점은 `qm start`를 실행할 때다.

### 3.1 VMID 체계 설계

VMID는 클러스터 전체에서 고유한 정수값(100 이상)이다. 체계 없이 쓰면 VM이 수십 개만 쌓여도 관리가 안 된다. 일반적인 범위 설계 패턴:

| 대역      | 용도                          |
| --------- | ----------------------------- |
| 100–199   | 인프라·관리용 (DNS, 모니터링) |
| 200–299   | 개발·테스트 환경              |
| 300–399   | 스테이징(Staging)             |
| 500–599   | 운영(Production)              |
| 8000–8999 | 템플릿(Template)              |
| 9000–9999 | 백업·스냅샷 보존용 클론       |

CMP에서 자동 VMID 할당 로직을 구현할 때, 이 범위 정책을 기반으로 `GET /api2/json/cluster/nextid`로 다음 사용 가능한 VMID를 조회한 뒤 범위를 확인하는 방식으로 구성한다.

### 3.2 주요 옵션 해설

```bash
qm create <VMID> \
  --name <이름>        \   # /etc/pve/qemu-server/<VMID>.conf의 name 필드
  --cores <수>         \   # vCPU 수 (소켓은 기본 1)
  --cpu <모델>         \   # CPU 모델. "host"는 물리 CPU 기능을 그대로 패스스루
  --memory <MB>        \   # 메모리 (MiB 단위)
  --balloon <0|1>      \   # 메모리 풍선 장치. 0=비활성화
  --ostype <타입>      \   # OS 타입 힌트. l26=Linux 2.6+, win10, etc.
  --agent enabled=1    \   # QEMU Guest Agent 활성화
  --scsihw <컨트롤러>  \   # SCSI 컨트롤러 타입
  --scsi0 <스토리지:크기> \ # 부팅 디스크
  --net0 <모델,bridge=브릿지> \ # NIC
  --serial0 socket     \   # 시리얼 콘솔 (Cloud-Init 사용 시 필수)
  --ide2 <iso>,media=cdrom \ # 설치 ISO
  --boot order=ide2        # 부팅 순서
```

---

## 4. CPU 가상화 레이어 — KVM과 TCG

`--cpu` 옵션과 `--kvm` 옵션을 설정하기 전에, Proxmox에서 VM을 실행하는 두 가지 CPU 가상화 경로를 이해해야 한다.

### 4.1 KVM (Kernel-based Virtual Machine)

KVM은 Linux 커널의 가상화 모듈이다. Intel VT-x 또는 AMD-V 하드웨어 가상화 명령어를 사용하여 게스트 CPU 명령어를 **거의 직접 실행**한다. 게스트가 특권 명령(Privileged Instruction)을 실행하면 VM Exit가 발생하여 KVM이 처리하고, 일반 명령은 물리 CPU에서 네이티브 속도로 실행된다.

성능: 물리 CPU 대비 1~5% 오버헤드. 사실상 베어메탈과 동일하다.

### 4.2 TCG (Tiny Code Generator)

KVM을 사용할 수 없을 때의 폴백(Fallback)이다. QEMU가 게스트 CPU의 모든 명령어를 소프트웨어로 번역하여 호스트 CPU에서 실행한다. 완전한 소프트웨어 에뮬레이션이므로:

- 게스트 CPU 아키텍처가 달라도 동작 (예: ARM 게스트를 x86 호스트에서)
- 성능: KVM 대비 10~50배 느림
- CPU 자원을 호스트에서 독점 소모하므로, 게스트 I/O 집중 구간에서 호스트 응답성이 저하될 수 있다

`--kvm 0` 옵션으로 TCG 강제 활성화 가능하다.

### 4.3 `--cpu host` vs CPU 모델 지정

| 옵션          | 동작                                               | 적합 상황                                        |
| ------------- | -------------------------------------------------- | ------------------------------------------------ |
| `--cpu host`  | 물리 CPU의 모든 기능 플래그를 게스트에 그대로 노출 | 동일 호스트에서만 운영되는 VM, 최고 성능 필요 시 |
| `--cpu kvm64` | KVM 기본 가상 CPU. 기능 플래그를 최소화            | VM 마이그레이션 시 CPU 기능 불일치 방지          |
| `--cpu max`   | 현재 QEMU가 지원하는 모든 기능 활성화              | 테스트 목적                                      |

클러스터 내 노드 간 **Live Migration**을 고려한다면 `--cpu host`는 위험하다. 노드 A(Intel)에서 `cpu: host`로 만든 VM을 노드 B(AMD)로 마이그레이션하면 CPU 기능 불일치로 VM이 크래시한다. 마이그레이션이 예상되는 VM에는 `--cpu kvm64`를 사용하거나, 클러스터의 모든 노드가 동일한 CPU 세대임을 보장해야 한다.

### 4.4 QEMU Machine Type

`--machine` 옵션으로 VM에게 어떤 가상 칩셋 위에서 돌고 있는지를 선언한다.

| 타입     | 가상 칩셋        | 특징                                                            |
| -------- | ---------------- | --------------------------------------------------------------- |
| `i440fx` | Intel 440FX PCIx | 전통적 PC 칩셋 에뮬레이션. 레거시 PCI 버스. 기본값. 호환성 최고 |
| `q35`    | Intel ICH9 PCIe  | PCIe 네이티브 지원. UEFI/OVMF, GPU 패스스루, NVMe 사용 시 권장  |

특별한 이유가 없으면 `i440fx`를 그대로 두고, UEFI 부팅이나 PCIe 패스스루가 필요할 때 `q35`로 전환한다.

---

## 5. 스토리지 옵션 해설

### 5.1 SCSI 컨트롤러 선택 (`--scsihw`)

| 컨트롤러             | 특징                                                 |
| -------------------- | ---------------------------------------------------- |
| `virtio-scsi-single` | 디스크 하나에 컨트롤러 하나. iothread 지원. **권장** |
| `virtio-scsi-pci`    | 단일 컨트롤러에 디스크 여러 개. iothread 없음        |
| `lsi`                | LSI 53C895A 에뮬레이션. 레거시 호환용                |
| `pvscsi`             | VMware 준가상화. VMware 마이그레이션 시 사용         |

`virtio-scsi-single`은 `iothread=1` 옵션과 함께 쓸 때 진가를 발휘한다. iothread는 디스크 I/O를 별도 스레드에서 처리하여 QEMU 메인 루프의 블로킹을 방지한다. 디스크 I/O가 많은 워크로드에서 눈에 띄는 성능 차이가 난다.

### 5.2 디스크 옵션

```bash
--scsi0 local-lvm:32,discard=on,iothread=1
#         스토리지:크기(GB)  ^^^^^^^^^^^^^^ 추가 옵션
```

| 옵션         | 설명                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| `discard=on` | 게스트 내부 `fstrim` 명령이 실제 스토리지 레벨 TRIM으로 전달됨. LVM-thin에서 삭제된 블록을 물리적으로 반환 |
| `iothread=1` | 해당 디스크의 I/O를 전용 스레드로 처리. `virtio-scsi-single`에서만 유효                                    |
| `ssd=1`      | SSD 에뮬레이션 힌트. 게스트 OS가 회전식 디스크가 아님을 인식                                               |
| `cache=none` | 호스트 페이지 캐시를 바이패스. 데이터 정합성 중요한 DB 워크로드에 사용                                     |

Proxmox 9.x에서 `discard` 속성 값이 `off` → `ignore`로 변경되었다. `discard=on`은 이전 버전과의 호환 표기이며, 최신 버전에서는 `discard=ignore`가 "TRIM 무시"를 의미한다.

---

## 6. NIC 모델 선택 — 에뮬레이션 vs 준가상화

VM의 네트워크 설정에서 가장 중요한 선택 중 하나다.

### 6.1 에뮬레이션 방식 — `e1000`

QEMU가 실제 존재하는 물리 하드웨어(Intel 82540EM)의 모든 동작을 소프트웨어로 재현한다. 게스트 OS의 e1000 드라이버가 하드웨어 레지스터에 값을 쓰면, QEMU가 해당 쓰기를 가로채서(VM Exit/Trap) "이 하드웨어라면 이렇게 반응했을 것"을 계산하여 응답한다.

- **장점:** 게스트 OS가 "가상화 환경에서 돌고 있다"는 사실을 모름. 수십 년 된 OS에도 드라이버 기본 탑재.
- **단점:** 매 패킷마다 수많은 VM Exit가 발생. 컨텍스트 스위칭 비용이 쌓이면 처리량(Throughput) 감소, CPU 사용률 증가.

### 6.2 준가상화 방식 — `virtio`

게스트 OS가 "가상 머신 안에 있다"는 사실을 인지하고, VirtIO 표준 인터페이스로 QEMU와 직접 통신한다. 핵심은 **공유 메모리 기반의 링 버퍼(VirtQueue)**다. 게스트가 패킷을 전송할 때 하드웨어 레지스터를 하나하나 건드리는 대신, 공유 메모리의 링 버퍼에 패킷을 쓰고 알림(Notification) 한 번만 보낸다.

- **장점:** VM Exit 횟수가 극적으로 줄어 성능이 에뮬레이션 대비 수 배 이상 높음. CPU 오버헤드 최소화.
- **단점:** 게스트 OS에 VirtIO 드라이버 필요 (현대 Linux 커널은 기본 탑재).

### 6.3 NIC 모델 선택 기준

| 환경                           | 권장 모델                 | 이유                                                                   |
| ------------------------------ | ------------------------- | ---------------------------------------------------------------------- |
| 물리 서버(베어메탈) Proxmox    | `virtio`                  | 최고 성능, 드라이버 호환 문제 없음                                     |
| VirtualBox 중첩 환경           | `e1000`                   | VirtIO의 VirtQueue 메모리 매핑이 중첩 가상화 레이어에서 충돌 (§9 참고) |
| 레거시 OS (Windows XP 이전 등) | `e1000`                   | VirtIO 드라이버 없음                                                   |
| VMware에서 마이그레이션        | `vmxnet3` → `virtio` 전환 | 마이그레이션 직후 vmxnet3, 안정화 후 virtio로 교체                     |

---

## 7. QEMU Guest Agent

### 7.1 Guest Agent란

QEMU Guest Agent(QGA)는 **게스트 OS 내부에서 실행되는 데몬**이다. 호스트(Proxmox)와 게스트(VM 내부 OS) 사이에 VirtIO Serial Port를 통한 통신 채널을 열어, 호스트가 게스트 내부 정보를 조회하거나 특정 동작을 요청할 수 있게 한다.

일반적인 API(REST, SSH)가 네트워크 레이어를 통하는 것과 달리, QGA는 하이퍼바이저 레벨에서 직접 연결되므로 **네트워크 설정과 무관하게 동작**한다. 게스트의 네트워크가 끊겼어도 QGA는 살아있다.

### 7.2 Guest Agent로 할 수 있는 것

| 기능                 | API 경로                               | 설명                                                                 |
| -------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| IP 주소 조회         | `GET .../agent/network-get-interfaces` | DHCP 환경에서 VM IP를 호스트에서 확인. CMP VM 목록에 IP 표시 시 필수 |
| 파일시스템 정지/재개 | `fsfreeze-freeze` / `fsfreeze-thaw`    | 일관성 있는 백업을 위한 I/O 정지                                     |
| 파일시스템 정보      | `GET .../agent/get-fsinfo`             | 마운트 포인트, 디스크 사용량 조회                                    |
| 안전한 종료          | `POST .../agent/shutdown`              | 게스트 OS에게 정상 종료 요청                                         |
| 명령 실행            | `POST .../agent/exec`                  | 게스트 내부에서 임의 명령 실행                                       |

**CMP 관점에서의 핵심:** Guest Agent가 없으면 VM의 QEMU 프로세스가 `running` 상태인지는 알 수 있지만, 게스트 OS가 실제로 부팅 완료되었는지, 네트워크 인터페이스가 올라왔는지, 애플리케이션이 정상 기동되었는지는 알 수 없다. "VM 기동 완료" 판별의 정확도가 크게 달라진다.

### 7.3 설치 및 활성화

**게스트 내부 (Debian/Ubuntu):**

```bash
apt install -y qemu-guest-agent
systemctl enable --now qemu-guest-agent
```

**Proxmox 호스트 측:**

```bash
# VM 설정에서 Guest Agent 활성화 (VirtIO Serial Port 생성)
qm set <VMID> --agent enabled=1

# 또는 생성 시:
qm create <VMID> --agent enabled=1,fstrim_cloned_disks=1
```

`fstrim_cloned_disks=1`은 이 VM을 클론한 뒤 첫 시작 시 게스트 내부에서 자동으로 `fstrim`을 실행한다. LVM-thin의 클론된 볼륨에서 실제 사용하지 않는 블록을 pool에 반환하여 공간 효율을 높인다.

> **중요:** 호스트 측에서 `--agent enabled=1` 설정 후에는 VM을 **완전히 종료(Shutdown)했다가 재시작**해야 적용된다. 단순 Reboot로는 VirtIO Serial Port가 생성되지 않는다.

---

## 8. CPU 오버커밋과 메모리 풍선

### 8.1 CPU 오버커밋 (vCPU Overcommit)

vCPU는 시분할(Time-Sharing)로 물리 코어를 공유한다. 물리 코어 4개인 호스트에 vCPU 합계 16개를 할당하는 것은 기술적으로 가능하며, 모든 VM이 동시에 CPU를 최대로 쓰지 않는 한 문제없다.

**실무 가이드라인:** 물리 코어 대비 2~4배. 10개 코어 호스트에 VM vCPU 합계 20~40개 정도. 워크로드 특성(CPU Bound vs I/O Bound)에 따라 달라진다.

### 8.2 메모리 풍선 (Memory Ballooning)

`--balloon` 장치를 활성화하면, Proxmox가 VM에 할당된 메모리를 런타임에 동적으로 증감할 수 있다. 메모리가 여유로운 VM에서 "풍선을 팽창"시켜 메모리를 뺏고, 필요한 VM에게 재분배한다.

`--balloon 0`은 이 장치를 비활성화한다. 이유:

- 풍선이 팽창하면 게스트 OS는 갑자기 메모리가 줄어드는 것을 경험하고, 이로 인해 스왑(Swap)을 사용하게 된다.
- 성능 예측이 어렵고, DB나 캐시 집약적 애플리케이션에서는 예상치 못한 성능 저하를 유발한다.
- 운영 환경에서는 `--balloon 0`으로 비활성화하고, 각 VM에 충분한 고정 메모리를 할당하는 것이 원칙이다.

---

## 9. VirtualBox Nested 환경 제약사항 — VirtIO NIC Hang

### 9.1 문제 개요

VirtualBox 위의 Proxmox 환경에서 VirtIO NIC(`--net0 virtio,...`)가 설정된 VM을 `qm start`하면 **Proxmox 호스트 전체가 Hang(무응답)** 된다. SSH 끊김, Web UI 접속 불가 상태가 된다. 그러나 VirtualBox의 VMState는 `"running"`이며 콘솔 화면은 정상 표시된다.

가상화 스택의 구조:

```markdown
Layer 4: 게스트 OS (Debian/Ubuntu)        ← VM 내부
Layer 3: QEMU 프로세스                    ← Proxmox 안에서 실행
Layer 2: Proxmox (Debian + KVM 모듈)      ← VirtualBox 게스트
Layer 1: VirtualBox + Nested VT-x         ← Windows 호스트
Layer 0: Windows + 물리 CPU (VT-x)        ← 실제 하드웨어
```

### 9.2 근본 원인 — VirtQueue 메모리 매핑

VirtIO NIC는 게스트와 QEMU 사이에 **공유 메모리(VirtQueue)**를 설정한다. 정상 베어메탈 환경에서 이 메모리 매핑은 2단계다:

```markdown
GPA → HPA  (Guest Physical Address → Host Physical Address)
      EPT(Extended Page Table)로 하드웨어 처리
```

VirtualBox 중첩 환경에서는 이것이 **3단계**로 뻥튀기된다:

```markdown
L2 GPA → L1 GPA → L0 HPA
(게스트)  (Proxmox)  (Windows 물리)
```

각 단계의 주소 변환을 VirtualBox가 소프트웨어로 에뮬레이션하는 과정에서, `ioeventfd` 처리 경로가 Nested 환경에서 교착(Deadlock) 또는 무한 루프에 빠진다. 결과적으로 Proxmox의 모든 vCPU가 VirtualBox 내부 메모리 관리 코드에 갇혀 다른 작업을 스케줄링하지 못한다.

**왜 콘솔은 정상으로 보였나:** VirtualBox 콘솔 렌더링은 VirtualBox 프로세스 자체의 스레드에서 처리되므로 Proxmox 내부 CPU 상태와 무관하게 마지막 렌더링된 화면을 계속 표시한다.

### 9.3 해결: `e1000`으로 NIC 모델 교체

`e1000` 에뮬레이션은 전통적인 MMIO + 인터럽트 경로를 사용한다. 이 경로는 VirtualBox의 Nested VT-x 구현에서 가장 잘 테스트된 코드 경로이며, VirtQueue 같은 복잡한 공유 메모리 매핑이 없다.

```bash
qm set <VMID> --net0 e1000,bridge=vmbr0,firewall=1
```

### 9.4 VirtualBox Nested 환경 제약 요약

| 항목                 | 사용 가능 | 비고                                          |
| -------------------- | --------- | --------------------------------------------- |
| KVM 하드웨어 가속    | ✅         | `--nested-hw-virt on` 활성화 필요             |
| `--cpu host`         | ✅         | 물리 CPU 기능 패스스루 동작                   |
| VirtIO 디스크 (SCSI) | ✅         | `virtio-scsi-single` + `iothread=1` 정상 동작 |
| VirtIO NIC           | ❌         | **Hang 유발. `e1000`으로 대체 필수**          |

> 이 제약은 VirtualBox 중첩 환경의 한계이지, VirtIO NIC 자체의 문제가 아니다. 물리 서버 Proxmox에서는 VirtIO NIC가 최선이다.

VirtIO NIC 아키텍처와 디버깅 과정의 전체 분석은 `06-references/02-nic-architecture-postmortem.md`에서 다룬다.

---

## 10. 실습

### 10.1 최소 VM 생성 (빈 껍데기)

```bash
qm create 100
cat /etc/pve/qemu-server/100.conf

# 출력
# boot:
# meta: creation-qemu=10.1.2,ctime=1775548839
# smbios1: uuid=5e4cc988-e5a2-4557-a09d-0f8311a0e455
# vmgenid: d4ef9356-c095-49a9-aeb3-d300f8ce7f3e
```

디스크도, NIC도, OS도 없는 빈 `.conf` 파일이다.

### 10.2 옵션 포함 VM 생성 — 시행착오

ISO 설치 VM 생성을 시도하였다. 옵션 끝의 `\`를 빠뜨리면서 불완전한 명령이 실행되는 실수를 반복하며 디스크가 쌓였다.

```bash
# 불완전 명령 실행으로 인해 디스크가 쌓인 상태
lvs | grep 102
#   vm-102-disk-0 pve Vwi-a-tz--  32.00g data  0.00
#   vm-102-disk-1 pve Vwi-a-tz--  32.00g data  0.00
#   vm-102-disk-2 pve Vwi-a-tz--  32.00g data  0.00
#   vm-102-disk-3 pve Vwi-a-tz--  32.00g data  0.00
```

`qm destroy`로 `.conf`를 삭제했어도, `.conf`에서 참조 해제된 LV는 스토리지에 남는다. 이것이 **고아 디스크(Orphan Disk)**다.

```bash
# 고아 LV 수동 삭제
# LV 이름에 하이픈(-)이 포함되면 lvremove 경로에서 --로 이스케이프됨에 주의
lvremove /dev/pve/vm-102-disk-0
lvremove /dev/pve/vm-102-disk-1
lvremove /dev/pve/vm-102-disk-2
# vm-102-disk-3은 102.conf에서 참조 중이므로 qm destroy 102로 같이 처리
qm destroy 102
```

최종적으로 정상 생성된 102.conf:

```bash
qm create 102 \
  --cores 1 \
  --memory 1024 \
  --balloon 0 \
  --cpu host \
  --ostype l26 \
  --agent enabled=1,fstrim_cloned_disks=1 \
  --scsi0 local-lvm:32,discard=on,iothread=1 \
  --scsihw virtio-scsi-single \
  --net0 virtio,bridge=vmbr0,firewall=1 \
  --serial0 socket

cat /etc/pve/qemu-server/102.conf
# agent: enabled=1,fstrim_cloned_disks=1
# balloon: 0
# boot: order=scsi0;net0
# cores: 1
# cpu: host
# memory: 1024
# net0: virtio=BC:24:11:81:4D:55,bridge=vmbr0,firewall=1
# scsi0: local-lvm:vm-102-disk-3,discard=on,iothread=1,size=32G
# scsihw: virtio-scsi-single
# serial0: socket
```

### 10.3 VM 시작 — KVM 오류 및 Nested VT-x 활성화

```bash
qm start 102
# KVM virtualisation configured, but not available.
# Either disable in VM configuration or enable in BIOS.
```

VirtualBox 위의 Proxmox는 기본적으로 Nested VT-x가 비활성화된 상태다. Windows 호스트 PowerShell에서:

```powershell
# Proxmox VM을 완전히 종료한 상태에서 실행
VBoxManage list vms
VBoxManage modifyvm "<Proxmox-VM-이름>" --nested-hw-virt on
```

Hyper-V가 활성화된 환경에서는 VirtualBox가 VT-x를 직접 사용할 수 없어 Nested VT-x도 동작하지 않는다. WSL2나 Docker Desktop을 사용 중이라면 이 제약이 있다.

```powershell
# Hyper-V 활성화 여부 확인
bcdedit /enum | findstr hypervisorlaunchtype
# hypervisorlaunchtype  Auto  → 활성화 상태

# Hyper-V 비활성화 (재부팅 필요)
bcdedit /set hypervisorlaunchtype off
# → Windows 재부팅 후 VirtualBox Nested VT-x 사용 가능
```

### 10.4 VirtIO NIC Hang 발생 및 원인 추적

Nested VT-x 활성화 후 `qm start 102`를 실행하면 Proxmox 호스트 전체가 Hang된다. SSH 터미널이 끊기고 Web UI에 접근 불가 상태가 된다.

**이진 탐색 디버깅:** 깡통 VM 999(`kvm: 0`로 TCG 강제)는 정상 동작하고, 디스크 옵션을 추가한 VM 998도 정상 동작했다. `.conf` 옵션을 하나씩 제거하며 범위를 좁혔다.

```bash
# NIC 제거 후 시작 테스트
qm set 102 --delete net0
qm start 102
# 정상 동작

# e1000으로 NIC 교체
qm set 102 --net0 e1000,bridge=vmbr0,firewall=1
qm start 102
# 정상 동작
```

원인 확정: VirtIO NIC(`net0: virtio,...`)의 VirtQueue 메모리 매핑이 VirtualBox 중첩 환경에서 충돌.

### 10.5 최종 VM 생성 — `dev-api-01` (VM 201)

```bash
qm create 201 \
  --name dev-api-01 \
  --cores 1 \
  --cpu host \
  --memory 1024 \
  --balloon 0 \
  --ostype l26 \
  --agent enabled=1,fstrim_cloned_disks=1 \
  --scsihw virtio-scsi-single \
  --scsi0 local-lvm:32,discard=on,iothread=1 \
  --net0 e1000,bridge=vmbr0,firewall=1 \
  --serial0 socket \
  --ide2 local:iso/ubuntu-24.04.4-live-server-amd64.iso,media=cdrom \
  --boot order=ide2
```

OS 설치 완료 후, ISO 마운트 제거 및 부팅 순서 변경:

```bash
qm stop 201
qm set 201 --delete ide2
qm set 201 --boot order=scsi0
qm start 201
```

게스트 내부에서 QEMU Guest Agent 설치:

```bash
# VM 201 내부 (Ubuntu 24.04)에서
apt update && apt install -y qemu-guest-agent
systemctl enable --now qemu-guest-agent
```

Guest Agent가 없으면 `journalctl -f`에서 아래 로그가 주기적으로 출력된다:

```log
pvescheduler[32744]: VM 201 qga command failed - VM 201 qga command 'guest-ping' failed - got timeout
```

### 10.6 설치 중 WebUI/SSH 끊김 현상

OS 설치 중 패키지 압축 해제나 파일시스템 포맷 구간에서 WebUI 연결이 끊기고 SSH 터미널이 멈추는 현상이 발생했다.

**원인:** TCG 모드 또는 KVM 환경에서 게스트 I/O가 집중되는 구간에 QEMU 프로세스가 CPU를 순간적으로 독점한다. 그 순간 Proxmox 호스트의 noVNC WebSocket 연결이 타임아웃으로 끊기는 것이다. VM 자체가 죽은 것이 아니라 콘솔 연결만 잠시 끊기는 것이므로, 수십 초 뒤에 다시 연결하면 설치가 진행 중인 것을 확인할 수 있다.

---

## 부록: 검증 체크리스트

```bash
# VM 설정 확인
qm config 201

# 프로세스 상태 확인
qm status 201
# status: running

# Guest Agent 통신 확인 (Agent 설치 후)
qm agent 201 ping
# 응답 없으면 에러, 응답 있으면 {result: null} 반환

# API로 IP 조회 (Guest Agent 필요)
curl -k -H "Authorization: PVEAPIToken=admin@pve!<token>=<uuid>" \
  https://127.0.0.1:8006/api2/json/nodes/kcy0122/qemu/201/agent/network-get-interfaces
```
