---
title: "Stage 1 ─ 리눅스 네트워크 스택의 도구들"
date: 2026-06-01
lastmod: 2026-06-01
author: "Davi"
description: "ip 명령어 (a, r, n 서브커맨드), 라우팅 테이블, ARP 캐시, /proc/sys/net/ipv4/ip_forward의 의미, /etc/network/interfaces의 문법(auto, iface, inet, manual vs static vs dhcp, bridge-ports, post-up), systemd predictable interface names와 .link 파일로 이름 바꾸기"
slug: stage1
category: "network"
tags: [ip, addr, route, neigh, ARP, ip_forward, interface, bridge]
order: 2
series: "네트워크 학습"
series_order: 2
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


## 개요 ─ Stage 1 {#overview}

Stage 0이 *패킷이 흐르는 원리*(MAC·IP·ARP·서브넷·게이트웨이)를 다뤘다면, Stage 1은 그 원리를 **리눅스에서 실제로 들여다보고 조작하는 도구**를 다룬다. 같은 단지/다른 단지 판별, 게이트웨이 경유, 브리지의 스위칭 — 이 모든 것이 리눅스에서 *어떤 명령과 어떤 파일로* 드러나는지가 이 stage의 주제다.

핵심 도구는 셋이다. 현재 상태를 *보는* `ip` 명령어, 노드를 *라우터로 만드는* `ip_forward`, 그리고 설정을 *영속화하는* `/etc/network/interfaces`.

---

## 진단 질문 {#diagnostic-questions}

> **질문 1.**<br/>
> 네 Debian VM(`10.10.3.101/24`, 게이트웨이 `10.10.3.15`)에서 `ip route`를 치면 대략 이렇게 나온다.
>
>> ```bash
>> default        via 10.10.3.15   dev ens18
>> 10.10.3.0/24                    dev ens18 proto kernel scope link src 10.10.3.101
>> ```
>
> (a) 두 줄 중에서 — 어느 줄이 **"같은 단지면 직접 전송"** 이고, 어느 줄이 **"다른 단지면 게이트웨이 경유"** 에 해당해?<br/>
> (b) 그 둘을 가르는 결정적인 단어가 뭐야?

<none/>

> **질문 2.**<br/>
>
>> ```bash
>> default           via 10.0.2.2   dev vmbr1  ...                     #← via O → 경유. "모르는 목적지 전부"
>> 10.0.2.0/24                      dev vmbr1  ...  src 10.0.2.15      #← via X → 직접. 10.0.2 단지
>> 10.10.3.0/24                     dev vmbr2  ...  src 10.10.3.254    #← via X → 직접. 10.10.3 단지
>> 192.168.10.0/24                  dev vmbr0  ...  src 192.168.10.101 #← via X → 직접. 192.168.10 단지
>> ```
>
> **이 Proxmox 노드가 8.8.8.8(구글 DNS)로 패킷을 보낸다고 치자.** <br/>
> 위 4줄 중에서 **어느 줄에 걸릴까?** 그리고 그 결과 패킷은 **어느 게이트웨이를 거쳐, 어느 인터페이스로** 나갈까?

<none/>

> **질문 3.**<br/>
> **네 Debian VM** (라우팅 테이블이 `default via 10.10.3.15`) 이 똑같이 **8.8.8.8로 패킷을 보낸다.**<br/>
> (a) 이 패킷의 첫 게이트웨이는 누구야? Proxmox 노드 때(`10.0.2.2`)랑 같아, 달라?<br/>
> (b) 만약 다르다면, 왜 다른 거야? 같은 `8.8.8.8`인데.

<none/>

> **질문 4.**<br/>
> **한 줄 요약.**
>
>> "브리지는 항상 `___`(을)를 하고, 패킷이 브리지를 넘어 다른 단지로 갈 때만 `___`(이)가 `[브리지 | 커널]` 기능(ip_forward)으로 라우팅한다. 그리고 같은 단지든 다른 단지든 패킷은 똑같이 `[DROP | 캡슐화]`되며, 차이는 프레임의 `___`뿐이다."

---

## 01. ip 명령어 {#ip-command}

`ip`는 과거의 `ifconfig`·`route`·`arp`를 통합 대체한 현대 도구다(iproute2 패키지). 세 개의 서브커맨드만 익히면 Stage 0의 개념이 전부 *눈에 보인다*.

| 서브커맨드 | 축약   | 다루는 것                         | Stage 0 개념과의 연결      |
| ---------- | ------ | --------------------------------- | -------------------------- |
| `ip addr`  | `ip a` | 인터페이스마다 할당된 IP/CIDR     | IP 주소 (L3)               |
| `ip route` | `ip r` | 라우팅 테이블 = **판단 규칙표**   | 같은 단지 / 다른 단지 판별 |
| `ip neigh` | `ip n` | ARP 캐시 = 알아낸 MAC을 IP와 매핑 | ARP로 알아낸 IP→MAC 매핑   |
| `ip link`  | `ip l` | 인터페이스 자체 (L2)              | MAC, up/down 상태          |

```bash
# IP 주소 확인
ip addr show
ip a

# 라우팅 테이블 확인
ip route show
ip r

# ARP 캐시 (Stage 0에서 배운 IP→MAC 매핑이 여기 쌓인다)
ip neigh show
ip n

# 인터페이스 L2 정보 (MAC, 상태)
ip link show
```

`ip neigh`의 출력을 보면 Stage 0의 ARP가 *실제로 캐시에 쌓인 모습*을 확인할 수 있다.

```bash
$ ip neigh
10.10.3.102 dev ens18 lladdr bb:bb:bb:bb:bb:bb REACHABLE
10.10.3.15  dev ens18 lladdr cc:cc:cc:cc:cc:cc REACHABLE
```

`lladdr`(link-layer address)가 곧 MAC이다. `REACHABLE`은 최근 통신으로 유효성이 확인된 상태.

## 02. 라우팅 테이블 읽는 법 {#reading-routing-table}

라우팅 테이블은 '*어디로 보낼지*'의 결정표다. 한 줄씩 읽는 법을 익히면, Stage 0의 "같은 단지면 직접, 다른 단지면 게이트웨이"가 *글자 그대로* 보인다.

```bash
default        via 10.10.3.15   dev ens18
10.10.3.0/24                    dev ens18 proto kernel scope link src 10.10.3.101
```

<br/>

### 각 필드의 의미 {#routing-table-fields}

| 필드           | 의미                                                           |
| -------------- | -------------------------------------------------------------- |
| `default`      | `0.0.0.0/0` — *그 외 모든 목적지*. 가장 넓은(짧은 prefix) 경로 |
| `via X`        | X를 **게이트웨이로 경유** (다른 단지)                          |
| (`via` 없음)   | **직접 전송** (같은 단지)                                      |
| `dev`          | 패킷이 나가는 인터페이스                                       |
| `proto kernel` | 커널이 IP 설정 시 *자동 생성*한 경로                           |
| `scope link`   | 이 경로는 *링크(같은 단지) 범위*에서 직접 도달                 |
| `src`          | 출발 IP (이 인터페이스의 주소)                                 |

<br/>

### 핵심 — 결정적 단어는 `via` {#routing-table-via-keyword}

> **`via`가 있으면 경유(다른 단지), 없으면 직접(같은 단지).**

위 예시에서:

- `default via 10.10.3.15` → *모르는 목적지 전부*를 게이트웨이 `10.10.3.15`로 경유 → **다른 단지**
- `10.10.3.0/24 dev ens18` → `via`가 없으니 같은 단지로 **직접 전송**

이게 진단 질문 1의 답이다. (a) 첫 줄이 "다른 단지 경유", 둘째 줄이 "같은 단지 직접". (b) 가르는 단어는 **`via`**.

<br/>

### Longest Prefix Match {#longest-prefix-match}

라우팅 테이블에 여러 줄이 있을 때, 커널은 **가장 구체적인(prefix가 가장 긴) 경로**를 우선 적용한다. 이를 *Longest Prefix Match*라 한다.

```bash
default           via 10.0.2.2   dev vmbr1                          # 0.0.0.0/0  (prefix 0, 가장 넓음)
10.0.2.0/24                      dev vmbr1   src 10.0.2.15          # prefix 24
10.10.3.0/24                     dev vmbr2   src 10.10.3.254        # prefix 24
192.168.10.0/24                  dev vmbr0   src 192.168.10.101     # prefix 24
```

이 Proxmox 노드가 **8.8.8.8**로 패킷을 보낸다면 —

1. `10.0.2.0/24`? 8.8.8.8은 안 맞음
2. `10.10.3.0/24`? 안 맞음
3. `192.168.10.0/24`? 안 맞음
4. → 어느 구체 경로에도 안 맞으니 **`default`에 걸림**

결과: 게이트웨이 `10.0.2.2`(VirtualBox NAT)를 거쳐 `vmbr1` 인터페이스로 나간다. 이게 진단 질문 2의 답이다.

## 03. 같은 8.8.8.8, 다른 게이트웨이 {#same-dest-different-gateway}

**같은 목적지라도, *어느 노드에서* 보내느냐에 따라 첫 게이트웨이가 다르다.**

| 출발 노드        | default 경로                       | 8.8.8.8의 첫 게이트웨이     |
| ---------------- | ---------------------------------- | --------------------------- |
| **Proxmox 노드** | `default via 10.0.2.2 dev vmbr1`   | `10.0.2.2` (VirtualBox NAT) |
| **Debian VM**    | `default via 10.10.3.15 dev ens18` | `10.10.3.15` (pfSense)      |

같은 `8.8.8.8`인데 첫 홉이 다르다.

> 라우팅은 *각 노드가 자기 라우팅 테이블만 보고* 독립적으로 결정하기 때문이다.

<br/>

**게이트웨이**는 *어느 노드의 관점에서* 묻느냐에 따라 달라지는 상대적 개념이다. **라우팅 테이블**은 그 머신이 _자기 관점에서_ "내가 패킷을 보낼 때 어디로?"를 적어둔 1인칭 메모다. VM마다 자기만의 테이블을 갖고, 자기 테이블만 바라본다.

각 노드는 *자기 default gateway*만 안다. Debian VM의 세계에서 "바깥으로 나가는 문"은 pfSense(`10.10.3.15`)이고, Proxmox 노드의 세계에서 그 문은 VirtualBox NAT(`10.0.2.2`)다. **목적지가 같아도, 출발 노드의 *첫 번째 문*이 다르면 첫 홉이 다르다.**

> Stage 0에서의 비유를 빌리면 아래와 같이 표현할 수 있다.
>
>> 입주민이 경비실에 택배를 맡겨. "이거 성북단지 ○○동으로 보내주세요." 경비실 입장에선 — 이 택배의 최종 수신자가 자기가 아니야. 성북단지 사람이지.
>>
>> - **ip_forward = 0인 경비실** = "이거 내 앞으로 온 거 아닌데?" 하고 택배를 그냥 버려. 성북단지로 안 가.
>> - **ip_forward = 1인 경비실** = "내 거 아니지만 난 경비니까 다음 단지로 넘겨야지" 하고 다음 경유지로 전달해.
>>
>> `ip_forward`는 "내 앞으로 온 게 아닌 물건을, 대신 받아서 다음으로 넘기는 일"을 허가하는 스위치이다. **경비실(게이트웨이)은 이게 _켜져 있어야(`1`)_** 경비실 노릇을 제대로 하는 반면, 일반 입주민(워크로드 VM)은 **_남의 택배를 전달할 이유(책임)이 없으니 꺼져 있는 게(`0`)_ 정상**이다.
>
> <br/>
> 
> **왜 일반 VM은 `0`이 안전한 _기본값_인가?**
>
> 보안 함의로 볼 수 있다.
>
> 일반 워크로드 VM이 `ip_forward=1`이 되면 ─ 그 VM이 '의도치 않더라도 라우터처럼 행동'하게 된다. 보통 라우터를 관리할 땐 의도적으로 망을 분리하고, zone을 나누어 방화벽 규칙을 다르게 적용하는 등의 방어 조치를 걸어놓는다. 그런데 라우터처럼 행동하는 VM이 어딘가에 계획 없이 등장하면, 공격자가 그 VM을 **네트워크 격리를 우회한 트래픽 경로로 악용**할 위험이 발생한다.

<br/>

진단 질문 3의 답은 이렇다. (a) Debian VM의 첫 게이트웨이는 `10.10.3.15`로, Proxmox 노드의 `10.0.2.2`와 *다르다*. (b) 각 노드의 라우팅 테이블(특히 default route)이 서로 다르기 때문이다.

> 개인 메모
>
>> - **중첩 VM**의 1인칭 메모: "모르는 데로 갈 땐 pfSense(10.10.3.15)한테 맡겨." → 중첩 가상화 환경의 라우팅은 pfSense가 전담하도록 네트워크 망을 구성했으니까.
>> - **Proxmox** 노드의 1인칭 메모: "모르는 데로 갈 땐 VirtualBox의 NAT(10.0.2.2)로 직접 나가." → 노드는 vNIC(NAT Network Adapter)에 vmbr1 브리지로 _직접_ 연결되어 있으니까.

## 04. ip_forward {#ip-forward}

`ip_forward`는 **목적지가 내 것이 아닌 남의 패킷을 _다른 인터페이스로_ 대신 전달해줄 것인가**를 결정한다.

호스트는 두 종류로 나뉜다:

- **종착지(endpoint):** 패킷의 최종 목적지. (e.g., 일반 워크로드 VM, 데스크탑, 웹서버 등.)
- **경유지(transit):** 패킷이 거쳐 가는 중간 나들목. (e.g., 라우터, 게이트웨이)

이 비유에서 `ip_forward`는 **"나는 경유지 역할도 하겠다"**를 선언하는 스위치이다.

<br/>

`/proc/sys/net/ipv4/ip_forward`는 *이 노드가 라우터처럼 행동할지*를 결정하는 단일 스위치다. _(DEB Linux에서 /etc/network/interfaces에서 postup hook으로 작성하는 부분이 이 파일을 가리킨다.)_

| 값  | 의미                                                                         |
| --- | ---------------------------------------------------------------------------- |
| `0` | 자기 목적지 패킷만 처리. *다른 호스트의 패킷을 전달하지 않음*                |
| `1` | 라우터처럼 동작. *자기 목적지가 아닌 패킷도* 다른 인터페이스로 전달(forward) |

```bash
# 현재 값 확인
cat /proc/sys/net/ipv4/ip_forward
sysctl net.ipv4.ip_forward

# 임시 변경 (재부팅 시 초기화)
sysctl -w net.ipv4.ip_forward=1

# 영속 변경
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p
```

pfSense 같은 라우터는 당연히 `1`이고, 일반 워크로드 VM은 `0`이다. *게이트웨이 역할을 하려면 반드시 `1`*이어야 한다.

<br/>

### 중요 — 브리지(스위칭)와 `ip_forward`(라우팅)는 다른 layer {#bridging-vs-routing-layers}

흔한 오해 — *"브리지에 IP를 줬으니 ip_forward도 켜야 통신되겠지."*

아니다. 둘은 **다른 일**을 한다.

- **브리지(L2 스위칭)**: 같은 단지 안의 MAC 기반 전달. **`ip_forward`와 무관하게 항상 동작.**
- **커널(L3 라우팅)**: 다른 단지로 패킷을 넘길 때. **`ip_forward=1`이어야 동작.**

같은 단지 통신은 브리지가 알아서 하므로 `ip_forward`가 `0`이어도 된다. **`ip_forward`는 *오직 단지 경계를 넘을 때만* 관여한다.**

## 05. /etc/network/interfaces ─ 영속적 네트워크 설정 {#persistent-network-config}

Debian 계열(Proxmox 포함)의 네트워크 영속 설정 파일이다. `ip` 명령으로 한 변경은 *재부팅 시 사라지지만*, 이 파일의 설정은 *부팅마다 적용*된다.

아래는 예제로써 구성한 세 브리지이다:

```ini
# host-only bridge
auto vmbr0
iface vmbr0 inet static
        address 192.168.10.101/24
        # gateway 192.168.10.1
        bridge-ports nic0
        bridge-stp off
        bridge-fd 0

# NAT bridge
auto vmbr1
iface vmbr1 inet static
        address 10.0.2.15/24
        gateway 10.0.2.2
        bridge-ports enp0s8
        bridge-stp off
        bridge-fd 0

# Internal NAT Bridge for VMs
#auto vmbr2
#iface vmbr2 inet static
#       address 10.10.3.15/24
#       bridge-ports none
#       bridge-stp off
#       bridge-fd 0
#       post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
#       post-up   iptables -t nat -A POSTROUTING -s '10.10.3.0/24' -o vmbr1 -j MASQUERADE
#       post-down iptables -t nat -D POSTROUTING -s '10.10.3.0/24' -o vmbr1 -j MASQUERADE

# L2 Bridge(VMNET)
auto vmbr2
iface vmbr2 inet static
        address 10.10.3.254/24
        bridge-ports none
        bridge-stp off
        bridge-fd 0
        post-up echo 1 > /proc/sys/net/ipv4/ip_forward
```

<br/>

### 키워드 해설 {#interfaces-keywords}

| 키워드                        | 의미                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| `auto <iface>`                | 부팅 시 *자동 활성화*. 없으면 수동으로 올려야 함                    |
| `iface <iface> inet <method>` | 인터페이스 정의 시작. `inet`=IPv4 (`inet6`=IPv6)                    |
| `address`                     | 고정 IP (CIDR 표기 가능)                                            |
| `gateway`                     | 이 인터페이스의 게이트웨이                                          |
| `bridge-ports`                | 이 브리지에 묶을 물리 인터페이스 (`none`이면 멤버 없는 내부 브리지) |
| `bridge-stp`                  | STP(Spanning Tree Protocol) on/off                                  |
| `bridge-fd`                   | forwarding delay (보통 `0`)                                         |
| `post-up`                     | 인터페이스 활성화 *후* 실행할 명령                                  |
| `post-down`                   | 인터페이스 비활성화 *후* 실행할 명령                                |
| `pre-up`                      | 인터페이스 활성화 *전* 실행항 명령                                  |
| `pre-down`                    | 인터페이스 비활성화 *전* 실행할 명령                                |

<br/>

### method — `static` vs `dhcp` vs `manual` {#interfaces-method-types}

method는 브리지에서 bridge-ports로 선언할 물리 인터페이스를 등록하는 부분에 작성되는 지점이다. 특히 `manual`이 중요한데, 브리지에 물릴 물리 NIC를 IP 없이 등록하는 자리이기 때문이다.

```bash
auto lo
iface lo inet loopback

# host-only adapter NIC
iface nic0 inet manual

# NAT adapter NIC
iface enp0s8 inet manual
```

| method   | 의미                      | 쓰임새                                                      |
| -------- | ------------------------- | ----------------------------------------------------------- |
| `static` | IP를 *직접 지정*          | 고정 IP가 필요한 서버·노드                                  |
| `dhcp`   | DHCP 서버에서 *자동 할당* | IP를 동적으로 받는 클라이언트                               |
| `manual` | IP를 *주지 않음*          | 브리지 멤버 포트, 또는 `post-up`으로 수동 제어할 인터페이스 |

`manual`이 헷갈리기 쉬운데 — ***IP가 없는 인터페이스***를 정의할 때 쓴다. 예를 들어 브리지에 물릴 물리 NIC 자체는 IP가 필요 없으므로(**IP는 브리지가 가짐**) `manual`로 둔다.

<br/>

### `post-up` — 활성화 후 훅(hook) {#interfaces-post-up-hook}

인터페이스가 올라온 *직후* 임의의 명령을 실행한다. 예: 특정 라우트 추가, 방화벽 규칙 적용 등. 선언적 설정으로 표현 못 하는 동작을 *절차적으로* 끼워 넣는 자리다.

```ini
iface vmbr2 inet static
    address 10.10.3.254/24
    bridge-ports none
    post-up echo 1 > /proc/sys/net/ipv4/ip_forward
```

<br/>

예시 코드에서 지워놓은 브리지(#vmbr2)를 보면, `post-up`과 `post-down`이 짝을 이루고 있다. 여기서 활성화/비활성화의 기준이 되는 인터페이스는 **vmbr2 자체**이며, 각각 vmbr2 브리지를 올린 뒤 NAT 규칙을 추가하고, 브리지를 내린 뒤 해당 NAT 규칙을 제거하는 명령이다.

```ini
post-up   iptables -t nat -A POSTROUTING -s '10.10.3.0/24' -o vmbr1 -j MASQUERADE
post-down iptables -t nat -D POSTROUTING -s '10.10.3.0/24' -o vmbr1 -j MASQUERADE
```

## 06. systemd Predictable Interface Names ─ `.link` 파일 {#predictable-interface-names}

### 필요 ─ `eth0`의 문제 {#why-eth0-problem}

예전 리눅스는 NIC를 `eth0`, `eth1`… 순으로 명명했다. 문제는 — 이 번호가 **부팅 시 드라이버 로드 순서에 따라 바뀔 수 있다**는 것.

NIC가 두 개 이상이면 *어느 것이 `eth0`이 될지 부팅마다 달라질* 수 있어, 방화벽 규칙이나 브리지 설정이 *엉뚱한 NIC에 적용*되는 사고가 났다.

<br/>

### 해결 ─ 물리 위치 기반의 예측 가능한 이름 {#location-based-naming}

systemd는 NIC의 *물리적 위치*를 이름에 박아 *부팅과 무관하게 고정*되도록 했다. 이를 **Predictable Network Interface Names**라 한다.

| 접두/패턴  | 의미                                  | 예시                          |
| ---------- | ------------------------------------- | ----------------------------- |
| `en`       | Ethernet                              | (모든 유선의 시작)            |
| `eno1`     | 온보드(onboard) 장치 인덱스           | 메인보드 내장 NIC             |
| `ens3`     | PCI Express hotplug **slot** 인덱스   | `ens18` (Proxmox VM에서 흔함) |
| `enp0s3`   | PCI 물리 위치 (**p**=bus, **s**=slot) | bus 0, slot 3                 |
| `enx<MAC>` | MAC 주소 기반                         | `enxaabbccddeeff`             |

Proxmox VM에서 자주 보이는 `ens18`은 *PCI slot 18*에 연결된 가상 NIC라는 뜻이다. 부팅마다 같은 slot이면 같은 이름이 보장된다.

<br/>

### .link 파일로 이름 직접 바꾸기 {#renaming-with-link-file}

예측 가능한 이름도 `ens18`처럼 *의미가 안 와닿을* 때가 있다. 이럴 때 `.link` 파일로 *원하는 이름*을 줄 수 있다.

`/etc/systemd/network/10-wan.link`:

```ini
[Match]
MACAddress=aa:bb:cc:dd:ee:ff

[Link]
Name=wan0
```

- `[Match]`: 어떤 NIC에 적용할지의 *조건* (MAC, 드라이버, 경로 등)
- `[Link] Name`: 부여할 새 이름
- 파일명의 숫자 접두(`10-`, `20-`)는 *적용 우선순위*. 작을수록 먼저 평가

이렇게 하면 `ens18`을 `wan0`, `lan0`처럼 *역할이 드러나는 이름*으로 바꿔, 설정 파일의 가독성을 높일 수 있다. 적용 후에는 `initramfs` 갱신(`update-initramfs -u`)과 재부팅이 필요하다. ([systemd.link 공식 문서](https://www.freedesktop.org/software/systemd/man/latest/systemd.link.html) · [Predictable Network Interface Names](https://systemd.io/PREDICTABLE_INTERFACE_NAMES/))

## 07. 브리지와 커널의 분업 {#bridge-kernel-division}

진단 질문 4의 빈칸을 채우면, Stage 1의 핵심이 한 문장으로 압축된다.

> 브리지는 항상 **스위칭(switching)** 을 하고, 패킷이 브리지를 넘어 다른 단지로 갈 때만 **커널**이 기능(`ip_forward`)으로 라우팅한다. 그리고 같은 단지든 다른 단지든 패킷은 똑같이 **캡슐화**되며, 차이는 프레임의 **목적지 MAC(dst MAC)** 뿐이다.

**브리지(L2)와 커널 라우팅(L3)이 *서로 다른 layer에서 서로 다른 책임*을 진다는 것 —** <br/>이 한 문장을 풀어보면:

1. **브리지 = 항상 스위칭** — 브리지는 L2 장비다. MAC 기반으로 같은 단지 안에서 프레임을 전달한다. *이건 언제나 일어난다*.
2. **커널 = 다른 단지일 때만 라우팅** — 단지 경계를 넘을 때만 커널의 L3 라우팅(`ip_forward=1`)이 관여한다.
3. **캡슐화는 동일** — 같은 단지든 다른 단지든, 패킷은 똑같이 L2 프레임으로 감싸진다(Stage 0의 캡슐화).
4. **차이는 dst MAC뿐** — 같은 단지면 *상대의 MAC*, 다른 단지면 *게이트웨이의 MAC*. 이게 Stage 0에서 배운 "MAC은 홉마다 바뀐다"의 실체다.

---

## 부록 A. 핵심 어휘 빠른 참조 {#appendix-glossary}

| 용어                        | 한 줄 정의                                               |
| --------------------------- | -------------------------------------------------------- |
| `ip` (iproute2)             | 현대 리눅스 네트워크 통합 도구 (ifconfig/route/arp 대체) |
| Routing Table               | "어디로 보낼지"의 결정표                                 |
| `via`                       | 게이트웨이 경유를 표시하는 결정적 키워드                 |
| Longest Prefix Match        | 가장 구체적인(긴 prefix) 경로를 우선 적용하는 규칙       |
| `proto kernel`              | 커널이 IP 설정 시 자동 생성한 경로                       |
| `scope link`                | 같은 링크(단지)에서 직접 도달 가능한 범위                |
| `ip_forward`                | 노드를 라우터로 만드는 커널 스위치                       |
| `/etc/network/interfaces`   | Debian 계열 영속 네트워크 설정 파일                      |
| `manual` (method)           | IP를 주지 않는 인터페이스 정의 (브리지 멤버 등)          |
| Predictable Interface Names | 물리 위치 기반의 고정 NIC 이름 (ens18 등)                |
| `.link` 파일                | NIC 이름을 원하는 값으로 바꾸는 systemd 설정             |

---

## 부록 B. 명령어 빠른 참조 {#appendix-commands}

```bash
# === 상태 보기 ===
ip a                              # IP 주소
ip r                              # 라우팅 테이블
ip n                              # ARP 캐시
ip link                           # 인터페이스 L2 정보

# === 임시 조작 (재부팅 시 사라짐) ===
ip addr add 10.10.3.50/24 dev ens18      # IP 추가
ip route add 10.20.0.0/24 via 10.10.3.1  # 경로 추가
ip link set ens18 up                      # 인터페이스 활성화

# === ip_forward ===
sysctl net.ipv4.ip_forward                # 확인
sysctl -w net.ipv4.ip_forward=1           # 임시 켜기

# === 영속 설정 ===
# /etc/network/interfaces 편집 후
ifreload -a                       # (ifupdown2, Proxmox) 설정 재적용
systemctl restart networking      # (전통적 ifupdown)
```

---

## 개인 노트 {#personal-notes}

### 미완·심화로 가는 길 {#further-study}

- **`nftables` / `iptables`** — 방화벽과 NAT (Stage 2의 주제)
- **policy routing** — 여러 라우팅 테이블, `ip rule`로 출발지 기반 라우팅
- **ifupdown2** — Proxmox가 쓰는 현대 `interfaces` 관리자 (`ifreload`)
- **`ip -s`, `ss`** — 통계와 소켓 상태 관찰
- **VLAN 인터페이스** — `ip link add link ens18 name ens18.10 type vlan id 10`

### 자기 점검 — 진단 질문 재방문 {#self-check-revisit}

이 노트를 읽은 뒤 진단 질문에 *네 말로* 답해보면 학습 완성도를 측정할 수 있다.

1. **라우팅 테이블 두 줄 중 직접/경유 구분과 결정적 단어** → [02. 라우팅 테이블 읽는 법](#reading-routing-table)
2. **Proxmox 노드가 8.8.8.8로 보낼 때 걸리는 줄과 경로** → [Longest Prefix Match](#longest-prefix-match)
3. **같은 8.8.8.8인데 Debian VM과 Proxmox의 게이트웨이가 다른 이유** → [03. 같은 8.8.8.8, 다른 게이트웨이](#same-dest-different-gateway)
4. **브리지·커널·캡슐화·dst MAC 한 줄 요약** → [07. 브리지와 커널의 분업](#bridge-kernel-division)

각 질문에 막힘없이 답할 수 있다면 Stage 1은 졸업이다. 다음 [Stage 2: netfilter와 방화벽](./03-stage-2)에서 이 토대 위에 *패킷을 거르고 변환하는* 계층을 얹는다.
