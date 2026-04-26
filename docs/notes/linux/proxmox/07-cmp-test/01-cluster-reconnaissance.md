---
title: "01. 클러스터 정찰 — 5노드 동기성과 정족수의 지속 검증"
date: 2026-04-23
lastmod: 2026-04-23
author: "Davi"
description: "5노드 Proxmox 클러스터의 정족수·코로싱크 링·pmxcfs 동기 상태를 5노드 동시 비교 관점에서 점검하는 절차서. 정상 베이스라인 확립과 비정상 패턴 카탈로그를 제공한다."
slug: "cluster-reconnaissance"
section: "notes"
category: "linux/proxmox/cmp-test"
tags: [proxmox, cluster, corosync, pmxcfs, quorum, knet, ring, recon]
order: 1
series: "CMP Pre-Test Reconnaissance Handbook"
series_order: 1
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1.1"
---

## 0. 이 챕터의 정찰 목적

CMP가 5노드 어떤 노드의 어떤 자원에 작업을 던지더라도, 그 작업의 성공·실패 판정은 **클러스터가 그 시점에 정족수를 유지하고 있다**는 전제 위에서만 의미를 갖는다. 정족수가 깨진 클러스터는 `/etc/pve` 쓰기가 막히고, CMP API 호출이 무응답·timeout·"cluster not ready" 형태로 떨어진다. 이때 발생한 결함을 CMP의 결함으로 분류하면 잘못된 보고서가 된다. 환경의 결함이기 때문이다.

따라서 본 챕터는 다음 세 가지 산출물을 만든다.

1. **5노드 클러스터의 정상 동기 베이스라인**: 본 챕터에 박힌 출력을 "이 환경의 정상"으로 간주하는 기준점. 이후 정찰에서 출력이 본 베이스라인과 어긋나면 즉시 의심 신호로 본다.
2. **비정상 출력 패턴 카탈로그**: 즉각 인식 가능해야 하는 신호들의 모음.
3. **다른 챕터로의 인계 항목**: 본 챕터에서 발견되었으나 본 영역의 범위를 넘는 사실들.

본 챕터는 챕터 00에서 식별된 두 위험 신호를 직접 받아 처리한다.

- 챕터 00 §2.3에서 등록된 **corosync ring1 + storage 평면 공유 위험**
- 챕터 00 §2.4 [해소]에서 단방향 정비된 채 남은 **`/etc/hosts` 비대칭**

---

## 1. 개념 — 본문을 읽기 위한 최소한의 배경

### 1.1 클러스터·정족수·Quorate

Proxmox 클러스터는 단순히 "여러 PVE 노드가 같은 도메인에 묶여 있는 것"이 아니라, **합의(Consensus) 알고리즘으로 묶인 분산 시스템**이다. 이 합의의 핵심 규칙이 정족수(Quorum)다.

5노드 클러스터에서 각 노드는 기본 1표(`quorum_votes: 1`)를 갖는다. 합의가 성립하려면 과반(majority) 표가 살아 있어야 한다. 5표 기준 과반은 3이므로, 정족수는 3이다. 어떤 시점에 5노드 중 3노드 이상이 서로 통신 가능하면 클러스터는 **Quorate** 상태이며 정상 동작한다.

3노드 미만의 통신만 가능해지면 클러스터는 **Quorate 상실** 상태가 되고, 이 시점부터 `/etc/pve`가 read-only 락업된다. VM 생성·삭제·구성 변경 같은 모든 쓰기 작업이 차단된다. 이는 split-brain 상황에서 두 그룹이 동시에 같은 자원을 변경하여 데이터를 손상시키는 사고를 막기 위한 안전장치다.

5노드 클러스터의 정족수 관점:

| 살아있는 노드 수 | Quorate? | 영향                                       |
| ---------------- | -------- | ------------------------------------------ |
| 5                | Yes      | 정상 동작                                  |
| 4                | Yes      | 정상 동작 (1노드 손실 허용)                |
| 3                | Yes      | **임계** — 한 노드만 더 빠지면 정족수 손실 |
| 2                | No       | `/etc/pve` 락업, CMP API 무응답            |
| 1                | No       | 위와 동일                                  |

3노드 클러스터(가장 흔한 운영 구성)와 비교하면 5노드는 1노드 추가 손실까지 견딘다. 그만큼 가용성이 높지만, 동시에 **3노드 이하로 떨어지지 않게 유지하는 책임**이 더 무겁다. 본 챕터의 정찰 절차가 매주 반복되어야 하는 이유다.

### 1.2 Corosync·KNET·링과 링크

정족수를 판단하려면 노드끼리 살아있다는 신호를 주고받아야 한다. 이 신호 교환을 담당하는 소프트웨어가 **Corosync**다.

Corosync는 KNET이라는 전송 계층을 사용하여 토큰(Token)이라는 작은 패킷을 노드 간에 회람시킨다. 기본 타임아웃은 1초(상위 데몬 설정에 따라 3~10초로 늘어나기도 함). 토큰이 제때 회람되지 않으면 해당 노드는 "통신 불능"으로 간주된다.

- **링(Ring)**: 토큰이 흐르는 가상 경로. 하나의 클러스터에 여러 링을 둘 수 있다.
- **링크(Link)**: 링이 실제로 사용하는 물리/논리 네트워크 경로. corosync.conf의 `ring0_addr`, `ring1_addr`로 정의된다.
- **`link_mode`**: 다중 링이 있을 때 동작 방식. `passive`는 ring0만 평시 사용, ring0 장애 시 ring1로 fallback. `active`는 동시에 사용. `rr`(round-robin)도 있음.

본 클러스터는 ring0 + ring1 = 2링 구성에 `link_mode: passive`다. ring0가 살아있는 한 ring1은 backup으로 대기한다(챕터 00 §2.3에서 확립).

### 1.3 pmxcfs와 그 동기화 메커니즘

`/etc/pve` 디렉토리는 일반 디스크 위 디렉토리가 아니라 **pmxcfs(Proxmox Cluster File System)**라는 전용 분산 파일시스템이다. FUSE로 마운트되며, corosync 위에서 동작하는 동기화 메커니즘으로 5노드의 동일 디렉토리가 **실시간 동기화**된다.

한 노드에서 `/etc/pve/storage.cfg`를 수정하면 그 변경이 즉시 다른 4노드에 전파된다. 동기화 단위는 파일이며, 동기화 트리거는 파일 atomic write(`mv` 또는 `>` redirection)다.

pmxcfs는 다음 두 조건이 모두 만족되어야 쓰기가 가능하다.

1. 클러스터가 Quorate 상태일 것
2. 자신이 정족수에 포함된 분파(partition)에 있을 것

두 조건 중 하나라도 깨지면 `/etc/pve`는 read-only로 마운트 옵션이 자동 변경된다. 이 시점부터 모든 쓰기 시도가 `EROFS` 에러로 실패한다.

### 1.4 Ring ID와 멤버십 변천

Corosync는 클러스터 멤버십이 바뀔 때마다 새로운 **Ring ID**를 발급한다. Ring ID는 `<seq>.<gen>` 형식이며 `gen`은 매 멤버십 변경마다 1씩 증가한다.

본 클러스터의 Ring ID는 `1.11b`다. `0x11b = 283`이므로, 이 클러스터가 셋업 이후 **283번의 멤버십 변경 이벤트**를 겪었다는 뜻이다. 49일 간 283회 = 약 4시간에 1회. 노드 reboot, 네트워크 깜빡임, fence 등이 모두 멤버십 변경으로 카운트되므로, 이 정도 빈도는 활발하게 사용되는 클러스터에서 정상 범위다.

새로운 Ring ID가 1초 미만 간격으로 연속 발급된다면 **링 플래핑(Ring Flapping)** 신호다. 이 패턴은 §3에서 다룬다.

### 1.5 HA 매니저의 위치

HA(High Availability) 매니저는 corosync·pmxcfs 위에 얹혀 있는 별개 데몬이다. 클러스터 정족수 정보를 받아서 자기가 관리하는 자원(VM/CT)을 어느 노드에서 실행할지 결정한다.

본 챕터는 HA의 자원 운영을 직접 다루지 않지만, **HA 매스터 노드가 누구이며, 어떤 자원을 어떤 노드에 분산하고 있는지**를 클러스터 동기 상태의 한 단면으로 본다. 자원 단위 운영은 챕터 06(가상 자원 인벤토리)에서 다룬다.

---

## 2. 정찰 명령과 출력 해석

본 절의 모든 출력은 **2026-04-23 16:30:09~16:30:21(KST)** 사이에 5노드에서 일괄 수집되었다. 12초 윈도우 안에 5노드가 모두 응답한 결과이므로, 같은 클러스터 시점의 5각도 사진이라 봐도 된다.

### 2.1 5노드 동시 정족수 비교 (`pvecm status`)

각 노드에서 본 클러스터 상태가 일치해야 한다. 한 노드만 본 출력으로 클러스터 정상을 판정하면 안 된다.

```markdown
######## [pve-nd01] pvecm status ########
Cluster information
-------------------
Name:             pve-cl01
Config Version:   5
Transport:        knet
Secure auth:      on

Quorum information
------------------
Date:             Thu Apr 23 16:30:09 2026
Quorum provider:  corosync_votequorum
Nodes:            5
Node ID:          0x00000001
Ring ID:          1.11b
Quorate:          Yes

Votequorum information
----------------------
Expected votes:   5
Highest expected: 5
Total votes:      5
Quorum:           3
Flags:            Quorate

Membership information
----------------------
    Nodeid      Votes Name
0x00000001          1 10.99.20.11 (local)
0x00000002          1 10.99.20.12
0x00000003          1 10.99.20.13
0x00000004          1 10.99.20.14
0x00000005          1 10.99.20.15
```

`pve-nd02`~`pve-nd05`의 출력은 **`Node ID`와 `(local)` 표시 위치만 다르고 나머지는 모두 동일**하다. 5노드 출력 전체를 검증하기 위한 한 줄 요약 (5노드별 핵심 필드 추출):

| 노드     | Date 시각 | Node ID | Ring ID | Quorate | Total votes | Membership 5개 일치? |
| -------- | --------- | ------- | ------- | ------- | ----------- | -------------------- |
| pve-nd01 | 16:30:09  | 0x01    | 1.11b   | Yes     | 5           | ✓                    |
| pve-nd02 | 16:30:09  | 0x02    | 1.11b   | Yes     | 5           | ✓                    |
| pve-nd03 | 16:30:09  | 0x03    | 1.11b   | Yes     | 5           | ✓                    |
| pve-nd04 | 16:30:10  | 0x04    | 1.11b   | Yes     | 5           | ✓                    |
| pve-nd05 | 16:30:10  | 0x05    | 1.11b   | Yes     | 5           | ✓                    |

이 출력에서 끌어내야 할 정보:

1. **Ring ID 5노드 일치 (`1.11b`)** — 모든 노드가 같은 클러스터 멤버십 세대에 속한다. 분열이 없다.
2. **Total votes = Expected votes = 5** — 모든 노드의 표가 정상 카운트된다. 오프라인 노드 없음.
3. **Quorum = 3** — 5/2+1 자동 계산 결과. 사고로 노드가 빠졌을 때 이 숫자는 변하지 않으나 Total votes가 줄어들면 임계.
4. **Date가 12초 윈도우 안 응답** — 모든 노드가 SSH 응답 가능하며 부하가 정상. 한 노드만 30초 후 응답한다면 그 노드의 부하 또는 네트워크 지연 의심.
5. **Config Version = 5** — corosync.conf의 `config_version` 필드. 5노드가 같은 버전을 보고 있어야 한다(다르면 일부 노드가 구버전 설정으로 동작 중인 것).

### 2.2 Corosync 링 상태 (`corosync-cfgtool -s`)

각 노드에서 다른 4노드와의 링 연결성을 본다. ring0와 ring1 둘 다 모든 페어에서 connected여야 정상.

```markdown
######## [pve-nd01] corosync-cfgtool -s ########
Local node ID 1, transport knet
LINK ID 0 udp
        addr    = 10.99.20.11
        status:
                nodeid:          1:     localhost
                nodeid:          2:     connected
                nodeid:          3:     connected
                nodeid:          4:     connected
                nodeid:          5:     connected
LINK ID 1 udp
        addr    = 10.99.30.11
        status:
                nodeid:          1:     localhost
                nodeid:          2:     connected
                nodeid:          3:     connected
                nodeid:          4:     connected
                nodeid:          5:     connected
```

5노드 출력을 매트릭스로 정리하면 다음과 같다. 각 셀은 (ring0 / ring1) 상태:

| from \ to | nd01  | nd02  | nd03  | nd04  | nd05  |
| --------- | ----- | ----- | ----- | ----- | ----- |
| **nd01**  | local | C / C | C / C | C / C | C / C |
| **nd02**  | C / C | local | C / C | C / C | C / C |
| **nd03**  | C / C | C / C | local | C / C | C / C |
| **nd04**  | C / C | C / C | C / C | local | C / C |
| **nd05**  | C / C | C / C | C / C | C / C | local |

(C = connected, local = 자기 자신)

5×5 = 25셀 중 자기 자신(local) 5개를 제외한 20개 페어 모두 양 링크 connected. **현재 환경에서 가능한 가장 깔끔한 상태**다.

이 출력에서 끌어내야 할 정보:

1. **양방향 대칭 검증**: nd01에서 본 nd02 상태와 nd02에서 본 nd01 상태가 둘 다 connected여야 한다. 한쪽만 connected이고 반대쪽이 disconnected이면 비대칭 통신 장애. 본 환경은 모두 대칭 정상.
2. **링별 IP 평면 확정**: ring0는 `10.99.20.X`(corosync 전용), ring1은 `10.99.30.X`(storage 평면 공유). 이는 corosync.conf와 정확히 일치.
3. **Transport 확인**: `transport knet` 표시. UDP 기반 KNET 사용. UDPU(unicast UDP)나 UDP multicast가 아님.

### 2.3 KNET 링크 상세 (`corosync-cfgtool -n`)

각 링크의 MTU와 from→to 주소를 본다.

```markdown
######## [pve-nd01] corosync-cfgtool -n ########
Local node ID 1, transport knet
nodeid: 2 reachable
   LINK: 0 udp (10.99.20.11->10.99.20.12) enabled connected mtu: 1397
   LINK: 1 udp (10.99.30.11->10.99.30.12) enabled connected mtu: 1397
...
```

5노드 모두 동일한 패턴으로 출력. 핵심 발견은 **MTU 1397**이다.

이 숫자의 의미를 풀자.

- 표준 이더넷 MTU = 1500
- IPv4 헤더 = 20 byte
- UDP 헤더 = 8 byte
- KNET overhead (KNET 자체 헤더 + 보안 프레임) = 약 75 byte
- 1500 − 20 − 8 − 75 = 1397

즉 corosync가 자동 계산한 PMTU(Path MTU)에서 자기 헤더를 빼고 남은 페이로드 한도가 1397이다. **NIC가 점보 프레임(MTU 9000)을 쓰고 있다면 이 값은 8800대가 나와야 한다.** 1397이라는 것은 5노드의 corosync 트래픽이 표준 1500 MTU 평면 위에서 흐른다는 결정적 증거다.

이 사실의 영향:

- **corosync 자체에는 영향 없음**: corosync 토큰 패킷은 작아서 1397 충분.
- **그러나 ring1을 공유하는 storage 평면(NFS/iSCSI)에 영향 있음**: NFS의 일반적 read/write payload는 32~64KB 단위인데, MTU 1500 환경에서는 이를 약 1460 byte 단위로 fragmentation해야 한다. 점보 프레임을 쓰면 fragmentation 횟수가 6배 줄어 throughput이 향상된다.
- **이는 챕터 04(스토리지 정찰)에서 storage 성능 베이스라인 측정 시 핵심 변수**다. 본 챕터에서는 사실만 기록하고 인계.

### 2.4 pmxcfs 동기화 검증 (`stat` + `md5sum`)

5노드의 `/etc/pve` 핵심 파일이 byte-단위로 일치해야 한다. mtime, size, md5 셋 다 본다.

수집 결과를 표로 정리:

| 노드     | corosync.conf<br/>(size, mtime, md5)          | storage.cfg<br/>(size, mtime, md5)              | .members<br/>(size) | .version<br/>(size) |
| -------- | --------------------------------------------- | ----------------------------------------------- | ------------------- | ------------------- |
| pve-nd01 | 908, 2026-03-06 09:48:07, `5f168e0a...0760e6` | 4496, 2026-04-23 15:57:16, `5d20728b...87db294` | 435                 | 1820                |
| pve-nd02 | 908, 2026-03-06 09:48:07, `5f168e0a...0760e6` | 4496, 2026-04-23 15:57:16, `5d20728b...87db294` | 435                 | 1822                |
| pve-nd03 | 908, 2026-03-06 09:48:07, `5f168e0a...0760e6` | 4496, 2026-04-23 15:57:16, `5d20728b...87db294` | 435                 | 1822                |
| pve-nd04 | 908, 2026-03-06 09:48:07, `5f168e0a...0760e6` | 4496, 2026-04-23 15:57:16, `5d20728b...87db294` | 435                 | 1816                |
| pve-nd05 | 908, 2026-03-06 09:48:07, `5f168e0a...0760e6` | 4496, 2026-04-23 15:57:16, `5d20728b...87db294` | **434**             | **1751**            |

판독:

- **corosync.conf**: 5노드 모두 size·mtime·md5 일치. `2026-03-06 09:48:07` mtime은 챕터 00 §2.6에서 추정한 클러스터 셋업 시점(약 49일 전)과 정확히 일치. corosync 설정은 셋업 이후 한 번도 변경된 적이 없다.
- **storage.cfg**: 5노드 모두 일치. 단 mtime이 `2026-04-23 15:57:16`이다. 이는 본 챕터 데이터 수집(16:30) 33분 전이며, 챕터 00 작성 시점(15:11~15:24) 이후 누군가 storage 항목을 추가/수정했다는 뜻이다. 누가 했는지는 챕터 04(스토리지 정찰)에서 audit log로 추적한다.
- **`.members`**: nd05만 size=434이고 나머지는 435. 1바이트 차이.
- **`.version`**: 노드마다 다름.

`.members`와 `.version`은 동적 파일이며 노드별로 약간 다른 값을 가질 수 있다. `.members`의 1바이트 차이는 nd05의 `(local)` 마커 위치 또는 IP 표기 길이의 차이에서 발생할 수 있는 정상 범위다. **단 경고는 한 가지**: 만약 `.members` 차이가 5바이트 이상이라면 한 노드가 다른 노드 정보를 인지하지 못하고 있을 가능성이 있으니 즉시 추가 점검이 필요하다.

이 출력에서 끌어내야 할 정보:

1. **클러스터 설정 안정성**: corosync.conf가 셋업 이후 무변경 → 클러스터 토폴로지가 굳어 있다.
2. **storage.cfg 활발한 변경 활동**: 33분 전 변경. 다중 테스터 환경의 전형. 이는 챕터 04에서 변경 추적 메커니즘이 필요하다는 근거.
3. **pmxcfs 동기 정상**: corosync.conf와 storage.cfg 5노드 md5 100% 일치.

### 2.5 pmxcfs 카운터와 노드별 시점 (`.version` JSON)

`.version` 파일은 pmxcfs 내부 카운터의 JSON 덤프다. 각 파일이 몇 번 갱신됐는지(`storage.cfg`, `corosync.conf` 등)와 각 노드별 kvstore의 카운터를 보여준다.

핵심 필드인 `starttime`을 5노드 모두 추출하여 Unix epoch를 KST로 디코드:

| 노드     | starttime (Unix) | KST 디코드          | 챕터 00 §2.6 uptime과 일치? |
| -------- | ---------------- | ------------------- | --------------------------- |
| pve-nd01 | 1773966231       | 2026-03-20 01:23:51 | ✓ (34일 6시간)              |
| pve-nd02 | 1772757848       | 2026-03-06 02:04:08 | ✓ (49일)                    |
| pve-nd03 | 1772757965       | 2026-03-06 02:06:05 | ✓ (49일, nd02와 2분 차)     |
| pve-nd04 | 1775518928       | 2026-04-07 01:42:08 | ✓ (16일)                    |
| pve-nd05 | 1776910727       | 2026-04-23 11:18:47 | ✓ (4시간)                   |

**`pmxcfs starttime`이 챕터 00 §2.6의 uptime 분포 추정을 1초 단위로 검증**한다. 이는 단순 비교를 넘어 의미가 있다 — `pmxcfs starttime`은 "pmxcfs 데몬이 마지막으로 시작된 시각"이며 노드 reboot 시점과 거의 일치한다. 두 값이 어긋나면 **pmxcfs만 재시작되고 노드 자체는 reboot되지 않은** 비정상 케이스를 의심해야 한다.

또 흥미로운 사실: nd02와 nd03이 **2분 17초 차이로 부팅**됐다. 동일한 자동화 스크립트로 거의 동시에 셋업된 흔적이다.

`.version`의 `kvstore` 섹션 분석:

각 노드는 자기 시점에서 5노드 모두의 카운터를 본다. nd05의 `.version`을 예로 들면, nd05는 자기 starttime 이후의 카운터만 본다(짧은 uptime). nd02의 `.version`은 그 49일간 누적된 카운터를 본다.

`tasklist` 카운터를 5노드 시점에서 본 매트릭스 (행=관찰자, 열=관찰 대상):

| 관찰자\대상 | nd01   | nd02   | nd03   | nd04   | nd05   |
| ----------- | ------ | ------ | ------ | ------ | ------ |
| **nd01**    | 288563 | 266672 | 267284 | 263768 | 146772 |
| **nd02**    | 381224 | 357737 | 358774 | 355380 | 233264 |
| **nd03**    | 381211 | 357770 | 358728 | 355380 | 233264 |
| **nd04**    | 142906 | 141138 | 141335 | 142042 | 96977  |
| **nd05**    | 1808   | 1717   | 1766   | 1738   | 1784   |

판독:

1. **각 행의 카운터 수준이 노드 starttime과 반비례**한다. nd05(starttime 가장 최근)에서 본 카운터가 가장 작다(1700~1800대). nd02·nd03(starttime 가장 오래)에서 본 카운터가 가장 크다(35만대).
2. **각 열을 비교하면 각 노드의 task 발생 빈도를 알 수 있다**. nd01의 열을 보면 nd02·nd03에서 38만대, nd04에서 14만대, nd01 자기 시점에서 28만대. 다른 노드보다 **약 7~10% 많다**. 이는 챕터 00 §2.7에서 식별된 "nd01 = 사실상의 jump host" 정황과 일치한다.
3. **nd04의 행이 다른 노드에 비해 작은 카운터를 본다** → nd04가 16일 전 reboot한 결과. 정상.

이 매트릭스 분석은 **노드 부하 분포의 정량적 근거**가 되며, 챕터 02(노드 정찰)에서 본격적으로 사용된다.

### 2.6 코로싱크·클러스터 데몬 상태

```markdown
######## [pve-nd01] 코로싱크/클러스터 데몬 상태 ########
active active active active active

######## [pve-nd02] ~ [pve-nd05] 동일
```

`systemctl is-active corosync pve-cluster pvedaemon pveproxy pvestatd`의 결과. 5노드 모두 5데몬 모두 active. 정상.

각 데몬의 역할:

| 데몬          | 역할                                                                      |
| ------------- | ------------------------------------------------------------------------- |
| `corosync`    | 클러스터 통신 토큰 회람                                                   |
| `pve-cluster` | pmxcfs FUSE 마운트 (`/etc/pve` 제공)                                      |
| `pvedaemon`   | API 요청 처리. CMP가 던지는 모든 PVE API가 결국 이 데몬을 거친다          |
| `pveproxy`    | HTTPS 프록시 (8006). Web UI와 외부 API의 진입점                           |
| `pvestatd`    | 노드·VM·스토리지 통계 수집. Web UI와 CMP의 자원 사용량 표시 데이터의 출처 |

이 다섯 중 하나라도 inactive면 그 노드의 일부 기능이 마비된다. 특히 `pvedaemon` 또는 `pveproxy`가 죽으면 **CMP가 그 노드에 던지는 API 호출이 모두 실패**한다. CMP 결함처럼 보이지만 환경 결함이다.

### 2.7 24시간 corosync·pve-cluster 로그

이 절이 본 챕터에서 가장 학습 가치가 높다. **정상 노드 reboot의 표준 로그 패턴**이 그대로 박제되어 있기 때문이다.

#### 다른 4노드(nd01, nd02, nd03, nd04)의 로그

```markdown
######## [pve-nd01] 최근 24h corosync 경고/에러 ########
Apr 23 11:17:07 pve-nd01 corosync[1543]:   [KNET  ] host: host: 5 has no active links
######## [pve-nd01] 최근 24h pve-cluster 경고/에러 ########
-- No entries --

######## [pve-nd02] 최근 24h corosync 경고/에러 ########
Apr 23 11:17:06 pve-nd02 corosync[258851]:   [KNET  ] host: host: 5 has no active links
Apr 23 11:17:06 pve-nd02 corosync[258851]:   [KNET  ] host: host: 5 has no active links

(nd03, nd04도 유사)
```

판독:

- 24시간 동안 **유일한 경고 메시지가 `host: 5 has no active links` 1~2줄**.
- 시각이 모두 `11:17:06~07`로 좁은 윈도우 안.
- pve-cluster 데몬은 경고/에러 0건.

이는 **nd05가 11:17 시점에 다운됐을 때, 다른 4노드가 nd05와의 링크가 끊어졌음을 인지한 한 줄짜리 정상 알림**이다. 노드 ID 5번(nd05)을 향한 ring0와 ring1 링크가 모두 끊어졌다는 의미. KNET이 1~2번 재시도 후 즉시 "no active links"로 마크.

#### nd05 자신의 로그

```markdown
######## [pve-nd05] 최근 24h corosync 경고/에러 ########
Apr 23 11:18:48 pve-nd05 (corosync)[1722]: corosync.service: Referenced but unset
                          environment variable evaluates to an empty string: COROSYNC_OPTIONS
Apr 23 11:18:49 pve-nd05 corosync[1722]:   [WD    ] Watchdog not enabled by configuration
Apr 23 11:18:49 pve-nd05 corosync[1722]:   [WD    ] resource load_15min missing a recovery key.
Apr 23 11:18:49 pve-nd05 corosync[1722]:   [WD    ] resource memory_used missing a recovery key.
Apr 23 11:18:49 pve-nd05 corosync[1722]:   [KNET  ] host: host: 1 has no active links
Apr 23 11:18:49 pve-nd05 corosync[1722]:   [KNET  ] host: host: 1 has no active links
Apr 23 11:18:49 pve-nd05 corosync[1722]:   [KNET  ] host: host: 1 has no active links
Apr 23 11:18:49 pve-nd05 corosync[1722]:   [KNET  ] host: host: 2 has no active links
... (host 2, 3, 4 각각 3줄씩 반복)
```

판독:

이 로그는 nd05가 부팅 직후 corosync를 시작하면서 다른 4노드를 "찾아가는" 과정이다.

- `11:18:48`: corosync.service 시작. `COROSYNC_OPTIONS` 환경변수 미설정 경고(무해).
- `11:18:49`: Watchdog 미활성 경고. 이는 본 클러스터의 **공식 보안 결함**으로 등록되어야 한다(아래 별도 분석).
- `11:18:49`: 다른 4노드(host 1, 2, 3, 4) 각각에 대해 "no active links" 3번씩 출력. 이는 ring0와 ring1을 동시에 시도하고, 첫 시도에서 응답을 못 받아 재시도하는 동안의 정상 알림. 부팅 직후 12개 메시지가 한 번에 쏟아진 후 자동 회복.

```markdown
######## [pve-nd05] 최근 24h pve-cluster 경고/에러 ########
Apr 23 11:17:05 pve-nd05 pmxcfs[1438]: [confdb] crit: cmap_dispatch failed: 2
Apr 23 11:17:05 pve-nd05 pmxcfs[1438]: [quorum] crit: quorum_dispatch failed: CS_ERR_LIBRARY
Apr 23 11:17:05 pve-nd05 pmxcfs[1438]: [dcdb] crit: cpg_dispatch failed: CS_ERR_LIBRARY
... (종료 과정의 연쇄 에러 약 15줄)
-- Boot 5c47a8c12d7741e79d855f60e16c17d9 --
Apr 23 11:18:47 pve-nd05 pmxcfs[1569]: [quorum] crit: quorum_initialize failed: CS_ERR_LIBRARY (failed to connect to corosync)
Apr 23 11:18:47 pve-nd05 pmxcfs[1569]: [quorum] crit: can't initialize service
... (부팅 후 corosync 시작 대기 race 약 8줄)
```

판독:

- `11:17:05`~`11:17:07` (종료 phase): pmxcfs가 corosync보다 늦게 종료되어 corosync가 이미 닫힌 IPC 채널에 dispatch 시도. `CS_ERR_LIBRARY`는 "corosync 라이브러리 핸들이 무효"라는 뜻. 정상 종료의 자연스러운 부산물.
- `-- Boot 5c47... --`: journalctl이 자동 삽입하는 부팅 경계 마커. 이 이전과 이후가 다른 부팅 사이클임을 명시.
- `11:18:47` (부팅 phase): pmxcfs가 corosync보다 먼저 시작되어 corosync 연결 실패. 이는 systemd unit 의존성에서 일반적인 race. corosync가 1~2초 뒤에 올라오면 pmxcfs가 자동 재연결한다.

#### 정상 reboot 로그 패턴 요약

위 두 단계를 종합하면 **정상 노드 reboot의 표준 로그 흔적**이 다음 4가지 신호로 정의된다.

1. **다른 노드들의 corosync 로그**: 한 노드 ID에 대한 `host: N has no active links` 1~2줄, 그 외 무경고
2. **자신의 종료 직전 로그**: pmxcfs의 `CS_ERR_LIBRARY` 연쇄 (corosync 먼저 종료됨)
3. **`-- Boot <UUID> --`** 마커
4. **자신의 부팅 직후 로그**: pmxcfs `quorum_initialize failed` (corosync 늦게 시작) → 1~2초 후 자동 회복

위 4가지 패턴이 모두 보이고 그 후 클러스터가 quorate를 회복했다면, 이는 **의도된 reboot 또는 정상 종료의 흔적**이다. 사고가 아니다.

#### nd05에서 발견된 [위험] 신호: Watchdog 미활성

```markdown
[WD    ] Watchdog not enabled by configuration
[WD    ] resource load_15min missing a recovery key.
[WD    ] resource memory_used missing a recovery key.
```

이는 정상 reboot의 일부가 아니라 **클러스터 설정의 결함**이다. corosync는 자체 Watchdog 기능을 지원하는데, 이는 노드가 hang 상태에 빠지거나 정족수를 잃었을 때 **자동으로 재부팅을 트리거하여 split-brain을 방지**하는 안전장치다. 이것이 비활성 상태라는 것은 다음 위험을 의미한다.

- 노드가 무응답 상태에 빠져도 자동 fence가 일어나지 않는다
- HA 페일오버가 의도대로 동작하지 않을 수 있다
- 사고 시 수동 개입 시간이 길어진다

이 발견은 **챕터 08(위험 매트릭스)에서 P0 항목**으로 인계된다. 본 챕터에서는 발견 사실만 기록.

### 2.8 HA 매니저 상태

```markdown
######## ha-manager status (전 클러스터 공통) ########
quorum OK
master pve-nd02 (active, Thu Apr 23 16:30:17 2026)
lrm pve-nd01 (active, Thu Apr 23 16:30:13 2026)
lrm pve-nd02 (idle, Thu Apr 23 16:30:17 2026)
lrm pve-nd03 (active, Thu Apr 23 16:30:17 2026)
lrm pve-nd04 (active, Thu Apr 23 16:30:21 2026)
lrm pve-nd05 (active, Thu Apr 23 16:30:19 2026)
service vm:100002 (pve-nd01, started)
service vm:106 (pve-nd04, started)
service vm:115 (pve-nd03, stopped)
service vm:116 (pve-nd01, stopped)
service vm:809 (pve-nd03, stopped)
service vm:9502 (pve-nd05, started)
service vm:9503 (pve-nd05, ignored)
```

판독:

- **HA 매스터: pve-nd02**. CRM(Cluster Resource Manager)가 nd02에서 동작 중. 모든 HA 자원 배치 결정은 nd02에서 내린다.
- **LRM(Local Resource Manager)**: 5노드 모두 동작 중. nd02만 `idle`인 이유는 nd02가 매스터라 자기 LRM에는 자원이 배정되지 않은 상태(또는 정책상 매스터 노드는 자원을 받지 않음).
- **HA 자원 7개**: 노드 분포가 흥미롭다.

| 자원      | 노드     | 상태    | 비고                                 |
| --------- | -------- | ------- | ------------------------------------ |
| vm:100002 | pve-nd01 | started | **6자리 VMID** — CMP 자동 생성 추정  |
| vm:106    | pve-nd04 | started | 일반 운영 VM                         |
| vm:115    | pve-nd03 | stopped | HA가 stopped 상태를 의도적으로 유지  |
| vm:116    | pve-nd01 | stopped | 위와 동일                            |
| vm:809    | pve-nd03 | stopped | 위와 동일                            |
| vm:9502   | pve-nd05 | started | nd05 reboot 후 자동 시작됨           |
| vm:9503   | pve-nd05 | ignored | **HA가 일시적으로 관리 제외**한 상태 |

세 가지 즉시 식별:

1. **vm:100002의 VMID 6자리**: 챕터 00 §2.2에서 추정한 "CMP가 자동 생성한 VM은 큰 VMID를 쓴다"의 첫 증거. 챕터 06에서 본격 확인.
2. **vm:9502와 vm:9503은 9000번대**: 챕터 00 §2.2의 자원 명명 카오스와 별개로 VMID에도 명명 컨벤션이 자생적으로 형성되어 있을 가능성. 챕터 06에서 추적.
3. **vm:9503의 `ignored` 상태**: HA가 fence loop 또는 반복 실패 후 자동 격리한 상태일 가능성. 또는 운영자가 의도적으로 격리. 챕터 06에서 원인 추적 필요.
4. **stopped 상태로 HA에 등록된 자원 3개**: HA는 `state=stopped`로 등록된 자원에 대해 "이 자원이 임의로 시작되지 않도록 stopped를 유지" 책임을 진다. 다른 사람이 이 자원을 무심코 시작하면 HA가 다시 정지시킬 수 있으므로 테스트 시 주의.

이 출력에서 끌어내야 할 정보 (본 챕터 관점):

- **HA가 정상 동작 중** — 클러스터 정족수가 살아있고 HA 매스터 선출이 끝났다.
- **HA 자원이 5노드 중 4개 노드에 분산** — nd02만 자원 없음(매스터 역할). 챕터 06에서 부하 분산 평가에 사용.

### 2.9 (보류) omping 측정

```markdown
[pve-nd01] omping 없음
[pve-nd02] omping 없음
... (5노드 모두 미설치)
```

omping은 corosync 트래픽이 의존하는 unicast/multicast UDP 품질을 측정하는 도구다. Proxmox 공식 문서에서 클러스터 셋업 검증 시 권장한다.

5노드 모두 미설치 상태이며, 테스트팀이 임의로 패키지를 설치할 권한이 없다. 따라서 본 챕터에서는 측정을 보류한다. 잔여 정비 항목으로 §6에 등록.

대안: omping 없이도 corosync 자체의 KNET 통계로 ring 품질을 어느 정도 추정할 수 있다. `corosync-cmapctl | grep stats`로 KNET 통계를 확인하는 절차는 부록 A에 수록.

---

## 3. 출력의 비정상 패턴과 조기 경보

본 절은 §2의 정상 베이스라인과 대조되는 비정상 패턴을 카탈로그한다. 핸드북 사용자가 정찰을 반복할 때 가장 자주 펼쳐질 절이다.

### 3.1 정상 패턴 — 본 환경의 기준선

다음 5가지 신호가 모두 만족되면 클러스터는 정상이다.

```markdown
[정상 1] pvecm status
   → 5노드에서 동일한 Ring ID, 동일한 Membership IP 5개 표시
   → Quorate: Yes, Total votes = Expected votes = 5
   → 모든 노드의 Date 응답이 30초 윈도우 안

[정상 2] corosync-cfgtool -s
   → 5×5 매트릭스의 모든 페어가 양 LINK 모두 connected
   → addr 필드가 ring0=10.99.20.X, ring1=10.99.30.X로 일관

[정상 3] /etc/pve 핵심 파일 md5sum
   → 5노드 corosync.conf md5 일치
   → 5노드 storage.cfg md5 일치
   → mtime 일치 (storage.cfg는 활발한 변경 활동으로 mtime이 자주 갱신될 수 있으나 5노드 동일)

[정상 4] systemctl is-active
   → 5노드 모두 corosync, pve-cluster, pvedaemon, pveproxy, pvestatd = active

[정상 5] ha-manager status
   → quorum OK
   → master 노드 1개 active
   → 5노드 모두 lrm active 또는 idle (절대 dead 아님)
```

위 5가지 정상 출력의 명령 한 줄 요약:

```bash
# 5노드 정상 1차 체크 — 한 노드에서 30초 안에 끝남
NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"
for n in $NODES; do
  ssh "$n" "pvecm status 2>&1 | grep -E '^Quorate|^Total votes|^Ring ID' | tr '\n' ' ' && echo '|'$n"
done
ha-manager status | head -10
```

**기대 출력 (정상):**

```markdown
Ring ID:          1.11b Quorate:          Yes Total votes:      5  | pve-nd01
Ring ID:          1.11b Quorate:          Yes Total votes:      5  | pve-nd02
Ring ID:          1.11b Quorate:          Yes Total votes:      5  | pve-nd03
Ring ID:          1.11b Quorate:          Yes Total votes:      5  | pve-nd04
Ring ID:          1.11b Quorate:          Yes Total votes:      5  | pve-nd05
quorum OK
master pve-nd02 (active, ...)
...
```

5노드의 Ring ID가 같고 Total votes가 모두 5이면 정상.

### 3.2 의심 패턴

| #   | 의심 출력                                                 | 추정 원인                                 | 즉시 확인                                                  |
| --- | --------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| 1   | 한 노드만 다른 Ring ID 표시                               | 그 노드가 일시 분리됐다가 합류 중         | 30초 후 재확인. 그래도 다르면 §3.3                         |
| 2   | Total votes < Expected votes                              | 한 노드 이상이 통신 불가                  | `corosync-cfgtool -s`로 어느 노드가 disconnected인지       |
| 3   | `corosync-cfgtool -s`에 한 페어가 disconnected            | 그 노드 간 네트워크 단절 (ring 절반 죽음) | 양 노드의 평면 IP 핑 테스트, 스위치 포트 상태              |
| 4   | corosync 로그에 `Token has not been received in NNNms`    | 토큰 타임아웃. 정족수 직전 상태           | 즉시 부하 측정. 챕터 02 §2의 부하 점검                     |
| 5   | corosync 로그에 `KNET link: host N link 0/1 is down` 반복 | 링 플래핑                                 | 물리 NIC 또는 케이블 의심. 챕터 05 인계                    |
| 6   | `/etc/pve/storage.cfg` md5 노드별 불일치                  | pmxcfs 동기화 깨짐                        | **즉시 중단** §3.3                                         |
| 7   | `systemctl is-active corosync` = inactive                 | corosync 데몬 다운                        | **즉시 중단** §3.3                                         |
| 8   | `pvedaemon` inactive (다른 데몬은 정상)                   | API 게이트웨이만 죽음                     | `journalctl -u pvedaemon -n 50`                            |
| 9   | `ha-manager status`에 `master` 라인 없음                  | HA 매스터 선출 실패                       | 즉시 책임자 보고. CMP의 HA 관련 테스트 중단                |
| 10  | `ha-manager status`에 자원 상태 `error`                   | HA 자원 시작 반복 실패 후 자동 격리       | 챕터 06 인계. 테스트는 계속 가능하나 그 자원은 만지지 않음 |

### 3.3 즉시 중단 신호

다음 패턴이 보이면 자기 테스트를 즉시 중단하고 책임 테스터에게 보고한다. 사고 확산 전에 멈추는 것이 항상 우선이다.

#### 신호 A: 정족수 손실

```markdown
pvecm status
...
Quorate:          No
Flags:            
```

`Flags`에 `Quorate`가 없다. 이 시점에 `/etc/pve`는 read-only다. CMP가 호출하는 모든 쓰기 API가 실패할 것이며, 그 실패는 환경 문제다. 즉시 중단하고 corosync 로그 수집(챕터 07).

#### 신호 B: pmxcfs md5 5노드 불일치

```markdown
[5노드의 md5sum /etc/pve/storage.cfg 결과 중 하나라도 다른 값]
```

이는 pmxcfs 동기화가 깨졌다는 뜻이다. 어느 한 노드가 다른 노드와 다른 storage.cfg를 보고 있다면, 그 노드에서 일어난 모든 변경이 다른 노드에 전파되지 않은 상태다. 이 상태에서는 split-brain 사고가 즉각 발생할 수 있다.

즉시 모든 자원 변경 작업 중단. 책임 테스터에게 보고. 추가 테스트는 동기 회복 후에만.

#### 신호 C: corosync 로그에 Fence 메시지

```markdown
journalctl -u corosync | grep -iE 'fence|killed|reboot'
```

이 grep에 메시지가 잡히면 노드가 강제로 격리됐거나 재부팅됐다는 뜻이다. 이는 자동 fence 동작의 흔적이며, 정족수 보호를 위한 정상 동작이지만 그 시점의 테스트 결과는 모두 신뢰할 수 없다. 사고 보고서 작성하고 다음 사이클에서 재개.

---

## 4. 이 영역의 CMP 테스트 대분류와 시나리오

본 영역(클러스터 정찰)이 직접적으로 검증할 수 있는 CMP 테스트 시나리오를 4분류에 따라 풀어낸다. 각 시나리오는 §2의 어느 정찰이 사전 점검으로 필요한지 명시한다.

### 4.1 CRUD 기능 검증

CMP가 클러스터 멤버십을 직접 조작하는 기능이 있다면(드물지만 있을 수 있음) 다음을 검증한다.

#### 시나리오 4.1.1 — 노드 정보 조회 API의 정합성

CMP가 `/cluster/nodes` 또는 유사 API로 노드 목록을 조회할 때, 결과가 PVE의 `pvesh get /cluster/status`와 100% 일치해야 한다.

- 검증 진입점: 5노드 모두에서 `pvesh get /cluster/status --output-format=yaml` 실행 후 비교
- 사전 정찰: §2.1 (정족수 정상)
- 검증 항목:
  - 노드 수 일치
  - 각 노드의 `online` 플래그 일치
  - 각 노드의 IP 일치 (CMP가 mgmt 평면 IP를 표시하는지, corosync 평면 IP를 표시하는지 명확히)

#### 시나리오 4.1.2 — 클러스터 메타 정보 조회

`/cluster/status`의 cluster 엔트리(name, version, quorate)가 정확히 표시되는지.

- 검증 진입점: `pvesh get /cluster/status` cluster 섹션
- 사전 정찰: §2.1, §2.4
- 검증 항목: `nodes`=5, `quorate`=1, `version`=5, `name`=pve-cl01

### 4.2 스테이징 워크플로우

클러스터 수준의 변경(corosync 설정, 노드 추가/제거)은 본 영역에서 가장 위험한 작업이다. CMP가 이런 작업의 스테이징 워크플로우를 제공한다면 다음을 검증.

#### 시나리오 4.2.1 — corosync.conf 변경 시 5노드 전파 시점

CMP UI에서 corosync 설정 변경(예: token timeout 조정)을 적용할 때, 5노드의 `/etc/pve/corosync.conf`가 모두 갱신되는 시점을 측정.

- 검증 진입점: 변경 직후 5노드에서 `md5sum /etc/pve/corosync.conf`를 1초 간격으로 반복 측정
- 사전 정찰: §2.4 (변경 전 5노드 md5 일치 확인 필수)
- 검증 항목:
  - 5노드 모두 갱신되는 시간 (이상적으로 1초 이내)
  - `config_version` 필드가 자동 증가했는가
  - 변경 후 corosync 자체가 hot reload 되는가, 재시작이 필요한가

#### 시나리오 4.2.2 — 변경 적용 실패 시 부분 적용 처리

5노드 중 한 노드가 응답 불가 상태일 때 corosync 변경을 시도하면 CMP가 어떻게 처리하는가.

- 사전 정찰: 의도적으로 한 노드를 일시 격리한 상태에서 시작
- 검증 항목:
  - CMP가 변경을 거부하는가, 부분 적용하는가
  - 부분 적용 시 응답 가능 노드만 갱신되어 5노드 md5가 어긋나는가
  - 격리된 노드가 복귀할 때 자동으로 동기화되는가

> **위험**: 이 시나리오는 실제로 corosync.conf 부분 적용을 유발하면 split-brain 사고로 이어질 수 있다. **테스트 환경에서도 실제 corosync.conf를 건드리지 말고**, CMP UI의 응답·에러 메시지만 관찰하는 dry-run으로 한정한다.

### 4.3 위험 시나리오·에러 처리

본 영역에서 **반드시 검증해야 하지만 실제 실행하면 사고가 나는** 시나리오들이다. CMP가 이를 안전하게 거부하거나 명시적 확인을 요구하는지 검증.

#### 시나리오 4.3.1 — 정족수 위협 작업 거부

5노드 중 3노드가 이미 maintenance 상태인 상황에서 추가로 1노드 더 maintenance를 시도하면 CMP가 거부해야 한다(정족수 손실 방지).

- 사전 정찰: §2.1 (현재 노드 상태)
- 기대 동작: CMP가 "정족수 위협"을 명시적 경고로 표시하거나 작업 차단
- 결함 시나리오: 경고 없이 4번째 maintenance를 진행하여 클러스터 락업 발생

#### 시나리오 4.3.2 — 마지막 quorum-providing 노드 격리 시도

이론적 시나리오. CMP가 노드 ID 1을 ID 2와 동시에 격리하라는 요청을 받았을 때, 정족수 계산상 불가능함을 인식하는가.

- 검증: dry-run 또는 stage-only 모드로
- 결함 시나리오: 두 격리를 순차 적용하다가 중간에 정족수 손실로 두 번째 격리가 실패. 첫 번째 격리만 적용되어 의도와 다른 상태로 종료

#### 시나리오 4.3.3 — (이론적) 단일 랙 환경의 동시 reboot 차단

본 환경 특성: 5노드 모두 단일 랙. 이론상 만약 CMP가 "전 노드 일괄 reboot" 같은 기능을 제공한다면, 동시 reboot 시 잠시간 5노드 모두 down 상태가 되어 클러스터가 완전히 사라진다. 이를 거부해야 한다.

**본 환경의 CMP는 이 기능을 제공하지 않는다.** 본 CMP는 Proxmox에 UI 껍데기를 씌운 형태에 가까우며, 노드 일괄 작업 같은 추상화된 명령을 노출하지 않는다. 따라서 본 시나리오는 실제 검증 대상이 아니라 **이론적 위험으로만 등록**한다.

다만 본 시나리오가 의미를 갖는 경우가 둘 있다.

1. **향후 CMP 기능 확장 시**: 노드 일괄 작업 기능이 추가된다면 그 시점에 본 시나리오가 활성화된다.
2. **운영자 수동 작업 시**: CMP를 거치지 않고 운영자가 직접 5노드 SSH로 일괄 reboot 명령을 보내는 경우. 핸드북 사용자가 자기 작업의 안전성을 점검하는 체크리스트로 본 시나리오를 사용할 수 있다.

이론적 위험 등록 사유는 챕터 08(위험 매트릭스)에서 단일 랙 메타 정보와 함께 정리된다.

### 4.4 클러스터 일관성

CMP가 표시하는 클러스터 정보가 5노드 PVE의 실제 상태와 일치하는가.

#### 시나리오 4.4.1 — 멤버십 변경 실시간 반영

한 노드를 reboot했을 때 CMP UI의 노드 상태 표시가 얼마 만에 갱신되는가.

- 사전 정찰: §2.1, §2.7
- 검증 절차:
  1. 한 노드(테스트용 vm 없는 노드 선택) reboot
  2. CMP UI에서 노드 상태 변경(online → offline → online) 시각 측정
  3. 동시에 `pvecm status`의 Total votes 변동 시각 측정
  4. 두 시각의 차이를 측정 (이상적으로 5초 이내)
- 결함 시나리오: CMP가 30초 이상 stale 상태 표시. 그 사이 다른 테스터가 이 노드에 작업 던지면 사고

#### 시나리오 4.4.2 — Ring ID 변천 추적

CMP가 클러스터 멤버십 변경 이벤트를 로그하거나 알림하는가. 본 환경의 Ring ID는 `1.11b`(283회 변경)인데, CMP가 이를 추적·시각화한다면 테스트팀이 환경 변화를 인지하기 쉬워진다.

- 검증 항목:
  - CMP에 클러스터 이벤트 로그가 있는가
  - 노드 격리/복귀가 이벤트로 기록되는가
  - 이벤트의 시각이 corosync 로그와 일치하는가 (시계 동기)

#### 시나리오 4.4.3 — HA 매스터 변경 추적

본 환경의 HA 매스터는 pve-nd02. 만약 nd02가 다운되어 HA 매스터가 다른 노드로 이동하면 CMP가 이를 인지하는가.

- 사전 정찰: §2.8 (현재 HA 매스터 확인)
- 검증: nd02 reboot 후 CMP가 새 매스터 표시
- 결함 시나리오: CMP가 옛 매스터를 계속 표시. 사용자가 옛 매스터로 자원 명령을 보내면 거부

---

## 5. 정찰 ↔ 테스트 단계 역방향 매핑

§4가 "이 영역에서 가능한 테스트의 카탈로그"라면, 본 절은 **"특정 테스트 액션을 수행하기 전에 본 영역의 어느 정찰을 선행해야 하는가"**의 역방향 인덱스다. 다른 챕터의 테스트가 본 영역의 정찰에 의존하는 케이스를 모은다.

| 수행하려는 테스트 액션                   | 선행 정찰 (본 챕터)                | 추가 선행 정찰      |
| ---------------------------------------- | ---------------------------------- | ------------------- |
| **VM 마이그레이션** (챕터 06)            | §2.1 정족수 정상, §2.4 pmxcfs 동기 | 챕터 02 노드 부하   |
| **신규 storage 등록** (챕터 04)          | §2.4 storage.cfg 5노드 md5 일치    | 챕터 04 §X          |
| **HA 자원 변경** (챕터 06)               | §2.8 HA 매스터 정상, §2.1 정족수   | 챕터 06 §X          |
| **노드 reboot** (챕터 02)                | §2.1 정족수 4노드만 남아도 quorate | 단일 랙 동시성 주의 |
| **corosync 설정 변경** (챕터 01 본 챕터) | §2.1, §2.4, §2.7 (24h 무경고 확인) | (영역 내 자체)      |
| **CMP가 노드 일괄 작업** (챕터 06, 08)   | §2.1, §2.6 데몬 정상, §2.8 HA 정상 | 챕터 09 사전 점검   |
| **백업 잡 신규 등록** (챕터 06)          | §2.4 pmxcfs 정상                   | 챕터 04             |

이 매핑은 다른 챕터가 작성됨에 따라 채워진다. 본 챕터 시점에서는 골격만.

---

## 6. 정찰 결과를 산출물로 정리하는 양식

본 챕터의 정찰 결과는 다음 두 산출물로 정리되어 `artifacts/` 디렉토리에 저장된다.

### 6.1 산출물 양식 — 클러스터 베이스라인 카드

매주 또는 매 사이클 시작 시 갱신.

```markdown
# 클러스터 베이스라인 카드 — YYYY-MM-DD HH:MM

## 클러스터 메타
- 이름: pve-cl01
- 버전: <pveversion 출력>
- 노드 수: 5
- Ring ID: <pvecm status 출력>
- 정족수: <Quorate 여부>

## 5노드 상태
| 노드     | Online | uptime | Load 1m | HA 자원 수 |
| -------- | ------ | ------ | ------- | ---------- |
| pve-nd01 | ✓      | ...    | ...     | ...        |
| ...      |

## pmxcfs 동기 검증
| 파일 | 5노드 md5 일치? |
| corosync.conf | ✓ |
| storage.cfg | ✓ |

## 본 시점의 위험 신호
- (있으면 나열, 없으면 "없음")

## 잔여 정비 항목 (§7)
- ...
```

### 6.2 산출물 양식 — 사고 보고서 (사고 발생 시)

§3의 즉시 중단 신호가 트리거되면 작성.

```markdown
# 사고 보고서 — YYYY-MM-DD HH:MM

## 트리거된 신호
- §3.3의 신호 X (구체적 출력 첨부)

## 사고 시점 5노드 상태 (수집 시각: HH:MM)
- (즉시 중단 직후 §2의 명령들 일괄 실행 결과 첨부)

## 추정 원인
- (있으면 가설, 없으면 "원인 미상")

## 영향 범위 (Blast Radius)
- 영향받은 자원: ...
- 영향받은 테스터: ...

## 회복 절차
- (취한 조치 시간 순서대로)

## 후속 조치
- (재발 방지 항목)
```

---

## 7. 본 챕터에서 발견된 잔여 정비 항목

본 챕터의 정찰 과정에서 식별되었으나, 본 챕터의 범위를 넘는 사항은 다른 챕터로 인계한다. 본 절은 **인계 목록의 영구 기록**이다.

| #   | 발견 항목                                        | 인계 챕터                                 | 우선순위      |
| --- | ------------------------------------------------ | ----------------------------------------- | ------------- |
| 1   | `/etc/hosts` 4노드(nd01~04)에 5노드 매핑 누락    | 본 챕터 §7.1에서 정비 완결 (4단계 사이클) | **P0 → 완결** |
| 2   | corosync watchdog 미활성                         | 챕터 08 (위험 매트릭스)                   | P1            |
| 3   | omping 미설치 → 클러스터 네트워크 품질 측정 불가 | 챕터 02 또는 챕터 09                      | P2            |
| 4   | MTU 1397 (점보 프레임 미사용)                    | 챕터 04 (스토리지 성능)                   | P2            |
| 5   | storage.cfg 15:57:16 변경 (변경자 미확인)        | 챕터 04 (변경 audit)                      | P2            |
| 6   | HA 자원 vm:9503 `ignored` 상태                   | 챕터 06                                   | P2            |
| 7   | 단일 랙 5노드 → ring 분리 효과 제한              | 챕터 08 (위험 매트릭스)                   | P1            |

### 7.1 [P0 — 정비 완결] 5노드 `/etc/hosts` + SSH host key 신뢰 확립

챕터 00 §2.4에서 [해소]로 처리됐던 사례가 사실 단방향 정비였다. 본 챕터 §2의 출력에서 nd01·nd02·nd03·nd04 네 노드의 `/etc/hosts`에 다른 노드 매핑이 누락된 것이 재확인되었다.

본 정비 항목은 **네 단계의 정비 사이클을 거쳐 완결**되었다. 각 단계에서 새로운 결함이 드러났고, 그 결함이 다음 단계의 입력이 되었다. 그 중 3차 단계는 작성자의 격자 평가 누락을 사용자가 잡아낸 사례로, 핸드북의 정찰 철학이 **작성자→사용자→작성자→사용자**의 양방향 루프로 동작함을 보여주는 결정적 사례다.

이 진화 과정 자체가 핸드북의 가치를 가장 잘 보여주는 사례이므로 모든 단계를 본문에 박제한다.

#### 7.1.1 1차 시도 — 두 가지 결함의 동시 발생 (실패)

본 챕터 작성 직후 1차 정비 시도가 두 가지 결함으로 실패했다.

1. **논리 결함**: `for line in $HOSTS_BLOCK`이 multi-line string을 line이 아니라 word 단위로 분리. awk가 빈 값을 뱉어 echo가 한 번도 실행되지 않았다. 결과적으로 4노드 어디에도 `/etc/hosts`에 한 줄도 추가되지 않았다.
2. **정책 결함**: 명령 블록에 마스킹 IP(`10.99.10.X`)가 박혀 있었다. 만약 논리 결함이 없었다면 의미 없는 fake IP가 실제 `/etc/hosts`에 들어가 사고를 키웠을 것이다.

이 사례를 계기로 마스킹 정책이 **v2**로 갱신되었다(`masking-policy-v2.md` §2). 명령 블록과 출력 인용 블록의 IP 처리가 분리된다.

#### 7.1.2 2차 시도 — `/etc/hosts` 정비 성공, host key 결함 발견 (부분 성공)

v2 정책 준수한 정정 스크립트로 2차 시도. 방식 A(클러스터 메타에서 IP 동적 추출)를 채택.

```bash
# === STEP 1: 클러스터 메타에서 노드 IP 동적 추출 (mgmt 평면) ===
declare -A NODE_IPS
while IFS=$'\t' read -r name ip; do
  NODE_IPS[$name]=$ip
done < <(jq -r '.nodelist | to_entries[] | "\(.key)\t\(.value.ip)"' /etc/pve/.members)

# 추출 결과 확인
echo "=== 추출된 노드 IP 매핑 ==="
for k in "${!NODE_IPS[@]}"; do
  echo "  $k -> ${NODE_IPS[$k]}"
done
echo ""
read -p "위 매핑이 올바른가? [y/N] " confirm
[ "$confirm" != "y" ] && { echo "중단"; exit 1; }

# === STEP 2: 5노드 /etc/hosts 일괄 정비 ===
TARGET_NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"

for n in $TARGET_NODES; do
  echo ""
  echo "=== [$n] /etc/hosts 백업 ==="
  ssh "$n" "cp /etc/hosts /etc/hosts.bak.\$(date +%Y%m%d-%H%M%S) && ls -la /etc/hosts.bak.* | tail -1"

  echo "=== [$n] 누락 노드만 추가 ==="
  for target in "${!NODE_IPS[@]}"; do
    [ "$target" = "$n" ] && continue
    ip="${NODE_IPS[$target]}"
    ssh "$n" "grep -qE '[[:space:]]${target}\$' /etc/hosts \
              || echo '${ip} ${target}' >> /etc/hosts"
  done

  echo "=== [$n] 결과 확인 ==="
  ssh "$n" "cat /etc/hosts"
done

# === STEP 3: 양방향 SSH 검증 (5×4 = 20 페어) ===
echo "=== 양방향 SSH 검증 ==="
for src in $TARGET_NODES; do
  for dst in $TARGET_NODES; do
    [ "$src" = "$dst" ] && continue
    result=$(ssh "$src" "ssh -o ConnectTimeout=3 -o BatchMode=yes $dst hostname 2>&1 | head -1")
    printf "  %-10s -> %-10s : %s\n" "$src" "$dst" "$result"
  done
done
```

실행 결과:

- **STEP 1 (IP 동적 추출)**: 5노드 IP가 정확히 추출됨. 정상.
- **STEP 2 (`/etc/hosts` 일괄 정비)**: 4노드 모두 누락 노드 매핑 추가됨. 정상.
- **STEP 3 (양방향 SSH 검증)**: **16/20 페어 실패**. 다음 패턴.

```markdown
=== 양방향 SSH 검증 ===
  pve-nd01   -> pve-nd02   : Host key verification failed.
  pve-nd01   -> pve-nd03   : Host key verification failed.
  pve-nd01   -> pve-nd04   : Host key verification failed.
  pve-nd01   -> pve-nd05   : Host key verification failed.
  pve-nd02   -> pve-nd01   : Host key verification failed.
  ... (nd02, nd03, nd04 모두 동일 패턴 — 16건 실패)
  pve-nd05   -> pve-nd01   : pve-nd01      ← 4건만 성공
  pve-nd05   -> pve-nd02   : pve-nd02
  pve-nd05   -> pve-nd03   : pve-nd03
  pve-nd05   -> pve-nd04   : pve-nd04
```

이 결과의 의미는 명확하다.

`BatchMode=yes`는 SSH를 비대화형 모드로 강제하며, **처음 보는 호스트의 키를 자동 등록하지 않고 거부**한다. nd01~nd04는 hostname resolution이 정비되기 전이라 다른 노드로 SSH를 시도한 적이 없고, 따라서 `~/.ssh/known_hosts`에 다른 노드의 호스트 키가 등록된 적이 없다. nd05만 성공한 이유는 핸드북 작성자가 챕터 00 시점에 nd05에서 다른 4노드로 직접 SSH를 시도한 적이 있어 그 시점에 `Warning: Permanently added ... (ED25519) to the list of known hosts.` 메시지와 함께 키가 등록되었기 때문.

즉 hostname resolution은 정비됐지만, **SSH host key 신뢰 관계가 별도로 확립되어야 한다**는 사실이 새로 드러났다.

#### 7.1.3 3차 제안 (`pvecm updatecerts --force`) — 격자 평가 누락 사례 (보류)

핸드북 작성자는 2차 시도 결과를 받은 직후 다음 명령을 사용자에게 제안했다.

```bash
# (제안되었으나 실행되지 않은 명령)
ssh "$n" "pvecm updatecerts --force"
```

명분: Proxmox는 `/etc/ssh/ssh_known_hosts`를 pmxcfs 위의 `/etc/pve/priv/known_hosts`로 심볼릭 링크하여 5노드 전체에 SSH 키가 자동 전파되도록 설계되어 있다. `pvecm updatecerts --force`가 이 동기화를 트리거한다.

그러나 사용자가 실행 직전에 멈췄다. **"이거 막 내가 건드려도 문제 없는 부분인 거 맞아?"**

이 멈춤이 결정적으로 옳았다. 작성자가 격자 평가를 건너뛰고 명령을 던졌기 때문이다. 사후 격자 평가 결과:

| 차원          | 평가                   | 근거                                                                                                           |
| ------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Blast Radius  | **L4 (클러스터 전체)** | pmxcfs 동기 파일을 변경. 5노드 모두 즉시 전파. 더 나아가 `--force`는 **PVE Web UI SSL 인증서까지 강제 재발급** |
| Reversibility | **R3**                 | 자동 백업 안 됨. 잘못 들어가면 known_hosts와 인증서를 수동 복구 필요                                           |
| 격자 셀       | **L4 × R3 = 금지**     | 챕터 00 §3.3 격자에서 "금지" 영역                                                                              |

핵심 부작용:

- **Web UI 세션 강제 종료**: 5명 테스터 모두 8006 포트 세션이 끊긴다
- **CMP 인증서 fingerprint 재등록 필요 가능성**: CMP가 PVE 인증서 fingerprint를 pinning한다면, 갱신 후 모든 API 호출이 인증서 검증 실패로 떨어질 수 있다. 5월 첫째주 STN 직전 시점에 이 사고가 나면 일정 영향이 크다.
- **단독 판단 금지 작업**: 격자상 클러스터 운영 책임자의 합의가 필요한 작업이다.

작성자는 본 명령을 자동화 편의를 위해 제안했고, 격자 평가를 누락했다. 이는 핸드북의 정찰 철학(챕터 00 §3)에 정면으로 위배되는 제안이었다. 사용자의 멈춤 판단이 작성자의 누락을 잡아냈다.

본 항목은 **핸드북에 박제되는 사례**다. 핸드북 사용자에게 두 메시지를 동시에 보낸다.

1. **작성자(AI 또는 인간)의 제안을 무비판 수용하지 말 것.** 모든 제안에 대해 사용자 자신이 격자 평가를 한 번 더 거친다.
2. **"이거 건드려도 되나?" 한 마디의 가치.** 자신감 있는 명령 앞에서도 멈출 수 있는 것이 정찰 철학의 가장 깊은 적용이다.

#### 7.1.4 4차 시도 — 사용자 재평가로 도출된 수동 정비 (성공)

3차 제안 보류 후, 사용자가 더 좁은 대안을 제안했다. **"그냥 내가 일일이 각 노드에 들어가서, 다른 노드들에 SSH 연결을 시도하는 건 어때?"**

이 방식의 격자 평가:

| 차원          | 평가               | 근거                                        |
| ------------- | ------------------ | ------------------------------------------- |
| Blast Radius  | **L1**             | `~/.ssh/known_hosts` (사용자별 파일)만 변경 |
| Reversibility | **R1**             | 잘못된 줄만 삭제하면 즉시 복구              |
| 격자 셀       | **L1 × R1 = 안전** | 격자상 가장 안전한 영역                     |

같은 목적(노드 간 SSH 신뢰 확립)에 두 방식의 격자가 완전히 다르다. 사용자의 방식이 압도적으로 좁다.

##### 절차

각 노드에 직접 로그인 후, 다른 4노드로 SSH를 한 번씩 시도. 5노드 × 4 = 20회.

```markdown
pve-nd0X에 로그인 후:
  ssh pve-nd01 hostname
  ssh pve-nd02 hostname
  ssh pve-nd03 hostname
  ssh pve-nd04 hostname
  ssh pve-nd05 hostname    # 자기 자신은 skip
```

처음 보는 노드면 다음 프롬프트:

```markdown
The authenticity of host 'pve-nd02 (10.99.10.12)' can't be established.
ED25519 key fingerprint is SHA256:....
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

`yes` 입력 시 `~/.ssh/known_hosts`에 등록되고 hostname 출력. 이미 등록된 노드는 yes 프롬프트 없이 바로 hostname 출력.

##### 검증 결과

5노드 모두 작업 후 양방향 검증 (5×4 = 20 페어):

```markdown
=== 양방향 SSH 검증 ===
  pve-nd01   -> pve-nd02   : pve-nd02
  pve-nd01   -> pve-nd03   : pve-nd03
  pve-nd01   -> pve-nd04   : pve-nd04
  pve-nd01   -> pve-nd05   : pve-nd05
  pve-nd02   -> pve-nd01   : pve-nd01
  pve-nd02   -> pve-nd03   : pve-nd03
  pve-nd02   -> pve-nd04   : pve-nd04
  pve-nd02   -> pve-nd05   : pve-nd05
  pve-nd03   -> pve-nd01   : pve-nd01
  pve-nd03   -> pve-nd02   : pve-nd02
  pve-nd03   -> pve-nd04   : pve-nd04
  pve-nd03   -> pve-nd05   : pve-nd05
  pve-nd04   -> pve-nd01   : pve-nd01
  pve-nd04   -> pve-nd02   : pve-nd02
  pve-nd04   -> pve-nd03   : pve-nd03
  pve-nd04   -> pve-nd05   : pve-nd05
  pve-nd05   -> pve-nd01   : pve-nd01
  pve-nd05   -> pve-nd02   : pve-nd02
  pve-nd05   -> pve-nd03   : pve-nd03
  pve-nd05   -> pve-nd04   : pve-nd04
```

**20/20 페어 모두 hostname 정상 출력.** SSH host key 신뢰 확립 완료. `/etc/hosts` 정비 + SSH known_hosts 정비 둘 다 완결.

##### 자동화 대안 (참고용 — 채택되지 않음)

수동 정비와 동일한 격자(L1 × R1)에서 자동화 가능한 대안이 존재한다. `ssh-keyscan` 기반.

`ssh-keyscan`은 SSH 연결을 만들지 않는다. TCP 핸드셰이크에서 호스트 키만 받아오고 즉시 종료. 인증 시도가 없으므로 부작용도 없다.

```bash
# (참고용 — 본 환경에서는 수동 정비를 채택했음)
TARGET_NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"

# STEP 1: 5노드 host key 수집 (등록 전 화면 확인용)
for n in $TARGET_NODES; do
  echo "--- [$n] ---"
  ssh-keyscan -t ed25519,rsa,ecdsa -T 3 "$n" 2>/dev/null
done

# STEP 2: 사용자 확인
read -p "위 키들을 5노드의 ~/.ssh/known_hosts에 등록할까? [y/N] " confirm
[ "$confirm" != "y" ] && { echo "중단"; exit 1; }

# STEP 3: 각 노드의 known_hosts에 5노드 키 등록 후 중복 제거
for n in $TARGET_NODES; do
  for dst in $TARGET_NODES; do
    [ "$n" = "$dst" ] && continue
    ssh "$n" "ssh-keyscan -t ed25519,rsa,ecdsa -T 3 $dst 2>/dev/null >> ~/.ssh/known_hosts"
  done
  ssh "$n" "sort -u -o ~/.ssh/known_hosts ~/.ssh/known_hosts"
done
```

본 환경에서는 **명시성을 우선시하여 수동 정비를 채택**했다. 향후 노드가 추가되어 정비 횟수가 늘어나면 위 자동화 대안이 가치를 갖는다.

#### 7.1.5 정비 사이클 요약

| 단계       | 시점               | 결과                                | 새로 발견된 결함             |
| ---------- | ------------------ | ----------------------------------- | ---------------------------- |
| 1차        | 챕터 01 작성 직후  | 실패 (한 줄도 추가 안 됨)           | 논리 결함 + 마스킹 정책 결함 |
| 2차        | v2 정책 적용 후    | 부분 성공 (`/etc/hosts` 정비 완료)  | SSH host key 미등록          |
| 3차 (보류) | 작성자 자동화 제안 | 사용자 멈춤 판단으로 실행 보류      | **작성자의 격자 평가 누락**  |
| 4차        | 사용자 재평가 후   | **완전 성공** (20/20 SSH 페어 정상) | (없음 — 정비 종결)           |

이 사이클이 **핸드북의 핵심 가치**다. 어떤 정찰·정비도 한 번에 끝나지 않는다. 매 시도마다 새로운 결함이 드러나고, 그 결함이 다음 시도의 입력이 된다.

특히 3차 → 4차 전환은 핸드북 사용자에게 가장 중요한 메시지를 전달한다. **작성자(AI 또는 인간)의 자신감 있는 제안 앞에서도 사용자가 멈출 수 있어야 한다.** 핸드북의 격자 평가는 작성자 시점에서뿐 아니라 사용자 시점에서도 다시 한 번 적용된다. 두 평가가 모두 통과해야 안전한 작업이다.

#### 7.1.6 전제 조건 검증 (4차 방식 — 수동 정비)

4차 방식은 별도의 도구·전제 조건이 필요 없다. 다음만 확인하면 된다.

```bash
# (1) 자기 노드의 ~/.ssh/known_hosts 백업 (안전망)
[ -f ~/.ssh/known_hosts ] \
  && cp ~/.ssh/known_hosts ~/.ssh/known_hosts.bak.$(date +%Y%m%d-%H%M%S) \
  || echo "known_hosts 없음 (신규 생성될 예정)"

# (2) 다른 노드 hostname resolution 정상 (7.1.2 정비 완료 전제)
for n in pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05; do
  getent hosts "$n" || echo "[FAIL] $n hostname resolution 실패"
done
```

(2)가 실패하면 7.1.2의 `/etc/hosts` 정비가 미완료라는 뜻이다. 7.1.2부터 다시 진행한다.

이 정비가 완료되어 라이브 마이그레이션·ZFS Replication 같은 hostname 의존 작업이 안전하게 가능해졌다.

---

## 부록 A. 명령 치트 시트

```bash
# === 30초 내 정상 1차 체크 ===
NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"
for n in $NODES; do
  ssh "$n" "pvecm status 2>&1 | grep -E '^Quorate|^Total votes|^Ring ID' | tr '\n' ' ' && echo '|'$n"
done
ha-manager status | head -10

# === 5노드 corosync 링 상태 한 번에 ===
for n in $NODES; do
  echo "=== [$n] ==="
  ssh "$n" "corosync-cfgtool -s | grep -E 'LINK ID|nodeid'"
done

# === pmxcfs 동기 검증 ===
for n in $NODES; do
  ssh "$n" "md5sum /etc/pve/corosync.conf /etc/pve/storage.cfg"
done | sort -k 2 | uniq -f 1 -c
# 출력의 첫 컬럼이 5이면 5노드 모두 동일 (정상)
# 출력에 5가 아닌 숫자가 보이면 비동기 — 즉시 중단

# === KNET 통계 (omping 대안) ===
corosync-cmapctl | grep stats | grep -E 'tx_total|rx_total|down_count'

# === 24시간 corosync/pmxcfs 경고 ===
for n in $NODES; do
  echo "=== [$n] ==="
  ssh "$n" "journalctl -u corosync -u pve-cluster --since '24 hours ago' -p warning --no-pager | tail -20"
done

# === HA 자원 분포 ===
ha-manager status

# === Ring ID 변천 (멤버십 변경 이력) ===
journalctl -u corosync --since '7 days ago' | grep -E 'Ring ID|membership'
```

## 부록 B. 다음 챕터로의 인계

| 본 챕터 발견                                  | 챕터 02 (노드 정찰) 처리                              |
| --------------------------------------------- | ----------------------------------------------------- |
| pve-nd01 task 카운터가 다른 노드보다 7~10% 큼 | 노드 부하의 정량적 분석. cron, VM, SSH 세션 분포 확인 |
| nd02·nd03 동시 부팅 (2분 17초 차)             | 셋업 자동화 흔적. 노드별 H/W·BIOS·커널 일관성 검증    |
| 단일 랙 5노드 메타                            | 노드 H/W 인벤토리 시 랙 도식화                        |

| 본 챕터 발견                  | 챕터 04 (스토리지 정찰) 처리                         |
| ----------------------------- | ---------------------------------------------------- |
| MTU 1397 (점보 프레임 미사용) | NFS/iSCSI 성능 베이스라인 측정 시 MTU 영향도 분석    |
| storage.cfg 15:57:16 변경     | 변경 audit 메커니즘 도입 (다중 테스터 환경에서 필수) |

| 본 챕터 발견           | 챕터 06 (가상 자원 인벤토리) 처리 |
| ---------------------- | --------------------------------- |
| HA 자원 7개 노드 분포  | VMID 명명 컨벤션 자생적 형성 추적 |
| vm:100002 (6자리 VMID) | CMP 자동 생성 자원 식별 패턴 확립 |
| vm:9503 `ignored` 상태 | HA 격리 사유 추적                 |

| 본 챕터 발견             | 챕터 08 (위험 매트릭스) 처리                          |
| ------------------------ | ----------------------------------------------------- |
| corosync watchdog 미활성 | P0 보안 결함으로 등록                                 |
| 단일 랙 5노드            | 랙 단위 장애 시 클러스터 전체 동시 다운 시나리오 등록 |

## 부록 C. 참고 자료

| 주제                         | URL                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Proxmox Cluster Manager 공식 | https://pve.proxmox.com/wiki/Cluster_Manager                                      |
| pmxcfs 공식 문서             | https://pve.proxmox.com/wiki/Proxmox_Cluster_File_System_(pmxcfs)                 |
| Corosync 공식 (votequorum)   | https://manpages.debian.org/bookworm/corosync/votequorum.5.en.html                |
| Corosync KNET                | https://manpages.debian.org/bookworm/corosync/corosync.conf.5.en.html             |
| Proxmox HA Manager           | https://pve.proxmox.com/wiki/High_Availability                                    |
| omping (설치 시 참고)        | https://github.com/troglobit/omping                                               |
| 본 시리즈 모태 학습 시리즈   | `notes/linux/proxmox/06-references/07-troubleshooting.md` §8.5 KNET 토큰 타임아웃 |

---

> **다음 챕터**: `02-node-reconnaissance.md` — 5노드 각각의 H/W 베이스라인, 부하 분포, NUMA, 시간 동기화의 노드 간 비교를 다룬다. 본 챕터에서 식별된 nd01 부하 집중과 nd02 상시 부하의 원인을 추적한다.
