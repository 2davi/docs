---
title: "클러스터 구성"
date: 2026-04-08
lastmod: 2026-04-16
author: "Davi"
description: "pvecm으로 3노드 클러스터를 구성하고 Corosync·Quorum 동작 원리, 네트워크 품질 진단까지 다룬다."
slug: "cluster-setup"
section: "notes"
category: "proxmox/setup"
tags: [proxmox, cluster, corosync, quorum, pvecm, split-brain, fencing, knet, omping]
order: 2
series: "Proxmox VE 학습 시리즈"
series_order: 2
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목          | 내용                                                   |
| ------------- | ------------------------------------------------------ |
| 클러스터명    | test                                                   |
| 노드 수       | 3 (`pve` / `pve-ksy` / `kcy0122`)                      |
| 네트워크 대역 | 10.10.250.0/24 (NAT Network, GW 10.10.250.1)           |
| 가상화 플랫폼 | Oracle VirtualBox 7.1.14 — 물리 PC 3대에 각각 1개 노드 |
| 선행 문서     | `01-setup/01-installation.md`                          |

---

## 1. Proxmox 클러스터 아키텍처

### 1.1 구성 요소

Proxmox 클러스터는 세 레이어로 구성된다.

| 레이어              | 컴포넌트     | 역할                                                                                           |
| ------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| 합의(Consensus)     | **Corosync** | 노드 간 메시지 전달, 멤버십 관리, 쿼럼(Quorum) 유지                                            |
| 클러스터 파일시스템 | **pmxcfs**   | `/etc/pve/` 디렉토리를 모든 노드에 실시간으로 동기화하는 분산 파일시스템. Corosync 위에서 동작 |
| 관리 CLI            | **pvecm**    | 클러스터 생성·참여·조회를 수행하는 Proxmox 전용 래퍼(Wrapper)                                  |

`pvecm`이 Corosync를 직접 조작하는 것이 아니다. `pvecm create`는 Corosync 설정 파일 생성, pmxcfs 초기화, 인증 키 배포를 한 번에 처리하는 편의 도구다.

### 1.2 pmxcfs와 `/etc/pve/`

`/etc/pve/`는 클러스터 전체 설정의 단일 진실 공급원(Single Source of Truth)이다. VM 설정 파일(`qemu-server/<VMID>.conf`), 스토리지 설정(`storage.cfg`), HA 규칙, 사용자 및 ACL 정보가 여기에 저장된다.

pmxcfs는 이 디렉토리를 **모든 노드에 실시간으로 복제**한다. 노드 A에서 VM 설정을 변경하면 노드 B·C에서도 즉시 반영된다. 별도의 데이터베이스 서버나 NFS 공유 없이 일관성이 유지되는 이유가 바로 pmxcfs 덕분이다.

단, pmxcfs는 **쿼럼이 있을 때만 쓰기가 허용**된다. 쿼럼 붕괴 시 읽기는 가능하지만 설정 변경은 차단된다.

---

## 2. Corosync 통신 레이어

### 2.1 knet (Kronosnet)

Proxmox 7 이후 Corosync의 기본 transport는 `knet`(Kronosnet)이다. 기존 `udp`/`udpu` transport와의 차이:

| 항목         | `udp`/`udpu`     | `knet`                   |
| ------------ | ---------------- | ------------------------ |
| 암호화       | 없음 (선택 옵션) | 기본 활성화 (AES-256)    |
| 압축         | 없음             | 지원                     |
| 멀티링       | 최대 2개         | 최대 8개                 |
| 프로토콜     | UDP 고정         | UDP·TCP·SCTP 선택 가능   |
| 자동 링 전환 | 없음             | 링 장애 시 자동 페일오버 |

knet은 단일 링(링크) 장애 시 다른 링으로 자동 전환되므로 네트워크 장애에 더 강건하다. 다만 knet은 내부적으로 UDP를 기본으로 사용하기 때문에, 멀티캐스트 라우팅 문제나 방화벽 설정이 knet 통신을 방해할 수 있다.

### 2.2 Corosync 통신 포트

| 프로토콜 | 포트 | 용도                |
| -------- | ---- | ------------------- |
| UDP      | 5404 | Corosync 멀티캐스트 |
| UDP      | 5405 | Corosync 유니캐스트 |
| TCP      | 2224 | pacemaker (사용 시) |

클러스터 노드 간 방화벽이 있다면 위 포트를 허용해야 한다.

---

## 3. VirtualBox 환경 사전 준비

### 3.1 NAT → NAT Network 전환

NAT 모드는 VirtualBox가 각 VM에 독립된 가상 라우터를 제공하므로 VM 간 직접 통신이 불가능하다. Corosync는 노드 간 직접 통신이 필요하므로 **NAT Network 모드**로 변경해야 한다.

VirtualBox 메뉴 `File → Tools → Network Manager → NAT Networks → Create`:

```markdown
이름: ProxmoxNet
CIDR: 10.10.250.0/24
DHCP 활성화: 해제 (정적 IP 사용)
```

각 VirtualBox VM 설정 `Network → Adapter 1`:

- **Attached to:** NAT Network
- **Name:** ProxmoxNet

NAT Network로 전환 후 각 노드의 `/etc/network/interfaces`에서 IP를 새 대역으로 수정한다:

| 노드    | IP               |
| ------- | ---------------- |
| pve     | 10.10.250.115/24 |
| pve-ksy | 10.10.250.117/24 |
| kcy0122 | 10.10.250.119/24 |

### 3.2 `/etc/hosts` 등록

Proxmox 클러스터는 노드 간 통신에 IP가 아닌 **hostname을 사용**하는 경우가 있다(ZFS Replication의 SSH 연결 등). 세 노드 모두 동일한 `/etc/hosts`를 유지해야 한다.

```bash
# /etc/hosts — 세 노드 전부에 동일하게 적용
127.0.0.1 localhost.localdomain localhost

# Cluster Nodes
10.10.250.115 pve.proxmox.letech.kr     pve
10.10.250.117 pve-ksy.proxmox.letech.kr pve-ksy
10.10.250.119 kcy0122.proxmox.letech.kr kcy0122
```

> `/etc/hosts` 미등록 시 증상: ZFS Replication이 `SYNCING` 상태에서 무한 대기하거나, `pvesr`이 아무 로그도 출력하지 않는다. 의심될 때는 `ssh root@<노드명>` 으로 hostname 해석 가능 여부를 먼저 확인한다.

---

## 4. 클러스터 생성 및 노드 참여

### 4.1 클러스터 생성 (첫 번째 노드에서 실행)

```bash
# pve 노드 (10.10.250.115)에서 실행
pvecm create test
# "test"라는 이름의 클러스터를 생성하고 이 노드를 첫 번째 멤버로 등록

pvecm status
# → Expected votes: 1 / Quorum: 1 으로 단일 노드 클러스터 상태 확인
```

`pvecm create`는 내부적으로 다음을 수행한다:

1. `/etc/corosync/corosync.conf` 생성
2. 클러스터 인증 키(`/etc/corosync/authkey`) 생성
3. pmxcfs 초기화 및 `/etc/pve/` 동기화 시작
4. corosync 데몬 재시작

### 4.2 노드 참여 (나머지 노드에서 실행)

```bash
# pve-ksy 노드 (10.10.250.117)에서 실행
pvecm add 10.10.250.115
# 기존 클러스터 멤버(pve)의 IP를 지정하여 참여 요청
# 패스워드 확인 후 인증 키와 corosync.conf가 자동으로 복사됨

# kcy0122 노드 (10.10.250.119)에서 실행
pvecm add 10.10.250.115
```

> `pvecm add` 실행 전에 참여할 노드의 pmxcfs가 비어있어야 한다. 이미 다른 클러스터에 참여한 이력이 있다면 클러스터를 탈퇴 처리한 후 진행해야 한다.

### 4.3 클러스터 구성 확인

```bash
pvecm status

# 출력 예시
# Cluster information
# -------------------
# Name:             test
# Config Version:   3
# Transport:        knet
# Secure auth:      on         ← knet 암호화 활성화 상태
#
# Quorum information
# ------------------
# Nodes:            3
# Node ID:          0x00000003
# Quorum:           2          ← 정족수: 2표 이상 필요
# Flags:            Quorate    ← 현재 정족수 충족 상태
#
# Membership information
# ----------------------
# Nodeid      Votes Name
# 0x00000001    1   pve
# 0x00000002    1   pve-ksy
# 0x00000003    1   kcy0122 (local)

pvecm nodes
# 클러스터 멤버 노드 목록 출력
```

---

## 5. Quorum 원리와 Split-brain

### 5.1 Quorum(쿼럼) 계산

Quorum(정족수)은 클러스터가 정상적으로 운영되기 위해 충족해야 하는 최소 투표 수다. Proxmox는 기본적으로 각 노드에 1표씩 부여하며, 정족수는 **전체 투표 수의 과반수**다.

| 노드 수 | 전체 투표 | 정족수(Quorum) | 허용 장애 노드 수 |
| ------- | --------- | -------------- | ----------------- |
| 1       | 1         | 1              | 0                 |
| 2       | 2         | 2              | 0                 |
| 3       | 3         | 2              | **1**             |
| 4       | 4         | 3              | 1                 |
| 5       | 5         | 3              | **2**             |

3노드 클러스터에서 1개 노드가 다운되어도 남은 2개 노드가 쿼럼(2표)을 충족하므로 클러스터가 계속 운영된다.

**2노드 클러스터가 위험한 이유:** 노드 1개가 다운되면 남은 1개 노드는 쿼럼(2표)을 충족하지 못한다. 클러스터 전체가 읽기 전용으로 전환되어 VM 기동·설정 변경 등 모든 쓰기 작업이 불가능해진다. 운영 환경에서 최소 3노드를 권장하는 이유다.

### 5.2 Split-brain

**Split-brain**은 클러스터가 네트워크 파티션으로 인해 두 개 이상의 독립된 파티션으로 분리되는 현상이다. 각 파티션이 서로의 상태를 모르는 채로 쿼럼을 충족했다고 판단하면, 양쪽에서 동시에 동일한 VM을 기동하거나 스토리지에 쓰기를 시도하여 데이터 손상이 발생한다.

Quorum 메커니즘은 split-brain을 예방하기 위해 존재한다. 쿼럼을 충족한 파티션만 쓰기 작업을 허용하고, 충족하지 못한 파티션은 스스로 비활성화된다.

3노드 클러스터에서 네트워크 파티션이 2-1로 분리되면:

- 2노드 파티션 → 쿼럼(2표) 충족 → 정상 운영
- 1노드 파티션 → 쿼럼 미충족 → 읽기 전용 전환

이 동작이 자동으로 이루어지기 때문에 어느 파티션이 "살아남을지"가 결정된다.

### 5.3 Fencing

Fencing은 **장애 노드를 클러스터에서 강제로 격리**하는 메커니즘이다. 단순히 논리적으로 제거하는 것이 아니라, 물리적으로 전원을 차단하거나 네트워크를 끊어서 해당 노드가 스토리지나 네트워크에 더 이상 접근하지 못하도록 막는다.

Fencing이 필요한 이유: 쿼럼을 잃은 노드가 스스로 비활성화되어야 하지만, OS 패닉(Kernel Panic)이나 데몬 행(Hang) 상태에서는 노드가 스스로를 정지시킬 수 없다. 이 경우 살아남은 파티션이 장애 노드를 강제로 끄지 않으면 split-brain 상태가 지속된다.

Proxmox HA의 Fencing은 다음 수단을 지원한다:

- **Hardware Watchdog:** IPMI/iDRAC를 통한 원격 전원 제어 (권장)
- **Watchdog:** 소프트웨어 워치독 타이머. 타임아웃 시 커널 패닉 유도 후 재부팅
- **QEMU Watchdog:** VM 레벨 워치독

> VirtualBox 중첩 환경에서는 하드웨어 Fencing을 구성할 수 없다. 학습 환경에서는 워치독 기반으로 동작하며, 실제 프로덕션에서는 반드시 IPMI/iDRAC 기반 Fencing을 구성해야 HA가 의미를 갖는다.

---

## 6. 클러스터 상태 명령어

```bash
# 클러스터 전체 개요
pvecm status

# 노드 목록 및 투표 상태
pvecm nodes

# HA 서비스 상태
ha-manager status

# 클러스터 리소스 전체 목록 (모든 노드의 VM/CT)
pvesh get /cluster/resources

# pmxcfs 동기화 상태 (로그)
journalctl -t pmxcfs -f

# Corosync 링 상태
corosync-cfgtool -s
```

### `pvecm status` 출력 해석

```log
Quorum information
------------------
Nodes:            3           ← 클러스터에 참여 중인 노드 수
Expected votes:   3           ← 정상 상태 기대 투표 수 (= 전체 노드 수)
Total votes:      3           ← 현재 실제 투표 수
Quorum:           2           ← 정족수 (= floor(Expected/2) + 1)
Flags:            Quorate     ← Quorate = 쿼럼 충족 / No-Quorate = 미충족
```

`Total votes < Quorum`이 되는 순간 `Flags`에서 `Quorate`가 사라지고 클러스터는 읽기 전용으로 전환된다.

---

## 7. 네트워크 품질 진단 — omping

### 7.1 왜 일반 ping이 부족한가

Corosync는 노드 간 상태 동기화에 **UDP 유니캐스트**와 **UDP 멀티캐스트**를 혼용한다. 일반 ICMP `ping`은 L3 단순 연결성만 확인하며 UDP 멀티캐스트 라우팅 문제나 L2 스위치의 IGMP Snooping 오작동을 감지하지 못한다.

`omping`은 Corosync 실제 통신과 유사한 형태로 UDP 유니캐스트·멀티캐스트 패킷을 대량으로 전송하여 **부하 상황에서의 패킷 손실과 지연 폭증**을 측정한다.

```bash
apt install -y omping
```

### 7.2 진단 사례: 마이그레이션 중 노드 다운

**발생 상황:** VM 301을 `kcy0122` 노드로 마이그레이션 시도 중, 타겟 노드가 강제 재부팅되며 클러스터 쿼럼이 붕괴됨.

**표면적 에러 로그:**

```log
corosync[1003]: [KNET] link: host: 1 link: 0 is down
VM is locked (migrate)
corosync token timed out
```

**omping 부하 테스트:**

```bash
# 10,000개 패킷, 간격 1ms, 부하 집중 모드(-F)
# pve-ksy(.117)에서 pve(.115) 방향
omping -c 10000 -i 0.001 -F -q 10.10.250.117 10.10.250.115

# kcy0122(.119)에서 pve(.115) 방향
omping -c 10000 -i 0.001 -F -q 10.10.250.119 10.10.250.115

# kcy0122(.119)에서 pve-ksy(.117) 방향 (대조군)
omping -c 10000 -i 0.001 -F -q 10.10.250.119 10.10.250.117
```

**결과:**

| 방향            | 유니캐스트 손실 | 멀티캐스트 손실 | 최대 지연 |
| --------------- | --------------- | --------------- | --------- |
| `.117` → `.115` | 1%              | **100%**        | 200ms     |
| `.119` → `.115` | 2%              | **100%**        | 122ms     |
| `.119` → `.117` | 0%              | 0%              | 19ms      |

### 7.3 원인 분석

**멀티캐스트 100% 손실 (pve .115 방향):**

`pve` 노드(10.10.250.115)로 향하는 멀티캐스트 패킷이 전면 차단되고 있다. 원인 후보:

- 해당 노드의 방화벽이 멀티캐스트 대역(`224.0.0.0/4`)을 드롭
- 물리 스위치의 IGMP Snooping이 해당 포트를 멀티캐스트 그룹 멤버로 인식하지 못함
- VirtualBox NAT Network 내부의 멀티캐스트 라우팅 제한

**유니캐스트 지연 폭증 및 손실:**

LAN 환경에서 최대 200ms 지연과 1~2% 패킷 손실은 심각한 수준이다. 정상 LAN 환경의 기대값은 1ms 미만이다.

**장애 메커니즘:**

네트워크 품질이 저하된 상태에서 마이그레이션 트래픽이 대역폭을 포화시키면, Corosync Heartbeat 패킷이 트래픽 정체에 갇혀 Token Timeout이 발생한다. 클러스터는 해당 노드의 생존 신호를 읽지 못하고 Fencing을 트리거하여 노드를 강제 재부팅한다.

> 근본 원인은 VirtualBox NAT Network 환경의 멀티캐스트 라우팅 제한과 가상 네트워크 레이어의 성능 한계다. 물리 장비 기반의 실제 클러스터 환경에서는 발생하지 않는다.

---

## 8. 트러블슈팅

<DocEmbed
  src="notes/linux/proxmox/06-references/07-troubleshooting.md"
  anchor="_8-1-부팅-로그에서-정상-노이즈-구분하기"
  title="부팅 노이즈 판독 / Corosync 타임아웃 / 커널 패닉 / KNET 튜닝 / config_version 불일치"
/>

<DocEmbed
  src="notes/linux/proxmox/06-references/07-troubleshooting.md"
  anchor="_8-2-corosync-totem-링과-노드-downout-상태-머신"
  title="부팅 노이즈 판독 / Corosync 타임아웃 / 커널 패닉 / KNET 튜닝 / config_version 불일치"
/>

<DocEmbed
  src="notes/linux/proxmox/06-references/07-troubleshooting.md"
  anchor="_8-3-커널-패닉-중첩-가상화의-메모리-맵핑-붕괴"
  title="부팅 노이즈 판독 / Corosync 타임아웃 / 커널 패닉 / KNET 튜닝 / config_version 불일치"
/>

<DocEmbed
  src="notes/linux/proxmox/06-references/07-troubleshooting.md"
  anchor="_8-4-그-외-로그-항목-해석"
  title="부팅 노이즈 판독 / Corosync 타임아웃 / 커널 패닉 / KNET 튜닝 / config_version 불일치"
/>

---

## 부록: 검증 체크리스트

```bash
# 클러스터 구성 확인
pvecm status          # Flags: Quorate 확인, Total votes = 3 확인
pvecm nodes           # 3개 노드 모두 표시 확인

# pmxcfs 동기화 확인 (노드 A에서 변경 → 노드 B에서 즉시 반영)
# A 노드에서:
touch /etc/pve/test-sync-check
# B 노드에서:
ls /etc/pve/test-sync-check   # 파일이 보이면 pmxcfs 동기화 정상
# 확인 후 삭제:
rm /etc/pve/test-sync-check

# Corosync 링 상태
corosync-cfgtool -s   # ring0_connected: 1 확인

# 네트워크 품질 (노드 간)
omping -c 1000 -i 0.001 -F -q <노드A_IP> <노드B_IP>
# 유니캐스트 loss < 0.1%, avg latency < 5ms 이면 정상

# HA 서비스 상태
ha-manager status     # quorum OK, master 노드 active 확인
```
