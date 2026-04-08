---
title: "가상 NIC 아키텍처와 VirtualBox Nested 환경 장애 분석"
date: 2026-04-08
lastmod: 2026-04-08
author: "Davi"
description: "VM에서 NIC가 수행하는 역할, 에뮬레이션과 준가상화의 차이, VirtIO NIC가 VirtualBox Nested 환경에서 Hang을 유발한 근본 원인을 분석하고, 디버깅 과정의 모든 시행착오를 복기한다."
slug: "nic-architecture-and-nested-virt-postmortem"

section: "notes"
category: "linux"
tags: [proxmox, qemu, kvm, virtio, e1000, nic, emulation, paravirtualization, nested-virtualization, virtualbox, postmortem, debugging]

order: 902
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 92

status: "active"
draft: false
search: true

toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 0. 이 문서의 배경

Proxmox VE 9.1을 Oracle VirtualBox 7.1.14 위에 설치하고, 내부에 QEMU/KVM VM을 생성하여 `qm start`를 실행하면 **Proxmox 호스트 전체가 Hang(무응답)** 되는 현상이 반복적으로 발생했다.

SSH 끊김, Web UI 접속 불가, 그러나 VirtualBox VM 자체는 `VMState="running"` 상태를 유지. VirtualBox 콘솔로 직접 접근하면 Proxmox 로그인 프롬프트가 정상 표시됨.

수 시간에 걸친 원인 추적 끝에, **QEMU VirtIO NIC 에뮬레이션**이 유일한 원인임을 확인하고 `e1000` NIC로 대체하여 해결했다.

이 문서는 이 사건을 통해 가상 NIC의 아키텍처를 근본부터 이해하고, 디버깅 과정에서 배제한 모든 가설을 복기하여 학습 자산으로 남긴다.

---

## 1. VM에서 NIC가 하는 역할

### 1.1 물리 세계의 NIC

물리 서버에 랜 케이블을 꽂으면, NIC(Network Interface Card)가 다음을 수행한다.

1. **패킷 송수신:** 네트워크 상의 전기/광 신호를 디지털 데이터(이더넷 프레임)로 변환하고, 반대 방향으로도 변환한다.
2. **MAC 주소 필터링:** 자신의 MAC 주소에 해당하는 프레임만 받아들인다.
3. **인터럽트(Interrupt) 발생:** 패킷이 도착하면 CPU에게 "처리할 데이터가 있다"고 알린다.
4. **DMA(Direct Memory Access):** 패킷 데이터를 CPU를 거치지 않고 직접 시스템 메모리에 쓴다.

OS 안의 **NIC 드라이버**는 이 하드웨어를 제어한다. 드라이버는 NIC의 레지스터(Register)에 값을 쓰고, 인터럽트를 처리하고, 커널 네트워크 스택에 패킷을 전달한다. 드라이버는 NIC 하드웨어의 종류에 따라 다르다. Intel 카드에는 Intel 드라이버, Realtek 카드에는 Realtek 드라이버.

### 1.2 가상 세계의 NIC

VM 안에는 물리 NIC가 없다. 대신 하이퍼바이저(Hypervisor)가 **가짜 NIC**를 만들어서 게스트 OS에게 제공한다. 게스트 OS는 이 가짜 NIC를 진짜 하드웨어라고 믿고, 해당 NIC에 맞는 드라이버를 로드하여 통신한다.

이 "가짜 NIC를 만드는 방식"에 따라 성능과 호환성이 크게 달라진다. 크게 두 가지 접근법이 있다.

---

## 2. 에뮬레이션(Emulation) vs 준가상화(Paravirtualization)

### 2.1 에뮬레이션 — "진짜 하드웨어인 척하기"

에뮬레이션이란, 실제 존재하는(했던) 물리 하드웨어의 **모든 동작을 소프트웨어로 재현**하는 것이다. QEMU가 "나는 Intel 82540EM 기가비트 이더넷 카드야"라고 가장하면, 게스트 OS는 일반적인 Intel e1000 드라이버를 로드하고, 이 드라이버가 하드웨어 레지스터에 값을 쓰면 QEMU가 그 쓰기를 가로채서(Trap) "진짜 하드웨어라면 이렇게 반응했을 것이다"를 계산하여 응답한다.

```text
[게스트 OS]
    │
    │  "Intel e1000 드라이버야, 레지스터 0x0008에 값을 써"
    ▼
[QEMU — e1000 에뮬레이션 코드]
    │
    │  "Intel 82540EM이 이 레지스터에 이 값을 받으면..."
    │  → 내부 상태 업데이트
    │  → 가상 인터럽트 발생
    │  → 패킷을 호스트 네트워크 스택으로 전달
    ▼
[호스트 네트워크 → 브릿지(vmbr0) → 물리 NIC → 외부]
```

**장점:** 게스트 OS가 "가상화 환경에서 돌고 있다"는 사실을 전혀 모른다. 수십 년 된 OS에도 Intel e1000 드라이버는 기본 탑재되어 있으므로, 별도 드라이버 설치 없이 바로 네트워크가 잡힌다. 호환성이 극도로 높다.

**단점:** 모든 하드웨어 레지스터 접근을 일일이 가로채서 소프트웨어로 처리하므로, **매 패킷마다 수많은 Trap(VM Exit)이 발생**한다. 이 Trap 하나하나가 컨텍스트 스위칭 비용이고, 이것이 쌓이면 네트워크 처리량(Throughput)이 떨어지고 CPU 사용률이 올라간다.

### 2.2 준가상화 — "가짜 하드웨어라는 걸 서로 알고 협력하기"

준가상화(Paravirtualization)는 게스트 OS가 **"나는 가상 머신 안에 있다"는 사실을 인지**하고, 하이퍼바이저와 직접 효율적으로 통신하는 방식이다. 실제 하드웨어를 흉내내는 대신, 가상화에 최적화된 **전용 인터페이스**를 정의하고 사용한다.

VirtIO가 바로 이 전용 인터페이스의 표준이다. VirtIO NIC는 "Intel 카드인 척"하지 않는다. 대신 "나는 VirtIO 네트워크 장치야"라고 솔직하게 선언하고, 게스트 OS에 VirtIO 드라이버가 있으면 그 드라이버가 VirtIO 프로토콜로 QEMU와 직접 통신한다.

```text
[게스트 OS]
    │
    │  "VirtIO 드라이버야, VirtQueue에 패킷을 넣어"
    ▼
[QEMU — VirtIO 백엔드]
    │
    │  공유 메모리(VirtQueue)에서 패킷을 직접 읽어감
    │  → Trap 최소화
    │  → 호스트 네트워크 스택으로 전달
    ▼
[호스트 네트워크 → 브릿지(vmbr0) → 물리 NIC → 외부]
```

**핵심 차이:** VirtIO는 **공유 메모리 기반의 링 버퍼(VirtQueue)**를 사용한다. 게스트가 패킷을 보내려면, 하드웨어 레지스터를 하나하나 건드리는 대신 공유 메모리의 링 버퍼에 패킷을 넣고 "알림"을 한 번만 보낸다. QEMU는 그 링 버퍼에서 패킷을 꺼내간다. Trap 횟수가 **극적으로 줄어든다.**

**장점:** 네트워크 성능이 에뮬레이션 대비 수 배 이상 높다. CPU 오버헤드도 훨씬 낮다.

**단점:** 게스트 OS에 VirtIO 드라이버가 있어야 한다. 현대 Linux 커널은 기본 탑재하지만, 아주 오래된 OS에는 없다.

---

## 3. Proxmox에서 선택 가능한 NIC 모델 총정리

| 모델            | 분류       | 에뮬레이션 대상      | 성능      | 호환성             | 비고                            |
| --------------- | ---------- | -------------------- | --------- | ------------------ | ------------------------------- |
| `virtio`        | 준가상화   | (실제 하드웨어 없음) | **최고**  | Linux/최신 Windows | 기본 권장값                     |
| `e1000`         | 에뮬레이션 | Intel 82540EM        | 좋음      | 거의 모든 OS       | **VirtualBox Nested 환경 권장** |
| `e1000e`        | 에뮬레이션 | Intel 82574L         | 좋음      | 최신 OS            | e1000의 개선판                  |
| `e1000-82540em` | 에뮬레이션 | Intel 82540EM        | 좋음      | 거의 모든 OS       | e1000과 동일                    |
| `e1000-82544gc` | 에뮬레이션 | Intel 82544GC        | 좋음      | 거의 모든 OS       | 서버용 변종                     |
| `e1000-82545em` | 에뮬레이션 | Intel 82545EM        | 좋음      | 거의 모든 OS       | 서버용 변종                     |
| `vmxnet3`       | 준가상화   | VMware 전용          | 좋음      | VMware 환경        | VMware에서 마이그레이션 시      |
| `rtl8139`       | 에뮬레이션 | Realtek 8139         | 낮음      | 아주 오래된 OS     | 100Mbps 한계. 사용 안 함        |
| `ne2k_pci`      | 에뮬레이션 | NE2000 PCI           | 매우 낮음 | DOS/초기 Linux     | 박물관 전시용                   |
| `ne2k_isa`      | 에뮬레이션 | NE2000 ISA           | 매우 낮음 | DOS                | 박물관 전시용                   |
| `i82551`        | 에뮬레이션 | Intel i82551         | 중간      | 레거시             | 잘 안 씀                        |
| `i82557b`       | 에뮬레이션 | Intel i82557B        | 중간      | 레거시             | 잘 안 씀                        |
| `i82559er`      | 에뮬레이션 | Intel i82559ER       | 중간      | 레거시             | 잘 안 씀                        |
| `pcnet`         | 에뮬레이션 | AMD PCnet            | 중간      | 레거시             | VirtualBox 기본 NIC와 동일 칩셋 |

### 3.1 "에뮬레이션"과 "네트워크"라는 표현의 차이

혼동하기 쉬운 부분이다.

**"NIC 에뮬레이션"** 은 QEMU가 게스트에게 보여주는 **가상 하드웨어의 종류**를 말한다. "이 VM에는 Intel e1000 카드가 꽂혀 있다"라고 속이는 것. 이것은 하드웨어 계층(Layer 1~2)의 이야기이다.

**"네트워크"** 는 그 가상 NIC가 **어디에 연결되는가**를 말한다. 브릿지(`vmbr0`)에 연결할지, NAT로 나갈지, 내부 네트워크에만 묶을지. 이것은 네트워크 토폴로지 계층(Layer 2~3)의 이야기이다.

`.conf` 파일에서 이 두 가지가 하나의 줄에 합쳐져 있다:

```yaml
net0: e1000=BC:24:11:8B:4E:C4,bridge=vmbr0,firewall=1
      ─────                    ────────────
      에뮬레이션 모델           네트워크 연결 대상
      (하드웨어 종류)           (토폴로지)
```

에뮬레이션 모델을 바꿔도 네트워크 연결은 동일하다. `e1000`이든 `virtio`이든 같은 `vmbr0` 브릿지에 물리면 같은 네트워크에 속한다. 바뀌는 건 **패킷이 게스트에서 호스트로 전달되는 메커니즘**이다.

---

## 4. 왜 VirtIO NIC가 VirtualBox Nested 환경에서 Hang을 유발했는가

### 4.1 아키텍처 스택 이해

우리 환경의 가상화 스택은 이렇게 생겼다:

```text
┌─────────────────────────────────────────┐
│  Layer 4: 게스트 OS (Debian)            │  ← VM 101/102 내부
│    └─ VirtIO/e1000 NIC 드라이버         │
├─────────────────────────────────────────┤
│  Layer 3: QEMU 프로세스                 │  ← Proxmox 안에서 실행
│    └─ VirtIO 백엔드 / e1000 에뮬레이터  │
├─────────────────────────────────────────┤
│  Layer 2: Proxmox (Debian + KVM)        │  ← VirtualBox 게스트
│    └─ KVM 커널 모듈                     │
├─────────────────────────────────────────┤
│  Layer 1: VirtualBox + VT-x             │  ← Windows 호스트에서 실행
│    └─ Nested VT-x 에뮬레이션            │
├─────────────────────────────────────────┤
│  Layer 0: Windows + 물리 CPU (VT-x)     │  ← 실제 하드웨어
└─────────────────────────────────────────┘
```

`qm start 101`을 치면, Layer 3에서 QEMU 프로세스가 생성된다. 이 QEMU는 Layer 2의 KVM을 통해 Layer 1의 VirtualBox에게 "Nested VT-x로 가상화를 한 단계 더 해줘"라고 요청한다. VirtualBox는 Layer 0의 물리 CPU VT-x를 이용하여 이 요청을 처리한다.

### 4.2 VirtIO의 VirtQueue와 메모리 매핑

VirtIO NIC는 게스트와 QEMU 사이에 **공유 메모리 영역(VirtQueue)**을 설정한다. 이 공유 메모리는:

1. 게스트의 물리 주소 공간(Guest Physical Address, GPA)에 매핑된다.
2. KVM이 이 GPA를 호스트의 가상 주소(Host Virtual Address, HVA)로 변환한다.
3. QEMU가 HVA를 통해 직접 접근한다.

정상 환경(베어메탈 Proxmox)에서는 이 매핑이 **2단계**이다:

```text
GPA → HPA (게스트 물리 → 호스트 물리)
     EPT(Extended Page Table)가 하드웨어로 처리
```

그런데 VirtualBox Nested 환경에서는 **3단계 이상**으로 뻥튀기된다:

```text
L2 GPA → L1 GPA → L0 HPA
(Debian VM)  (Proxmox VM)  (Windows 물리)

각 단계마다 주소 변환이 필요하고,
VirtualBox가 이것을 소프트웨어로 에뮬레이션
```

### 4.3 Hang의 메커니즘 — 논리적 추론

> **주의:** 이 섹션은 VirtualBox의 비공개 소스코드를 직접 분석한 것이 아니라, 관찰된 증상과 아키텍처 지식을 기반으로 한 **논리적 추론**이다.

VirtIO NIC가 초기화될 때, 다음이 발생한다:

1. **VirtQueue 메모리 영역을 설정한다.** 게스트 드라이버가 QEMU에게 "이 GPA 범위를 공유 메모리로 사용하겠다"고 알린다.
2. **MMIO(Memory-Mapped I/O) 영역을 등록한다.** VirtIO 장치의 제어 레지스터들이 메모리 주소에 매핑된다.
3. **이벤트 알림(eventfd/ioeventfd) 메커니즘을 설정한다.** 게스트가 특정 주소에 쓰기를 하면, KVM이 이를 감지하여 QEMU에게 알리는 고속 경로.

e1000 에뮬레이션은 전통적인 **포트 I/O(Port I/O)**와 **MMIO**를 사용하는데, 이것들은 하나하나가 명시적인 VM Exit(Trap)를 발생시킨다. VM Exit는 느리지만, VirtualBox의 Nested VT-x가 안정적으로 처리할 수 있는 **잘 정의된 이벤트**이다.

반면 VirtIO의 VirtQueue는 **공유 메모리 + 최소한의 알림**으로 동작한다. 이 과정에서:

- ioeventfd가 KVM 커널 모듈 내에서 직접 처리되는데, Nested 환경에서는 KVM 자체가 가상화된 상태이므로 ioeventfd 처리 경로가 비정상적으로 동작할 수 있다.
- VirtQueue의 메모리 매핑이 3단계 주소 변환을 거치면서, VirtualBox의 메모리 관리 코드에서 교착 상태(Deadlock) 또는 무한 루프(Infinite Loop)에 빠질 수 있다.

**결과:** Proxmox(Layer 2)의 CPU가 VirtualBox 내부의 메모리 관리 코드에 갇혀서 빠져나오지 못한다. Proxmox 커널이 Panic한 것이 아니라, CPU 자원을 VirtualBox가 독점하면서 **Proxmox가 아무 작업도 처리하지 못하는 상태**가 된다.

### 4.4 왜 e1000은 괜찮은가

e1000 에뮬레이션은 VirtQueue를 사용하지 않는다. 모든 패킷이 전통적인 MMIO + 인터럽트 경로를 통해 전달된다. 이 경로는:

- 매 레지스터 접근마다 명시적 VM Exit가 발생한다.
- VM Exit는 VirtualBox의 Nested VT-x 구현에서 가장 잘 테스트된 코드 경로이다.
- 공유 메모리 기반의 복잡한 주소 매핑이 필요 없다.

느리지만 안전하다. 네트워크 성능에서 손해를 보지만, 시스템이 Hang되지 않는다.

### 4.5 왜 콘솔에서는 로그인 화면이 보였는가

이것은 매우 중요한 관찰이었다. VirtualBox GUI 콘솔로 Proxmox에 접속했을 때 로그인 프롬프트가 정상 표시되었다.

이것이 뜻하는 바:

- **Proxmox 커널은 죽지 않았다.** 커널 패닉이 발생했다면 패닉 메시지가 콘솔에 표시되었을 것이다.
- **VirtualBox의 콘솔 출력 경로는 살아 있었다.** VirtualBox가 Proxmox VM의 프레임버퍼를 렌더링하는 코드는 정상 동작했다.
- **CPU가 특정 코드에 갇혀 있었다.** Proxmox의 모든 vCPU가 QEMU의 VirtIO 초기화 경로에서 빠져나오지 못해, 다른 작업(SSH 응답, Web UI 처리)을 스케줄링할 수 없었다.

VirtualBox 콘솔은 VirtualBox 프로세스 자체의 렌더링 스레드에서 처리되므로, Proxmox 내부의 CPU 상태와 무관하게 **마지막으로 렌더링된 화면**이 계속 표시되었다. 그리고 VirtualBox 콘솔에서 키보드 입력이 가능했던 것은, 로그인 프롬프트를 렌더링하는 `getty` 프로세스가 QEMU VirtIO 코드에 갇히기 **직전에** 이미 화면을 그려놓았고, CPU가 간헐적으로 빠져나올 수 있는 순간에 입력을 받았을 수 있다.

---

## 5. 디버깅 과정 복기 — 모든 가설과 그 결과

### 5.1 시간순 가설 목록

| #   | 가설                            | 조치                                         | 결과                                    | 원인이었나?                                                             |
| --- | ------------------------------- | -------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Hyper-V와 VirtualBox의 충돌     | Hyper-V 비활성화, `hypervisorlaunchtype off` | Nested VT-x 활성화 가능해짐             | **아니오.** Hyper-V는 VirtualBox 실행 자체를 방해했을 뿐, Hang과는 무관 |
| 2   | Nested VT-x 미활성화            | `--nested-hw-virt on`                        | KVM 사용 가능해짐                       | **아니오.** 전제 조건이었을 뿐, 활성화해도 Hang 발생                    |
| 3   | 메모리 부족 (OOM)               | VM RAM 2048→1024, 호스트 RAM 6G→8G           | Hang 계속 발생, `dmesg`에 OOM 기록 없음 | **아니오.** `free -h`에서 6.2GB 여유 확인                               |
| 4   | CPU 과다 할당                   | VirtualBox CPU 4→2                           | Hang 계속 발생                          | **아니오.**                                                             |
| 5   | KVM 하드웨어 가속 자체의 문제   | `kvm: 0` (소프트웨어 에뮬레이션)             | Hang 계속 발생                          | **아니오.** KVM 꺼도 뻗음                                               |
| 6   | `cpu: host` 옵션                | `cpu: kvm64`로 변경                          | Hang 계속 발생                          | **아니오.**                                                             |
| 7   | Nested VT-x 활성 상태 자체      | `--nested-hw-virt off`                       | Hang 계속 발생                          | **아니오.**                                                             |
| 8   | QEMU 프로세스 기동 자체         | 디스크 없는 깡통 VM(999) 생성/시작           | 정상 동작                               | — (QEMU 자체는 무죄)                                                    |
| 9   | LVM-thin 디스크                 | 999에 디스크 추가 후 시작                    | 정상 동작                               | **아니오.**                                                             |
| 10  | 디스크 크기 (32GB)              | 102 디스크 32G→4G                            | Hang 발생                               | **아니오.**                                                             |
| 11  | 디스크 옵션 (discard, iothread) | 102에서 옵션 제거                            | Hang 발생                               | **아니오.**                                                             |
| 12  | **VirtIO NIC (net0: virtio)**   | **102에서 net0 삭제**                        | **정상 동작**                           | **예!!! 유일한 원인**                                                   |

### 5.2 확정 검증

| 테스트         | net0             | 결과     |
| -------------- | ---------------- | -------- |
| net0 삭제      | 없음             | 정상     |
| `net0: e1000`  | e1000 에뮬레이션 | 정상     |
| `net0: virtio` | VirtIO 준가상화  | **Hang** |

### 5.3 왜 다른 가설들은 원인이 아니었나

**가설 1~2 (Hyper-V, Nested VT-x):** 이것들은 **환경을 구성하기 위한 전제 조건**이었다. Hyper-V를 끄는 것은 VirtualBox가 VT-x를 직접 사용할 수 있게 하기 위함이고, Nested VT-x를 켜는 것은 KVM이 동작할 수 있게 하기 위함이다. 이것들은 "QEMU를 실행할 수 있는 환경을 만드는" 단계이지, Hang의 원인과는 무관했다.

**가설 3 (메모리 부족):** 첫 번째 Hang은 실제로 메모리 부족이었을 수 있다 (6GB 호스트에 2GB VM). 하지만 호스트를 8GB로 올린 후에도 Hang이 발생했고, `free -h`에서 6.2GB 여유가 확인되었으며, `dmesg`에 OOM 기록이 없었다. 메모리는 첫 번째 사건의 **동시 발생 요인(Contributing Factor)**이었을 뿐, 근본 원인(Root Cause)은 아니었다.

**가설 4 (CPU 과다 할당):** 2코어/4논리 프로세서 호스트에 VirtualBox 4 vCPU를 할당하면 Windows가 느려질 수 있지만, VirtualBox VM 내부의 Proxmox가 Hang되는 원인이 되지는 않는다. CPU 기아(Starvation)가 발생하면 느려지지 SSH가 끊기는 게 아니다.

**가설 5~7 (KVM, cpu type, Nested VT-x):** 이것들은 QEMU의 **CPU 가상화 경로**에 영향을 준다. 하지만 원인은 CPU 가상화가 아니라 **NIC 가상화**였다. KVM을 끄고 소프트웨어 에뮬레이션(TCG)으로 돌려도 VirtIO NIC의 VirtQueue 메모리 매핑은 동일하게 수행되므로 Hang이 발생했다. 이 사실은 "CPU 가상화 방식과 무관하게, VirtIO NIC 초기화 자체가 문제다"는 것을 강하게 시사한다.

**가설 8~11 (QEMU, 디스크):** 깡통 VM(999)이 정상 동작한 것은 "QEMU 프로세스의 기동과 디스크 I/O는 문제없다"는 것을 증명했다. 디스크 크기와 옵션을 바꿔도 Hang이 발생한 것은 디스크 쪽이 무관하다는 것을 증명했다.

### 5.4 디버깅 방법론에 대한 반성

돌이켜보면, **변수 격리(Variable Isolation)**를 더 일찍 했어야 했다. 첫 Hang 발생 시 "QEMU가 뻗었다"는 증상에서 곧바로 KVM, CPU, 메모리 등 "무거운" 변수들을 의심했지만, 실제로는 `.conf` 파일의 각 옵션을 하나씩 제거하면서 **최소 재현 조건(Minimum Reproducible Case)**을 찾는 것이 더 효율적이었다.

998(깡통 VM)과 102의 차이를 줄여나가는 방식은 교과서적인 **이진 탐색(Binary Search) 디버깅**이었고, 이 방법이 결국 답을 줬다.

---

## 6. 최종 환경 구성

### 6.1 VirtualBox Nested 환경의 제약사항

| 항목                        | 사용 가능 | 비고                                        |
| --------------------------- | --------- | ------------------------------------------- |
| KVM 하드웨어 가속           | OK        | `kvm: 1`                                    |
| `cpu: host`                 | OK        | 호스트 CPU 기능 패스스루                    |
| Nested VT-x                 | OK        | `--nested-hw-virt on`                       |
| VirtIO 디스크 (virtio-scsi) | OK        | `scsihw: virtio-scsi-single` + `iothread=1` |
| VirtIO NIC                  | disabled  | **Hang 유발. e1000으로 대체 필수**          |

### 6.2 권장 VM 생성 명령어

```bash
qm create <VMID> \
  --name <이름> \
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
  --ide2 local:iso/<ISO파일>,media=cdrom \
  --boot order=ide2
```

### 6.3 OS 설치 후 변경사항

```bash
# ISO 제거 + 부팅 순서 변경
qm set <VMID> --ide2 none,media=cdrom --boot order=scsi0

# 게스트 내부에서
apt install -y qemu-guest-agent
systemctl enable qemu-guest-agent
```

---

## 7. 베어메탈 환경으로 이전 시 복원할 항목

나중에 VirtualBox를 벗어나 물리 서버에 직접 Proxmox를 설치(Bare Metal)하면, 이 문서의 제약사항은 모두 해제된다.

```bash
# 베어메탈에서는 VirtIO NIC 사용 (최고 성능)
qm set <VMID> --net0 virtio,bridge=vmbr0,firewall=1
```

VirtIO NIC 자체가 문제인 것이 아니라, **VirtualBox의 Nested 가상화 환경에서 VirtIO NIC의 메모리 매핑 경로가 문제**였음을 기억하라. 베어메탈에서는 VirtIO가 정상적이고, 성능도 e1000 대비 월등히 우수하다.

---

## 부록: 출처 및 참고 자료

| 주제                      | URL                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------ |
| VirtIO 공식 사양          | https://docs.oasis-open.org/virtio/virtio/v1.2/virtio-v1.2.html                      |
| QEMU NIC 에뮬레이션 문서  | https://www.qemu.org/docs/master/system/devices/net.html                             |
| KVM Nested Virtualization | https://www.linux-kvm.org/page/Nested_Guests                                         |
| VirtualBox Nested VT-x    | https://docs.oracle.com/en/virtualization/virtualbox/7.1/user-guide/nested-virt.html |
| Proxmox NIC 모델 설정     | https://pve.proxmox.com/pve-docs/qm.conf.5.html                                      |
| VirtIO 아키텍처 해설      | https://www.redhat.com/en/blog/virtio-networking-first-series                        |
| Intel e1000 드라이버 소스 | https://github.com/qemu/qemu/tree/master/hw/net                                      |
