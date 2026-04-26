---
title: "05. 네트워크 정찰 — 4평면 구성과 계층별 트래픽 해부"
date: 2026-04-25
lastmod: 2026-04-25
author: "Davi"
description: "5노드 Proxmox 클러스터의 물리 NIC, bridge, 4개 평면(mgmt/corosync0/corosync1+storage/vm), VM 네트워크 결선, CMP 요청 라우팅, iSCSI/NFS/Corosync 트래픽 분포를 해부한다. 챕터 01·03에서 이월된 네트워크 관련 인계 항목을 여기서 해소한다."
slug: "network-reconnaissance"
section: "notes"
category: "linux/proxmox/cmp-test"
tags: [proxmox, network, bridge, vmbr, corosync, iscsi, nfs, arp, cmp]
order: 5
series: "CMP Pre-Test Reconnaissance Handbook"
series_order: 5
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1.1"
---

## 0. 이 챕터의 정찰 목적

네트워크는 다른 모든 계층의 기반이다. 챕터 01의 클러스터 정족수, 챕터 03의 디스크 I/O, 챕터 06에서 다룰 VM 연결성 — 이 모든 계층의 이상 신호의 **근본 원인이 네트워크 계층에 있을 가능성이 높다**. 본 챕터는 이를 해부하여 각 계층의 이상이 네트워크에서 기인한 것인지 아닌지를 분리할 수 있게 한다.

본 환경은 4개 평면을 명시적으로 분리한다.

| 평면                  | 대역            | Linux 인터페이스             | 주 트래픽                                         |
| --------------------- | --------------- | ---------------------------- | ------------------------------------------------- |
| **mgmt**              | `10.99.10.0/24` | `vmbr0`                      | Web UI(8006), SSH, DNS, 외부 게이트웨이           |
| **corosync0**         | `10.99.20.0/24` | `enp4s0` (직결, bridge 없음) | Corosync ring0                                    |
| **corosync1+storage** | `10.99.30.0/24` | `vmbr2`                      | Corosync ring1, iSCSI(3260), NFS(2049) — **공유** |
| **vm**                | `10.99.40.0/24` | `vmbr1`                      | VM 게스트 트래픽, PBS                             |

이 분리 설계 자체는 건전하다. 그러나 **실제 동작이 설계와 일치하는가**는 별개 질문이다. 본 챕터에서 그 일치성을 검증한다.

### 0.1 이 챕터에서 정정되는 이전 챕터의 기록

**[정정 1 — MTU]** 챕터 01에서 작성자가 "점보 프레임(MTU 9000) 미사용, MTU 1397" 으로 기록했으나, 본 챕터 §2.2의 `ip -d link show`에서 **5노드 모든 bridge와 물리 NIC이 MTU 1500 (표준값)**임이 확인되었다. 챕터 01의 1397 수치는 작성자의 단순 착각 또는 타이핑 오류로 추정. 본 챕터에서 **MTU 1500으로 사실 확정**한다.

**[정정 2 — CMP 요청 분산]** 챕터 02 §2.6에서 CMP가 "5노드 분산 구조"로 결론내린 것은 **가동 측면만의 사실**이었다. 본 챕터 §2.7에서 확인되는 것은 **실제 테스터 요청이 nd01에만 집중**된다는 것이다. nd01은 9개 ESTAB 연결을, 나머지 4노드는 각 1개(자기 자신 포함) 연결만 가지고 있다. "5노드에 cmp.jar가 모두 돈다"는 사실과 "5노드가 트래픽을 분산 처리한다"는 사실은 별개임을 본 챕터가 드러낸다.

**[정정 3 — nd07 storage 평면]** 챕터 03 §2.7.4에서 "nd07은 현재 mgmt 평면(`10.99.10.17`)만 확인됨"으로 기록했으나, 본 챕터 §2.9의 ARP 테이블에서 **`10.99.30.17` (nd07 storage 평면 IP)가 REACHABLE 상태**로 확인된다. 즉 nd07은 이미 storage 평면에도 IP를 가지고 있으며, 다만 **PVE의 NFS 마운트가 여전히 mgmt 경로를 사용**하는 것이 현 상태다. 평면 자체는 준비되어 있고 마운트 경로의 이전만 남아있다 — 정비 난이도가 낮아진다.

### 0.2 본 챕터가 해소하는 미결 항목

| 출처           | 항목                                           | 본 챕터 §          |
| -------------- | ---------------------------------------------- | ------------------ |
| 챕터 00 §2.3   | Corosync ring1 + storage 평면 공유의 실질 위험 | §3.2 #7            |
| 챕터 00 §2.7   | nd01 사용자 집중 추정 ("jump host 정황")       | §2.7 — 사실 확인   |
| 챕터 01 §1.4   | MTU 값 재확인                                  | §0.1 정정          |
| 챕터 02 §2.6   | CMP 5노드 요청 라우팅 메커니즘                 | §2.7 — nd01 집중   |
| 챕터 03 §2.1.2 | nd03 iSCSI 부분 연결 원인                      | §2.10 iSCSI 세션   |
| 챕터 03 §2.7.3 | NFS 평면 혼용의 정량 영향                      | §2.11 rx_drop 분석 |
| 챕터 03 §2.7.4 | nd07 storage 평면 IP 존재 여부                 | §0.1 정정          |

---

## 1. 개념 — 본 챕터 이해에 필요한 최소 배경

### 1.1 Linux bridge와 Proxmox의 bridge 사용 관행

Linux bridge(`bridge` 커널 모듈)는 가상 이더넷 스위치다. 여러 인터페이스를 하나의 브로드캐스트 도메인으로 묶는다. Proxmox는 기본적으로 **`vmbr0`, `vmbr1`, `vmbr2` ...** 형태의 bridge를 생성하여 다음 두 가지 목적에 쓴다.

1. **호스트의 네트워크 인터페이스 역할**: 호스트가 bridge에 IP를 부여하면, 그 IP로 호스트가 통신한다. 본 환경의 vmbr0~vmbr2 모두가 이 역할을 한다(각각 `.10.X`, `.30.X`, `.40.X` IP 보유).
2. **VM 가상 NIC의 연결 지점**: QEMU가 VM을 만들 때 `tap` 인터페이스를 bridge에 연결하면, VM이 bridge 대역의 다른 장비와 2계층 통신 가능.

본 환경에서 bridge 멤버(bridge-ports 지정 인터페이스)는 다음과 같다.

```markdown
vmbr0  ← enp13s0 (nd03은 enp12s0)  — mgmt 평면
vmbr1  ← enp3s0                     — vm 평면
vmbr2  ← enp10s0 (nd03은 enp9s0)   — corosync1+storage 평면
```

**`enp4s0`은 bridge에 속하지 않는다** — corosync0 전용 인터페이스. 이 설계는 권장 사항과 일치한다 — corosync는 latency에 민감하므로 bridge를 거치지 않고 물리 NIC에 IP를 직접 부여하면 처리 오버헤드가 감소.

### 1.2 Proxmox의 Firewall Bridge 구조 (fwbr/fwpr/fwln/tap)

VM이 bridge에 연결되는 방식은 **Firewall 활성 여부**에 따라 두 가지 형태를 취한다.

**형태 A — Firewall 비활성 (직결):**

```markdown
VM(tap100i0) ───── vmbr1 ───── enp3s0
```

가장 단순. `tap100i0`가 `vmbr1`에 직접 연결.

**형태 B — Firewall 활성 (fwbr 래핑):**

```markdown
VM(tap100i0) ── fwbr100i0 ── fwln100i0 ──(veth pair)── fwpr100p0 ── vmbr1 ── enp3s0
```

`fwbr*`는 VM-별 소형 bridge. `fwln*`과 `fwpr*`은 veth pair(가상 이더넷 쌍). 이 래핑 구조를 만들어 VM 트래픽에 **iptables 규칙(PVE firewall)**을 적용할 수 있게 한다. VM 개별 firewall 규칙은 이 fwbr 단계에서 걸린다.

본 환경에서는 **대부분의 VM이 형태 B로 fwbr 래핑**되어 있다. PVE firewall 서비스 자체는 `disabled` 상태이지만(§2.14), fwbr 구조는 미리 구축되어 있어 언제든 firewall을 활성화할 수 있다.

**예외**: nd05에서 관찰되는 `tap100004i1`은 **fwbr 없이 `vmbr0`에 직결**되어 있다(§2.5). 이는 VM 100004의 두 번째 NIC가 firewall 래핑을 거치지 않도록 의도적으로 구성되었거나, 실수로 wrap이 빠진 상태다. 후자라면 정비 대상.

### 1.3 rx_drop의 해석 — corosync multicast의 영향

`/sys/class/net/*/statistics/rx_dropped`는 **커널이 수신했지만 처리하지 않고 drop한 패킷 수**를 누적한다. rx_err와는 다르다 — rx_err는 하드웨어 또는 프로토콜 레벨 오류이고, rx_drop은 정상 수신되었으나 스택 위로 올리지 않기로 결정된 패킷.

rx_drop의 주요 발생 원인:

1. **내가 관심 없는 멀티캐스트/브로드캐스트**: 같은 L2 도메인의 다른 장비가 보낸 패킷을 수신했으나 호스트에서 처리할 이유가 없는 경우
2. **수신 버퍼 오버플로우**: NIC 링 버퍼 포화 (고트래픽 환경)
3. **VLAN 태그 불일치**: 기대하지 않은 VLAN ID로 들어오는 패킷

본 환경의 `enp10s0` (vmbr2 = corosync1+storage 평면)에서 **5노드 대량 rx_drop**이 관찰된다(§2.11). 이는 원인 1로 해석된다 — **corosync ring1의 multicast 트래픽이 storage 평면에 섞여 있고, 대부분의 경우 호스트가 이를 수신하지만 처리할 필요가 없어 drop**. 즉 rx_drop 자체는 장애 신호가 아니지만, **평면 공유의 부작용이 수치로 드러나는 증거**다.

### 1.4 ARP 상태 — REACHABLE / STALE / DELAY / FAILED

`ip neigh show`의 마지막 컬럼이 ARP 상태를 나타낸다. 해석은 다음과 같다.

| 상태        | 의미                           | 판독                                                           |
| ----------- | ------------------------------ | -------------------------------------------------------------- |
| `REACHABLE` | 최근 통신 확인됨               | 정상                                                           |
| `STALE`     | 엔트리는 있으나 최근 통신 없음 | 정상 (재사용 시 REACHABLE로 전환)                              |
| `DELAY`     | 새 패킷 보내는 중, 응답 대기   | 정상 (일시적)                                                  |
| `PROBE`     | ARP request 재전송 중          | 응답 없는 상태가 지속되면 FAILED로                             |
| `FAILED`    | ARP 응답 없음                  | **이상 신호** — 해당 IP 미응답, IP 자체가 존재하지 않거나 다운 |

특히 `FAILED` 상태가 관찰된 이웃은 해당 IP가 **더 이상 존재하지 않거나 물리적으로 연결이 끊긴** 상태를 의미한다. 본 환경에서 nd01의 ARP에 `10.99.20.16 FAILED`(nd06의 corosync 평면)가 관찰되는데(§2.9), 이는 **TrueNAS가 과거 corosync 평면에 IP를 가졌다가 현재는 없는 상태**를 시사. 설정 잔재일 가능성.

### 1.5 Corosync ring의 multicast vs unicast

Corosync는 기본 설정에서 클러스터 멤버십과 totem protocol 메시지를 **UDP multicast**(주소 `239.192.0.*` 대역)로 전송한다. 본 환경의 Corosync 평면 2개(ring0/enp4s0 직결, ring1/vmbr2)는 모두 이 multicast 트래픽을 운반한다.

multicast 트래픽이 `vmbr2`(storage 평면 공유)에 흐르면, 같은 bridge에 있는 모든 장비(5노드 + TrueNAS)가 이 패킷을 수신한다. TrueNAS는 multicast를 처리하지 않으므로 무시하지만, **5노드 각각의 NIC는 multicast 수신 후 커널에서 drop**한다. 이것이 §2.11의 대량 rx_drop의 원인.

### 1.6 "Jump host" 정황의 의미

**Jump host**(bastion host)는 네트워크 외부에서 내부로 접근할 때 거치는 단일 진입점 서버를 의미한다. 본 환경에서 5노드 중 nd01이 유독 외부 트래픽을 많이 받는다면, nd01이 실질적으로 테스터들의 jump host 역할을 하는 것이다. 챕터 00 §2.7에서 "nd01 사용자 집중 추정"으로 기록된 정황이 본 챕터 §2.7에서 확정된다 — 테스터들이 모두 nd01의 CMP(`:18080`)에 접속.

### 1.7 PCI 이름 규칙 차이 — `enpXsY`의 의미

Linux 5.x+ 커널의 NIC 이름 `enpXsY` 패턴은 다음을 의미.

- `en`: Ethernet
- `p{X}`: PCI 버스 번호
- `s{Y}`: PCI 슬롯 번호

본 환경의 5노드는 동일 하드웨어인데 **nd03만 `enp9s0`, `enp12s0`**이고 다른 4노드는 `enp10s0`, `enp13s0`이다. 이는 **nd03의 PCI 슬롯 배치가 다른 노드와 미묘하게 다름**을 시사. 가능한 원인:

1. 메인보드 BIOS의 PCIe 슬롯 재배열(UEFI fw에서 `Above 4G Decoding` 같은 옵션 차이)
2. 부팅 시 PCI enumeration 순서가 달라짐(커널 argument 차이)
3. NIC 추가 카드(PCIe 확장)가 nd03에만 다르게 꽂혀 있음

본 데이터만으로는 원인 확정 불가. 그러나 **역할은 동일** — nd03의 `enp9s0`가 다른 노드의 `enp10s0`와 같은 역할(vmbr2 멤버), `enp12s0`가 다른 노드의 `enp13s0`와 같은 역할(vmbr0 멤버). 원인은 운영팀 확인 과제로 남긴다.

---

## 2. 정찰 명령과 출력 해석

데이터 수집: 2026-04-24 오후. 5노드 동시 수집.

### 2.1 IP 주소 분포 — 4평면 확정

`ip -br addr` 결과의 IP만 추출.

| 노드 | mgmt (vmbr0) | corosync0 (enp4s0) | corosync1+storage (vmbr2) | vm (vmbr1)  |
| ---- | ------------ | ------------------ | ------------------------- | ----------- |
| nd01 | 10.99.10.11  | 10.99.20.11        | 10.99.30.11               | 10.99.40.11 |
| nd02 | 10.99.10.12  | 10.99.20.12        | 10.99.30.12               | 10.99.40.12 |
| nd03 | 10.99.10.13  | 10.99.20.13        | 10.99.30.13               | 10.99.40.13 |
| nd04 | 10.99.10.14  | 10.99.20.14        | 10.99.30.14               | 10.99.40.14 |
| nd05 | 10.99.10.15  | 10.99.20.15        | 10.99.30.15               | 10.99.40.15 |

**완벽한 일관성**. 5노드 × 4평면 = 20개 IP가 마지막 옥텟만 다르고 나머지는 모두 규칙적.

추가 IP (외부 인프라):

| IP             | 역할                                   | 평면               |
| -------------- | -------------------------------------- | ------------------ |
| `10.99.10.1`   | 게이트웨이                             | mgmt (default via) |
| `10.99.10.16`  | TrueNAS nd06 mgmt                      | mgmt               |
| `10.99.30.16`  | TrueNAS nd06 storage                   | storage            |
| `10.99.10.17`  | TrueNAS nd07 mgmt (2026-04-24 추가)    | mgmt               |
| `10.99.30.17`  | TrueNAS nd07 storage (2026-04-24 추가) | storage            |
| `10.99.40.100` | PBS                                    | vm                 |

### 2.2 MTU — 5노드 전 인터페이스 표준 1500

`ip -d link show`의 MTU 값 검증.

```markdown
vmbr0, vmbr1, vmbr2: MTU 1500
enp3s0, enp4s0, enp10s0/enp9s0, enp13s0/enp12s0: MTU 1500
```

5노드 × 7 인터페이스 = 35개 모두 **MTU 1500**.

**해석**: 점보 프레임(MTU 9000) 미사용. 1Gbps~2.5Gbps 구간에서는 점보 프레임의 효과가 제한적이므로 기본 MTU로 운영. 10Gbps 이상 환경이라면 점보 프레임이 CPU 부담을 유의미하게 줄이지만, 본 환경은 그 임계에 도달하지 않음.

챕터 01 §1.4의 "MTU 1397" 기록은 착오. 본 챕터에서 **1500으로 확정**.

### 2.3 NIC 링크 속도 — 🔴 **nd02 storage 평면 100Mbps 이상치**

5노드 물리 NIC 속도 매트릭스 (`ethtool`).

| NIC                 | 역할                  | nd01         | nd02           | nd03     | nd04     | nd05     |
| ------------------- | --------------------- | ------------ | -------------- | -------- | -------- | -------- |
| `enp3s0`            | vmbr1 (vm)            | 1 Gbps       | 1 Gbps         | 1 Gbps   | 1 Gbps   | 1 Gbps   |
| `enp4s0`            | corosync0             | 2.5 Gbps     | 2.5 Gbps       | 2.5 Gbps | 2.5 Gbps | 2.5 Gbps |
| `enp10s0`/`enp9s0`  | vmbr2 (ring1+storage) | **2.5 Gbps** | **100 Mbps** ⚠️| 2.5 Gbps | 2.5 Gbps | 2.5 Gbps |
| `enp13s0`/`enp12s0` | vmbr0 (mgmt)          | 1 Gbps       | 1 Gbps         | 1 Gbps   | 1 Gbps   | 1 Gbps   |

**치명적 발견**: **nd02의 `enp10s0`이 100 Mbps로 negotiate됨**. 다른 4노드의 같은 역할 NIC은 2.5 Gbps. **실효 속도는 1/25**.

이 NIC이 운반하는 트래픽:

1. **iSCSI** (TrueNAS → PVE 블록 I/O) — 3260 포트
2. **NFS** (TrueNAS → PVE 파일 I/O) — 2049 포트
3. **Corosync ring1** (클러스터 멤버십 보조)

100 Mbps 상태에서 iSCSI/NFS 대용량 전송이 발생하면 링크 포화, corosync ring1 지연 → ring 전환 또는 동기 실패 가능.

**추정 원인**:

1. **LAN 케이블 불량 또는 CAT5e 이하**: 2.5 Gbps는 CAT5e도 가능하나 케이블 품질 저하 시 100 Mbps로 fallback
2. **스위치 포트 설정**: 해당 포트만 `speed 100 forced` 설정
3. **NIC auto-negotiation 실패**: r8169 드라이버의 알려진 문제(간헐적 재negotiation 실패)

**격자 평가**: 케이블 교체·포트 변경·NIC 재시작은 L3×R2 (단일 노드 네트워크 일시 단절). 정비 시 반드시 운영팀 합의.

**STN 전 반드시 해결**: 100 Mbps 링크 상태에서 다노드 동시 VM 기동·마이그레이션 테스트를 수행하면 결과 해석이 불가능해진다. 챕터 08(위험 매트릭스) 우선순위 1.

#### 2.3.1 NIC 드라이버 — 5노드 모두 `r8169`

```markdown
driver: r8169 (5노드 × 4 NIC = 20개 NIC 전체)
```

모든 NIC가 Realtek r8169 드라이버. 데스크톱급 NIC (Realtek RTL8125 계열 — B850 메인보드 내장). Intel i350/X550이나 Mellanox ConnectX 같은 서버급 NIC가 아님.

실무적 영향:

- r8169는 2.5 Gbps 구간에서는 안정적이나, 10 Gbps 이상은 지원 안 함
- 간헐적 auto-negotiation 이슈 보고가 리눅스 커널 메일링리스트에 있음
- 현 환경에서는 **nd02의 100 Mbps가 이 드라이버 특성과 관련있을 가능성**

#### 2.3.2 WiFi NIC — 5노드 모두 DOWN

`wlp11s0` (nd03) / `wlp12s0` (기타 4노드) — driver: `rtw89_8922ae` (WiFi 7, RTL8922AE). 5노드 모두 DOWN 상태 + "no carrier". B850 AORUS WIFI7 메인보드의 내장 WiFi NIC으로, 서버 환경에서 사용 안 함. 정상.

### 2.4 Bridge 구성 — bridge-ports 매핑과 STP 상태

`/etc/network/interfaces`의 bridge 정의 (5노드 공통 패턴, nd03만 인터페이스 이름 차이).

```markdown
auto vmbr0          # mgmt
iface vmbr0 inet static
        address 10.99.10.{11..15}/24
        gateway 10.99.10.1
        bridge-ports enp13s0   # nd03: enp12s0
        bridge-stp off
        bridge-fd 0
#mgmt

auto vmbr1          # vm
iface vmbr1 inet static
        address 10.99.40.{11..15}/24
        bridge-ports enp3s0
        bridge-stp off
        bridge-fd 0
#vm

auto vmbr2          # storage
iface vmbr2 inet static
        address 10.99.30.{11..15}/24
        bridge-ports enp10s0   # nd03: enp9s0
        bridge-stp off
        bridge-fd 0
#storage
```

**설계자가 주석(`#mgmt`, `#vm`, `#storage`, `#corosync`)으로 평면 역할을 명시**. 의도적으로 4평면을 분리한 설계임이 확인된다.

**bridge-stp off**: Spanning Tree Protocol 비활성. 단일 링크 환경(루프 없음)에서는 불필요, 정상. 단 향후 네트워크 이중화 도입 시 STP 활성 필요.

**bridge-fd 0**: Forwarding Delay 0. bridge 포트 활성화 지연 없음 — STP off와 함께 빠른 링크 업.

### 2.5 Bridge 멤버 — VM 트래픽의 실제 평면

`brctl show` 결과에서 각 bridge에 붙은 VM tap 인터페이스 매트릭스.

#### nd01

```markdown
vmbr0 ← enp13s0 (VM 없음)
vmbr1 ← enp3s0, fwpr100002p0, fwpr100p0, fwpr102p0
   VM: 100002, 100, 102 (모두 정상 fwbr 래핑)
vmbr2 ← enp10s0, fwpr100p1
   VM: 100 (PBS) NIC1만 — 의도된 백업 트래픽 분리
```

✓ 정상. VM들이 vm 평면(vmbr1)에, PBS의 백업 NIC만 storage 평면(vmbr2)에.

#### nd02 — ⚠️ VM 112가 mgmt 평면

```markdown
vmbr0 ← enp13s0, fwpr112p0   ⚠️ VM 112가 mgmt 평면에 연결
vmbr1 ← enp3s0, fwpr700p0
   VM: 700
vmbr2 ← enp10s0 (VM 없음)
```

**이상**: VM 112의 NIC이 `vmbr0` (mgmt 평면)에. 챕터 02 §2.5에서 3일간 61.6% CPU 점유한 원인 미상 VM — 이 VM이 mgmt 평면 트래픽을 유발하고 있다면 **Web UI 및 CMP API 응답에 영향**을 줄 수 있다. VM 112의 작업 유형 추적 필요 (챕터 06 인계).

#### nd03 — 🔴 데이터 부족 (수집 명령의 버그)

```markdown
vmbr0 ← enp12s0 (VM 없음)
  (vmbr1, vmbr2 멤버 정보 없음 — `brctl show | head -20` 절단)
```

**본 수집 명령의 결함 공개**: `brctl show`에 `head -20` 제한을 걸어두었는데, nd03은 VM 개수가 많아(8개 fwbr × 2줄 = 16줄 소비) vmbr1, vmbr2의 멤버 목록이 잘렸다. **데이터 부족으로 nd03의 VM이 어느 bridge에 연결되는지 본 수집에서는 확정 불가**.

본 챕터 §7.1에 재수집 명령을 박는다. 타 노드 패턴(VM이 대부분 vmbr1에 연결)로부터 추정은 가능하나, 확증 아님. 이 사실을 §7.1에 명시.

#### nd04

```markdown
vmbr0 ← enp13s0 (VM 없음)
vmbr1 ← enp3s0, fwpr100020p0, fwpr106p0, fwpr113p0
   VM: 100020, 106, 113 (모두 vm 평면)
vmbr2 ← enp10s0 (VM 없음)
```

✓ 정상. 모든 VM이 vm 평면.

#### nd05 — ⚠️ VM 101, 799, 100004(NIC1)이 mgmt 평면

```markdown
vmbr0 ← enp13s0, fwpr101p0, fwpr799p0, tap100004i1  ⚠️⚠️
   VM: 101 (fwbr 래핑), 799 (fwbr 래핑), 100004의 NIC1 (fwbr 없이 직결!)
vmbr1 ← enp3s0, (8개 VM: 100004-NIC0, 9502, 10020001, 10021001, 10031001, ...)
```

**이상이 두 가지**:

1. **VM 101, 799이 mgmt 평면에 연결**: VM의 일반 트래픽이 mgmt 평면을 통과 → Web UI·SSH·CMP API 대역 잠식 가능
2. **VM 100004의 두 번째 NIC이 fwbr 래핑 없이 vmbr0에 직결**: firewall 관리 대상 밖. 의도 확인 필요

### 2.5.1 Bridge 멤버 카오스의 정리

본 환경의 설계 의도는 "VM은 vmbr1 전용"이었을 것이나, 실제로는 다음 예외가 발생.

| 예외 케이스                     | 노드 | 평면 혼용 가능성                   |
| ------------------------------- | ---- | ---------------------------------- |
| VM 112 mgmt                     | nd02 | 높음 (원인 미상 VM + 3일 지속 CPU) |
| VM 101 mgmt                     | nd05 | 낮음 (VM 101 정찰 전까지 불명)     |
| VM 799 mgmt                     | nd05 | 낮음                               |
| VM 100004 NIC1 mgmt (fwbr 없이) | nd05 | 중간 (fwbr 없는 것이 특히 이상)    |
| PBS NIC1 storage                | nd01 | **의도된 분리 (정상)**             |

**원칙 박제**: **"같은 타입의 VM이 일부 노드에서 vm 평면, 일부 노드에서 mgmt 평면에 연결된 경우, 거의 확실히 실수다."** 의도된 설계라면 5노드에서 일관적으로 동일 bridge에 연결되어야 한다.

챕터 06(가상 자원 인벤토리)에서 각 VM의 네트워크 연결 의도 전수조사 인계.

### 2.6 라우팅 테이블 — 5노드 완전 동일 패턴

```markdown
default via 10.99.10.1 dev vmbr0 proto kernel onlink   # 외부 → mgmt 경유
10.99.10.0/24 dev vmbr0 proto kernel scope link src 10.99.10.XX
10.99.20.0/24 dev enp4s0 proto kernel scope link src 10.99.20.XX
10.99.30.0/24 dev vmbr2 proto kernel scope link src 10.99.30.XX
10.99.40.0/24 dev vmbr1 proto kernel scope link src 10.99.40.XX
```

**완벽한 일관성**. 5노드 모두 같은 route. 각 평면의 서브넷은 해당 인터페이스로 direct 라우팅, 외부(`default`)는 mgmt 평면의 게이트웨이 경유.

**외부 네트워크는 반드시 mgmt 평면을 거친다**는 사실이 중요. DNS resolution(§2.13), NTP 동기화(챕터 02 §2.7), 외부 apt 저장소 접근 — 모두 mgmt 평면 의존. mgmt 평면 장애 시 **외부 통신 전면 차단**.

### 2.7 CMP :18080 연결 분포 — 🔴 **nd01 집중**

각 노드의 CMP 포트 `:18080`에 맺힌 연결 상태.

| 노드     | LISTEN | ESTAB 연결 수                   | peer IP 대역                              |
| -------- | ------ | ------------------------------- | ----------------------------------------- |
| **nd01** | ✓      | **9**                           | `10.99.250.56`, `.62`, `.65`, `.71` (4명) |
| nd02     | ✓      | 1 (자기 자신 또는 health check) | —                                         |
| nd03     | ✓      | 1                               | —                                         |
| nd04     | ✓      | 1                               | —                                         |
| nd05     | ✓      | 1                               | —                                         |

**결정적 발견**: **CMP의 실제 트래픽은 5노드 중 nd01만 받고 있다**. 다른 4노드의 cmp.jar는 돌아가고 있으나 실질 워크로드 없음.

peer IP `10.99.250.X`는 본 환경의 4평면(10/20/30/40) 외의 대역 — **사무실 LAN 또는 테스터들의 개인 PC**로 추정. 4명 이상의 테스터가 **동시에 nd01:18080에 접속 중**. 테스터 PC 대역 `10.99.250.X`는 다음 평면 정의에 추가되어야 하나, 본 핸드북의 4평면 정의는 인프라 측이므로 외부 접근 대역은 별도로 관리.

#### 2.7.1 이 집중의 원인 해석 (추정)

CMP 자체에는 로드밸런서가 없다(확인 명령 없으나 4평면 설계상 별도 LB 없음). 라우팅 방식 추정:

1. **테스터 수동 고정**: 테스터들이 URL에 `http://10.99.10.11:18080/...`(nd01의 IP)을 하드코딩하여 사용
2. **DNS round-robin 미구성**: 사내 DNS가 없으므로 `cmp.corp.local` 같은 논리 이름이 없다
3. **CMP가 내부에서 세션을 공유**: nd01이 요청을 받고 다른 노드 인스턴스로 내부 프록시할 가능성(확인 불가)

가장 가능성 높은 시나리오는 **1번**. 테스터들이 편의상 한 노드 IP를 쓰고 있고, 5노드 분산은 이름뿐인 상태.

#### 2.7.2 이 구조의 리스크

- **nd01 장애 시 CMP 서비스 전면 중단** (5노드 분산의 HA 효과 없음)
- **nd01 CPU 부하 집중**: 챕터 02 §2.5에서 nd01이 특별히 부하가 높진 않았으나, 이 집중이 지속되면 수치가 오를 것
- **테스트 결과의 노드 편향**: CMP 요청이 한 노드로만 가니, 실제로는 `nd01-local` 환경의 테스트만 수행됨

**챕터 04 개발팀 협의 항목에 "CMP 요청 라우팅 설계 의도" 추가**. 만약 고의라면 HA 설계 의도가 아닌 것이고, 실수라면 로드밸런서 도입이 필요.

### 2.8 LISTEN 서비스 — 5노드 공통 서비스 카탈로그

공통 LISTEN 포트.

| 포트      | 서비스            | 바인드                      |
| --------- | ----------------- | --------------------------- |
| 22        | sshd              | `0.0.0.0` (모든 인터페이스) |
| 25        | postfix master    | `127.0.0.1` only (로컬만)   |
| 111       | rpcbind           | `0.0.0.0`                   |
| 3128      | spiceproxy        | `*` (모든)                  |
| 8006      | pveproxy (Web UI) | `*`                         |
| **18080** | **java (CMP)**    | `*`                         |

**해석**:

1. **rpcbind(111)이 모든 인터페이스에 LISTEN**: NFS client가 필요. 단 외부에 노출되는 것은 위험 — 방화벽으로 mgmt 평면 외 차단 권고. 현 PVE firewall 비활성 상태이므로 방어 없음
2. **pveproxy(8006)**: Proxmox Web UI. 5노드 모두 LISTEN. 테스터는 어느 노드 IP로도 접속 가능
3. **cmp.jar(18080)**: 5노드 LISTEN. 그러나 실제 트래픽은 nd01로만 집중(§2.7)
4. **8007 포트 (PBS)가 안 보임**: PBS는 nd01이 아니라 `10.99.40.100` 별도 호스트. 정상

### 2.9 ARP 이웃 테이블 — 5노드 통신 패턴 + TrueNAS 다평면

nd01의 ARP 테이블 (가장 정보 풍부) 요약.

| 이웃 IP                               | 평면      | 상태            | 해석                                         |
| ------------------------------------- | --------- | --------------- | -------------------------------------------- |
| 10.99.10.1                            | mgmt      | REACHABLE       | 게이트웨이 정상                              |
| 10.99.10.16                           | mgmt      | REACHABLE       | TrueNAS nd06 mgmt 정상                       |
| 10.99.10.17                           | mgmt      | REACHABLE       | TrueNAS nd07 mgmt 정상                       |
| 10.99.30.16                           | storage   | REACHABLE       | TrueNAS nd06 storage 정상                    |
| **10.99.30.17**                       | storage   | **REACHABLE**   | **TrueNAS nd07 storage — 챕터 03 정정 사실** |
| 10.99.40.100                          | vm        | REACHABLE       | PBS 정상                                     |
| 10.99.10.{12~15}                      | mgmt      | REACHABLE/STALE | 다른 노드 mgmt                               |
| 10.99.20.{12~15}                      | corosync0 | REACHABLE/DELAY | corosync0                                    |
| 10.99.30.{12~15}                      | storage   | REACHABLE       | storage 평면                                 |
| 10.99.40.{52, 55, 56, 58, 67, 70, 92} | vm        | REACHABLE/STALE | **VM들의 IP**                                |
| **10.99.20.16**                       | corosync0 | **FAILED**      | **TrueNAS nd06 corosync 평면 IP — 미응답**   |
| 10.99.30.60, 10.99.30.61              | storage   | FAILED          | 미상 IP (stale 설정?)                        |
| 10.99.30.1                            | storage   | STALE           | storage 평면 게이트웨이 (드물게 사용)        |
| 10.99.10.24                           | mgmt      | FAILED          | 미상 mgmt IP                                 |

**판독 핵심**:

1. **nd07의 storage 평면 IP `10.99.30.17`가 REACHABLE**: 챕터 03 §2.7.4에서 "nd07은 mgmt 경유만 확인"으로 썼지만, storage IP도 이미 활성. NFS 마운트만 아직 mgmt 경로로 설정돼 있을 뿐. 평면 이전의 기술적 장벽은 낮음
2. **TrueNAS nd06이 corosync 평면(`10.99.20.16`)에 IP를 가졌다가 끊긴 상태**: TrueNAS가 과거 corosync 평면에 연결될 필요가 없는데도 IP 설정이 있었던 듯. 현재 FAILED — 정리되지 않은 잔재 설정. TrueNAS 측 정비 대상
3. **VM IP (`10.99.40.X`)가 나타남**: MAC 주소가 `bc:24:11:*` 대역은 **Proxmox가 생성한 VM NIC의 MAC 접두사**. 52, 55, 56, 58, 67, 70, 92 등 VM들이 vm 평면에서 통신 중

### 2.10 iSCSI 세션 분포 — 🔴 **nd03 3 세션만**

`iscsiadm -m session` 결과.

| 노드     | 세션 수 | TrueNAS nd06 (`.30.16`)         | TrueNAS nd07 (`.30.17`)    |
| -------- | ------- | ------------------------------- | -------------------------- |
| nd01     | 8       | 7                               | 1 (testerSelf target)      |
| nd02     | 10      | 9 (mgmt 평면 `.10.16` 1건 포함) | 1 (testerSelf target)      |
| **nd03** | **3**   | 2 (prom-lvm, testerC)           | 1 (testerSelf target)      |
| nd04     | 9       | 8 (mgmt 평면 `.10.16` 1건 포함) | 1 (testerSelf target)      |
| nd05     | 10      | 6                               | **4 (testerSelf targets)** |

**판독**:

1. **nd03이 3 세션만**: 챕터 03 §2.1.2의 "nd03만 iSCSI 디스크 3개"와 정확히 대응. 네트워크 세션 자체가 적기 때문에 블록 디바이스도 적다. 이 세션 부족의 원인은 다음 두 가지 중 하나:
   - **iSCSI initiator 설정에서 target 수가 적게 등록됨** (`/etc/iscsi/nodes/` 디렉터리의 누락)
   - **storage 평면 연결성 문제** — 하지만 nd03 `enp9s0`은 2.5 Gbps로 정상이므로 이 가능성은 낮음
2. **nd02, nd04의 mgmt 평면 iSCSI 세션**: `.10.16:3260` (mgmt 평면 TrueNAS IP)로의 iSCSI 세션이 1건씩 존재. 이는 **iSCSI 트래픽이 mgmt 평면으로 흐르는 심각한 평면 혼용**. NFS 평면 혼용(챕터 03 §2.7.3)과 같은 종류의 설정 오류
3. **testerSelf target이 5노드 모두에 분산**: 작성자 본인의 CMP 테스트 타겟(`cmptest-iscsi-node-target`, `cmptest-zfs-node-target`, `cmptest-directory-node-target`, `cmptest-lvm-node-target`, `cmptest-lvmthin-node-target`)이 주로 nd05에 몰려 있으나 모든 노드에서 1건씩 보임. 이는 **5노드 공유 target을 테스트하는 의도된 구성**
4. **iscsi target 명명 규칙 혼용**:
   - 구식: `iqn.2005-10.org.freenas.ctl:iscsi-test01`
   - 신식: `iqn.2005-10.org.freenas.ctl:iqn.2026-04.com.truenas:cmptest-target01-testerA`
   - **이중 IQN(`iqn.2005-10.org.freenas.ctl:iqn.2026-04.com.truenas:...`)**은 TrueNAS의 최신 명명 관행. freenas.ctl은 controller IQN, 콜론 뒤는 target identifier

### 2.11 NIC 에러/드롭 — corosync+storage 공유 평면의 대량 rx_drop

5노드 `enp10s0`/`enp9s0` (vmbr2 = corosync1+storage) 및 기타 인터페이스의 drop 통계.

| 노드 | enp10s0/enp9s0 rx_drop | 기타 판독                                            |
| ---- | ---------------------- | ---------------------------------------------------- |
| nd01 | **101,008**            | corosync ring1 multicast drop                        |
| nd02 | **140,702**            | **가장 많음** — 100 Mbps 링크 + 장기 가동(49일) 누적 |
| nd03 | **140,700**            | nd02와 거의 같음 — 장기 가동(49일) + 저속?           |
| nd04 | 49,251                 | 16일 가동                                            |
| nd05 | 2,857                  | 4시간 재부팅 직후 — 낮은 누적값                      |

**해석**:

- **drop 크기가 가동 시간에 비례**하는 경향이 뚜렷. nd05(4시간)는 2,857, nd02/nd03(49일)은 140,000+. 즉 **분당 약 40건**의 꾸준한 drop — corosync ring1 multicast의 꾸준한 수신 + drop
- **rx_err는 0**: 하드웨어 오류 없음. 패킷은 정상 수신되나 처리 대상 아님
- **storage 평면 트래픽(iSCSI/NFS)으로 인한 drop이 아니다**: iSCSI/NFS는 unicast이므로 호스트가 모두 처리. drop되지 않음

**결론**: 이 rx_drop은 **장애 신호가 아니라 corosync ring1이 storage 평면을 공유하는 설계의 예상된 부작용**. 별도 정비 대상은 아니나, corosync ring1 전용 NIC 분리가 가능한 하드웨어 추가 시 자연 해소.

#### 2.11.1 vmbr0 (mgmt) rx_drop 1,600~1,800

nd01, nd02, nd03, nd04가 1,600~1,800 rx_drop. nd05만 95(재부팅 직후). 이것도 mgmt 평면의 브로드캐스트/IPv6 multicast 패킷이 누적된 결과로 보인다. 비정상 수치 아님.

### 2.12 /etc/network/interfaces — 5노드 구조 일관성

5노드 `/etc/network/interfaces` 내용은 **IP 주소와 NIC 이름만 다를 뿐 구조 동일**.

- nd01~nd05: vmbr0/1/2 동일 구조, enp4s0 직접 IP 할당
- nd03만: NIC 이름이 `enp9s0, enp12s0`로 치환 — 다른 노드의 `enp10s0, enp13s0` 자리

**특이사항**: nd02의 `/etc/network/interfaces`에만 `iface enp13s0 inet manual`의 **`auto` 키워드가 빠져 있다**. 다른 4노드는 `auto enp13s0 + iface enp13s0 inet manual` 둘 다 있음.

```markdown
# nd01, nd03, nd04, nd05:
auto enp13s0
iface enp13s0 inet manual

# nd02:
iface enp13s0 inet manual    # auto 없음
```

**영향**: `auto`가 없으면 부팅 시 `ifup -a`가 해당 NIC을 자동 활성화하지 않는다. 그러나 **vmbr0의 bridge-ports에서 enp13s0를 참조**하므로 vmbr0 활성화 시 함께 up 된다. 현재 문제 없음. 단 **vmbr0 설정이 삭제되면 nd02만 enp13s0가 down 상태로 남는다** — 잠재적 취약점.

챕터 07(로그) 또는 챕터 08(위험 매트릭스)에 기록. 소급 정비 불필요.

### 2.13 DNS — 🟠 외부 Google DNS 단일 의존

5노드 `/etc/resolv.conf` 완전 동일.

```markdown
search corp.local
nameserver 8.8.8.8
```

**두 가지 문제**:

1. **사내 DNS 없음**: `pve-nd06`, `pve-nd07` 등의 내부 호스트 이름은 `/etc/hosts`로만 해석(챕터 01 §7.1의 /etc/hosts 정비 대상). 노드 추가·삭제 시 5노드의 /etc/hosts를 수동 동기화해야 함
2. **외부 네트워크 단절 시 DNS 전면 마비**: `8.8.8.8`은 Google Public DNS. 사무실 외부망 끊기면 모든 외부 호스트명 해석 불가 → NTP(`ntp3.example.com` 등) 재동기화 실패, apt 저장소 접근 불가, 기타 외부 리소스 의존 기능 전부 영향

**권고**: 사내 DNS 서버 1대 운영. 외부 NTP·apt 저장소와 내부 호스트명 모두 이 DNS로 해석. Resolver chain은 `사내 DNS → 8.8.8.8` 순서. 단 이는 운영팀 범위.

### 2.14 PVE Firewall 상태 — 5노드 전부 disabled

```markdown
Status: disabled/running   (5노드 모두)
iptables INPUT chain: policy ACCEPT, rule 0
```

- PVE firewall **서비스는 돌고** 있으나 **rule 적용은 비활성**
- iptables INPUT 정책이 ACCEPT + rule 0건 = **방화벽 실질 없음**

**판독**: 단일 랙 환경 + 외부 격리 전제(방화벽이 외부 경계선에 있다고 가정) 하에서는 이 구성이 허용 가능. 그러나 **mgmt 평면 rpcbind(111)를 외부 노출할 수 있는 환경이라면 보안 리스크**. 현 사무실 환경 구성에 따라 판단 필요.

각 VM 단위로 fwbr 래핑 구조는 이미 대부분 구축되어 있어(§1.2 형태 B) 필요시 `pve-firewall start` + VM별 룰 작성으로 즉시 활성 가능.

### 2.15 Bonding — 5노드 모두 미사용

```markdown
/proc/net/bonding/ 디렉터리: 5노드 모두 비어있음
```

본 환경은 **NIC bonding(LACP 등) 미구성**. 각 평면이 단일 NIC으로 운영.

**영향**:

- 네트워크 이중화 없음. 특정 NIC 장애 시 해당 평면 전면 중단
- 대역폭 집적(aggregation) 없음. 2.5 Gbps 링크의 단일 제한

**현 환경의 리스크**: **vmbr2 (storage+corosync1) 단일 NIC 장애 시**, storage 평면과 corosync ring1이 동시에 끊긴다. Corosync ring0(enp4s0 직결)이 남으므로 클러스터는 유지되나, storage 트래픽이 막혀 모든 VM 디스크 I/O 중단. 실질 영향이 매우 크다.

권고: vmbr2의 백업 NIC 추가 후 bond. 단 **enp3s0 (vm 평면)과 enp4s0 (corosync0)도 단일**이므로, 비슷한 논리가 적용됨. 물리적 NIC 추가가 선행 조건. 운영팀 협의.

### 2.16 5노드 간 mgmt 평면 ping — RTT 분포

```markdown
nd01 → nd02: 0.65 ms (avg)
nd01 → nd03: 0.27 ms
nd01 → nd04: 0.35 ms
nd01 → nd05: 0.14 ms  ← 가장 가까움

nd02 → nd05: 1.55 ms  ⚠️ 첫 ping 지연 가능성
nd03 → nd05: 1.62 ms  ⚠️ 첫 ping 지연 가능성

나머지: 0.1~0.4 ms 범위
모든 경우 packet loss 0%
```

**판독 1 — 기본 RTT 우수**: 대부분의 노드 간 RTT가 0.1~0.7 ms. 같은 랙 내 스위치를 경유하는 환경에서 정상 범위.

**판독 2 — nd02/nd03 → nd05만 1.5 ms로 튀는 이유**:

반대 방향(`nd05 → nd02`, `nd05 → nd03`)은 0.27~0.34 ms로 정상. 즉 **비대칭**. 이는 **ping 3회 중 첫 번째 packet에서 ARP 해석 지연**이 발생한 결과로 해석된다. nd02와 nd03의 ARP 테이블에서 `10.99.10.15` 엔트리가 STALE 상태였다가, ping 시 REACHABLE로 전환되면서 첫 ping이 약 1.5 ms로 측정됨(ARP 완료 대기). `min/avg/max/mdev` 중 mdev(편차)가 큰 것은 이 해석과 일치.

**비정상 아님**. 그러나 STN 중 ARP 타이밍 민감 테스트에서는 **첫 요청이 1~2 ms 지연될 수 있음을 염두**에 두어야 한다.

---

## 3. 출력의 비정상 패턴과 조기 경보

### 3.1 정상 패턴 — 본 환경의 베이스라인

```markdown
[정상 1] `ip -br addr`에 4개 평면 IP가 모두 올라와 있고 마지막 옥텟이 노드 번호와 일치
[정상 2] 5노드 간 mgmt 평면 ping RTT < 2 ms (첫 ping 지연 허용)
[정상 3] 각 노드의 `enp10s0` 또는 `enp9s0` 링크 속도 2.5 Gbps
[정상 4] `ip neigh show`에서 TrueNAS(nd06, nd07) 엔트리가 REACHABLE
[정상 5] `ss -tlnp`에 8006(pveproxy), 18080(cmp.jar) LISTEN
[정상 6] rx_err = 0 (모든 NIC)
[정상 7] `iscsiadm -m session`의 세션이 storage 평면(`10.99.30.X`) IP로 연결됨
```

### 3.2 의심 패턴

| #   | 패턴                                   | 추정 원인                                     | 즉시 확인                    |
| --- | -------------------------------------- | --------------------------------------------- | ---------------------------- |
| 1   | 링크 속도가 노드별로 다름              | 케이블/포트 불량, auto-neg 실패               | ethtool 전 노드 비교         |
| 2   | rx_err > 0                             | 하드웨어 불량                                 | dmesg, 케이블 교체 검토      |
| 3   | `ip neigh`에 FAILED 상태가 새로 발생   | 해당 IP 다운                                  | 대상 호스트 상태 확인        |
| 4   | 5노드 간 ping loss > 0%                | 네트워크 장애                                 | 스위치 상태                  |
| 5   | `iscsiadm -m session`에 mgmt 평면 IP   | iSCSI 평면 혼용                               | storage 평면으로 이전        |
| 6   | VM tap이 예상과 다른 bridge에 연결     | 설정 실수                                     | `qm config`의 netN 라인 확인 |
| 7   | vmbr2 rx_drop 증가율 급증 (분당 1000+) | corosync ring1 부하 증가 또는 broadcast storm | corosync 상태 확인           |
| 8   | CMP :18080 ESTAB 분포 변화             | 로드밸런싱 변경                               | 요청 라우팅 재확인           |
| 9   | 게이트웨이(10.99.10.1) unreachable     | 외부망 단절                                   | mgmt 평면 점검               |
| 10  | enp4s0 link down                       | corosync ring0 단절                           | 즉시 corosync status         |
| 11  | DNS resolve 실패 (8.8.8.8 접근 불가)   | 외부망 또는 DNS 룰 변경                       | 사내 대체 DNS 필요           |

### 3.3 즉시 중단 신호

#### 신호 A: enp4s0 (corosync0) 링크 다운

```bash
ip -br link show enp4s0 | grep DOWN
```

결과 있으면 corosync ring0 단절. ring1 단독 운영 상태로 전환되며 이는 공유 평면의 부하에 취약. 즉시 NIC 상태 진단.

#### 신호 B: nd02 storage 평면 추가 속도 저하

```bash
ssh pve-nd02 "ethtool enp10s0 | grep Speed"
```

100 Mbps보다 더 낮게 측정되면(예: 10 Mbps) 심각한 연결 열화. STN 중단 후 케이블 교체.

#### 신호 C: ping loss 비율 급증

```bash
for n in pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05; do
  [ "$n" = "$(hostname)" ] && continue
  ping -c 20 -W 1 -q $n | grep 'packet loss'
done
```

loss > 5% 발생 시 네트워크 이상. 해당 노드 격리 검토.

---

## 4. 이 영역의 CMP 테스트 대분류와 시나리오

### 4.1 CRUD 기능 검증

#### 시나리오 4.1.1 — 네트워크 자원 조회 정합성

CMP UI의 네트워크 정보(bridge, IP, MTU 등)가 실제 상태와 일치하는가.

- 진입점: `pvesh get /nodes/{node}/network`
- 사전 정찰: §2.1~§2.4
- 검증: CMP가 보여주는 bridge 멤버십이 `brctl show`와 일치 (특히 nd02의 VM 112 mgmt 연결이 UI에도 보이는지)

#### 시나리오 4.1.2 — VM 네트워크 인터페이스 생성

CMP를 통해 VM에 새 NIC 추가. bridge 선택 UI에서 vmbr0/1/2 중 어느 것이 노출되는가, 기본값이 vmbr1인가.

- 사전 정찰: §2.5
- 기대 동작: 기본값 vmbr1 (vm 평면)
- 결함 시나리오: 기본값 vmbr0 제시로 실수 유발 (nd05 VM 101 등의 재발 가능성)

### 4.2 스테이징 워크플로우

본 영역 해당 없음. 네트워크 설정 변경은 대부분 L3 격자 이상으로 바로 스테이징.

### 4.3 위험 시나리오·에러 처리

#### 시나리오 4.3.1 — nd02 스토리지 평면 100 Mbps 상태에서의 마이그레이션

VM을 다른 노드 → nd02로 마이그레이션 시도. 100 Mbps 링크에서 NFS 디스크 이동이 시간 초과를 유발하는지.

- 사전 정찰: §2.3
- 기대 동작: 명확한 timeout 에러, 재시도 안내
- 결함 시나리오: 긴 대기 후 부분 전송 상태로 정체, rollback 불완전

#### 시나리오 4.3.2 — enp4s0 의도적 다운 후 cluster 상태

**⚠️ 격자 L4×R2 — 운영팀 합의 필수 시나리오**. enp4s0을 의도적으로 down 시켜 corosync ring0 단절 시 CMP가 어떻게 반응하는지.

- 사전 정찰: §2.1 (ring0는 enp4s0 직결)
- 기대 동작: ring1로 fallback, 클러스터 멤버십 유지, CMP UI에서 상태 표시
- 결함 시나리오: 클러스터 분열(split-brain) 또는 CMP가 상태 갱신 안 함

**이 시나리오는 본 챕터 범위에서 실행하지 않는다**. 챕터 08 위험 매트릭스 테스트 plan 항목으로 등록.

### 4.4 클러스터 일관성

#### 시나리오 4.4.1 — 5노드 CMP LISTEN 일관성

`:18080`이 5노드 모두에 LISTEN 중인 상태에서 CMP UI가 각 인스턴스의 heartbeat을 표시하는가.

- 사전 정찰: §2.8
- 검증: nd01~nd05 각 CMP 인스턴스 상태가 UI에서 구분 표시되는지

#### 시나리오 4.4.2 — 요청 라우팅의 투명성

테스터가 CMP UI를 사용할 때 어느 노드 인스턴스가 요청을 처리했는지 추적 가능한가.

- 사전 정찰: §2.7 (현재 nd01 집중)
- 기대 동작: 응답 헤더 또는 UI 배지에 처리 노드 표시
- 결함 시나리오: 어느 노드가 처리했는지 불가시. 디버깅 불가

---

## 5. 정찰 ↔ 테스트 단계 역방향 매핑

| 수행하려는 액션                 | 선행 정찰 (본 챕터)                  | 추가 선행              |
| ------------------------------- | ------------------------------------ | ---------------------- |
| VM 네트워크 설정 변경 (챕터 06) | §2.5 bridge 멤버 매트릭스            | 챕터 02 VM 부하        |
| 노드 간 마이그레이션 (챕터 06)  | §2.3 링크 속도 (nd02 주의)           | 챕터 03 storage 가용성 |
| CMP 요청 부하 테스트            | §2.7 현 nd01 집중                    | 챕터 02 nd01 부하      |
| Corosync ring 단절 테스트       | §2.15 bonding 부재 + 단일 NIC 리스크 | 챕터 01 정족수         |
| NFS 평면 이전 (챕터 04)         | §2.9 nd07 storage IP 활성 확인       | 개발팀 협의            |
| iSCSI 세션 정리 (챕터 04)       | §2.10 nd02/nd04의 mgmt 평면 세션     | **L3 격자 — 합의**     |

---

## 6. 정찰 결과를 산출물로 정리하는 양식

### 6.1 산출물 — 네트워크 베이스라인 카드 (주간 갱신)

```markdown
# 네트워크 베이스라인 카드 — YYYY-MM-DD HH:MM

## 5노드 링크 속도
| 노드 | enp3s0 | enp4s0 | enp10s0/9s0 | enp13s0/12s0 |

## 5노드 간 mgmt 평면 ping RTT
| src \ dst | nd01 | nd02 | nd03 | nd04 | nd05 |

## iSCSI 세션 수
| 노드 | 세션 | storage 평면 | mgmt 평면 (⚠) |

## CMP :18080 연결 분포
| 노드 | ESTAB | peer 대역 |

## ARP FAILED 엔트리 (있을 경우)
- IP: ..., 평면: ..., 추정 원인: ...

## rx_drop 증가율 (주간)
- vmbr2 (corosync1+storage): ...
```

### 6.2 산출물 — 네트워크 이상 보고서 (이상 식별 시)

양식은 챕터 02 §6.2와 동일 구조.

---

## 7. 본 챕터에서 발견된 잔여 정비·추적 항목

| #   | 발견 항목                                          | 인계 챕터                  | 우선순위 | 상태                      |
| --- | -------------------------------------------------- | -------------------------- | -------- | ------------------------- |
| 1   | **nd02 storage 평면 enp10s0 100 Mbps**             | 운영팀 + 챕터 08           | **P0**   | **STN 전 필수 해결**      |
| 2   | **CMP 요청 nd01 집중 — 분산 없음**                 | 챕터 04 (개발팀) + 챕터 06 | **P0**   | 라우팅 설계 확인          |
| 3   | VM 112 (nd02) mgmt 평면 연결                       | 챕터 06                    | P1       | VM 112 처분과 연계        |
| 4   | VM 101, 799 (nd05) mgmt 평면 연결                  | 챕터 06                    | P1       | 평면 이전 검토            |
| 5   | VM 100004 NIC1 (nd05) fwbr 미래핑                  | 챕터 06                    | P2       | 의도 확인                 |
| 6   | nd03 iSCSI 3 세션만                                | 챕터 04                    | P1       | initiator 설정 보완       |
| 7   | nd02, nd04의 mgmt 평면 iSCSI 세션                  | 챕터 04                    | P1       | storage 평면 이전         |
| 8   | TrueNAS nd06 corosync 평면 IP FAILED               | 운영팀                     | P3       | 잔재 설정 정리            |
| 9   | 사내 DNS 부재 — Google DNS 단일                    | 운영팀                     | P2       | 사내 DNS 도입 권고        |
| 10  | PVE firewall disabled (5노드)                      | 챕터 08                    | P2       | 현 환경 구성 확인         |
| 11  | nd02 /etc/network/interfaces의 enp13s0 `auto` 누락 | 챕터 07                    | P3       | 기록, 소급 정비 불필요    |
| 12  | NIC bonding 부재 — 평면별 단일 NIC                 | 운영팀 + 챕터 08           | P2       | 이중화 검토               |
| 13  | nd03 PCI 슬롯 이름 차이 (enp9s0, enp12s0)          | 운영팀                     | P3       | 원인 확인, 기능 영향 없음 |
| 14  | TrueNAS iSCSI target 명명 규칙 혼용                | 챕터 04                    | P3       | 운영팀 정비               |
| 15  | nd05 재부팅 직후 — rx_drop 낮은 기준점             | 본 챕터                    | —        | 향후 관찰 시 비교 기준    |

### 7.1 본 챕터 데이터 수집의 자체 결함 — 재수집 필요 항목

본 챕터 §2.5에서 **nd03의 bridge 멤버 정보가 수집 명령의 `head -20` 제한으로 잘림**. 재수집 명령:

```bash
ssh pve-nd03 "brctl show"   # head 제한 없이 전체
# 또는
ssh pve-nd03 "bridge link show | grep -E 'master (vmbr|fwbr)'"
```

**이 사례의 교훈**: **정찰 명령의 출력 절단은 허용 가능한가**를 데이터 수집 전에 판단해야 한다. 본 수집에서 `head -20`을 붙인 이유는 출력량 제한이었으나, VM 개수가 많은 노드에서는 핵심 정보가 절단된다. **결정 원칙**: 고정 길이 절단보다 `awk` 또는 `grep`으로 관심 내용만 뽑는 것이 안전. 향후 수집 명령 설계 시 이 원칙 적용.

본 챕터에서는 nd03의 vmbr1, vmbr2 멤버가 "다른 4노드 패턴과 동일할 것"으로 추정하되, **확증 아님**을 §2.5에 명시. 재수집이 완료되면 이 §7.1 항목을 해소.

### 7.2 본 챕터의 자기 평가

본 챕터는 15건의 정비 항목을 발견했고, 이 중 2건이 P0이다. 이는 다른 챕터(01·02·03)에 비해 **상대적으로 많은 P0 발견**이다. 이유:

- 네트워크 계층은 다른 계층의 베이스이므로, 여기서 드러나는 이상은 연쇄 영향
- nd02의 100 Mbps 링크는 "발견되지 않았다면 STN 중 원인 불명의 성능 저하"로 나타날 사안
- CMP nd01 집중은 "발견되지 않았다면 분산 시스템 테스트의 전제 자체가 무너지는" 사안

**챕터 05는 본 시리즈에서 가장 중요한 챕터 중 하나**로 기록된다. 이는 **"스토리지 관점 없이 자원 정체 단정 금지"** 원칙(챕터 03 §0.1)의 연장선 — 네트워크 관점 없이 시스템의 실제 동작을 이해할 수 없다.

---

## 부록 A. 명령 치트 시트

```bash
NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"

# === 5노드 링크 속도 빠른 체크 ===
for n in $NODES; do
  echo "=== [$n] ==="
  ssh "$n" "for i in enp3s0 enp4s0 enp10s0 enp9s0 enp13s0 enp12s0; do \
              [ -e /sys/class/net/\$i ] && \
              echo -n '\$i: ' && ethtool \$i 2>/dev/null | grep Speed; \
            done"
done

# === CMP :18080 분산 상태 즉시 확인 ===
for n in $NODES; do
  cnt=$(ssh "$n" "ss -tn 'sport = :18080' state established 2>/dev/null | wc -l")
  echo "[$n] CMP ESTAB: $((cnt - 1))"
done

# === iSCSI 세션 분포 ===
for n in $NODES; do
  sess=$(ssh "$n" "iscsiadm -m session 2>/dev/null | wc -l")
  mgmt=$(ssh "$n" "iscsiadm -m session 2>/dev/null | grep -c '10.10.10.'")
  echo "[$n] total=$sess, mgmt평면=$mgmt"
done

# === rx_drop 증가율 관찰 ===
for n in $NODES; do
  ssh "$n" "cat /sys/class/net/vmbr2/statistics/rx_dropped"
done
# (60초 후 반복 → 차이로 증가율)

# === ARP FAILED 엔트리 감시 ===
for n in $NODES; do
  failed=$(ssh "$n" "ip neigh show | grep -c FAILED")
  echo "[$n] FAILED neighbors: $failed"
done
```

## 부록 B. 다음 챕터로의 인계

| 본 챕터 발견                   | 챕터 04 (스토리지 자원 관리) 처리  |
| ------------------------------ | ---------------------------------- |
| nd02/nd04 mgmt 평면 iSCSI 세션 | storage 평면으로 이전              |
| nd07 storage 평면 IP 활성 확인 | NFS 마운트 경로 이전 계획 구체화   |
| nd03 iSCSI 3 세션만            | initiator `/etc/iscsi/nodes/` 보완 |
| TrueNAS iSCSI target 명명 혼용 | 정비                               |

| 본 챕터 발견               | 챕터 06 (가상 자원) 처리 |
| -------------------------- | ------------------------ |
| VM 112 mgmt 평면 연결      | VM 112 처분 합의 + 이전  |
| VM 101, 799 mgmt 평면      | 이전 검토                |
| VM 100004 NIC1 fwbr 미래핑 | 의도 확인                |

| 본 챕터 발견                  | 챕터 07 (로그) 처리 |
| ----------------------------- | ------------------- |
| nd02 interfaces의 `auto` 누락 | 기록                |

| 본 챕터 발견                 | 챕터 08 (위험 매트릭스) 처리 |
| ---------------------------- | ---------------------------- |
| nd02 100 Mbps 링크           | **최우선 리스크**            |
| CMP nd01 집중 — HA 효과 없음 | 서비스 가용성 리스크         |
| NIC bonding 부재             | 단일 NIC 장애 영향           |
| PVE firewall disabled        | 환경 의존 판단 필요          |

## 부록 C. 참고 자료

| 주제                          | URL                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Linux bridge 개요             | https://www.kernel.org/doc/html/latest/networking/bridge.html                     |
| Proxmox Network Configuration | https://pve.proxmox.com/wiki/Network_Configuration                                |
| Corosync Totem Protocol       | https://clusterlabs.org/pacemaker/doc/2.1/Clusters_from_Scratch/html/cluster.html |
| Linux `ip neigh` (ARP)        | https://man7.org/linux/man-pages/man8/ip-neighbour.8.html                         |
| Realtek r8169 driver          | https://docs.kernel.org/networking/device_drivers/ethernet/realtek/r8169.html     |
| Proxmox Firewall              | https://pve.proxmox.com/wiki/Firewall                                             |

---

> **다음 챕터**: `04-storage-resource-management.md` — 개발팀 협의 가능 시점부터 진입. 본 챕터의 P0 항목 2건(nd02 100 Mbps, CMP nd01 집중)과 NFS alias chaos, iSCSI 유령 LUN 등 스토리지 관점의 정비가 함께 다뤄진다.
