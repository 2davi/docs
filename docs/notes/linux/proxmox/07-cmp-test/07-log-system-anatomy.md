---
title: "07. 로그 시스템 해부 — journald·pvedaemon·작성자 추적"
date: 2026-04-25
lastmod: 2026-04-25
author: "Davi"
description: "5노드 Proxmox 클러스터의 journald·pve 로그·wtmpdb·iSCSI 로그 구조를 해부한다. 챕터 02의 nd04 /var/log 축적 의심과 챕터 06의 VM 작성자 추적 과제를 해소하고, iSCSI 유령 LUN의 로그 계층 영향을 별도 워크로그에 인계한다."
slug: "log-system-anatomy"
section: "notes"
category: "linux/proxmox/cmp-test"
tags: [proxmox, log, journald, pvedaemon, wtmpdb, logrotate, author-tracking, cmp]
order: 7
series: "CMP Pre-Test Reconnaissance Handbook"
series_order: 7
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1.1"
---

## 0. 이 챕터의 정찰 목적

로그는 이 핸드북의 **다른 모든 챕터가 주장하는 사실을 검증**하는 최종 레퍼런스다. 챕터 01이 "클러스터 정족수 OK"라고 말할 때, 챕터 02가 "nd02가 3일간 고부하"라고 말할 때, 챕터 05가 "CMP 요청이 nd01에 집중"이라고 말할 때 — 이 모든 판단의 1차 증거는 로그에 남아 있다.

본 챕터는 그 로그의 **저장 위치·용량·로테이션·조회 방법·작성자 추적 경로**를 해부한다. 실제 로그 내용의 해석은 다른 챕터에서 이미 많이 다뤘다. 본 챕터는 **"로그 그 자체를 시스템으로 본다"**.

### 0.1 핸드북과 보조 워크로그 시리즈의 관계

본 핸드북은 **클러스터 전체의 시점별 스냅샷**을 담는다. 이와 별도로 **`CMP Pre-Test WorkLogs`** 시리즈가 운영되며, 이는 **특정 작업(예: 스토리지 프로비저닝, 유령 세션 진단)의 종적 기록**이다.

두 시리즈의 역할 분리:

| 축        | 핸드북             | WorkLogs                   |
| --------- | ------------------ | -------------------------- |
| 시야      | 클러스터 전체 상태 | 단일 작업 전 과정          |
| 시간      | 수집 시점 스냅샷   | 작업 시작~종료 연속 기록   |
| 대상 독자 | 팀 전체·STN 준비자 | 자기 자신·미래의 자기      |
| 깊이      | 계층 간 연결·정책  | 단일 문제의 근본 원인·해결 |

**상호 참조 원칙**: 핸드북이 "현상"을 박제하면, 해당 현상의 **원인 진단·해결 과정**은 WorkLogs의 해당 편에 위임한다. 본 챕터 §2.4에서 iSCSI 에러 45만 건 현상을 다루면서, 그 원인 진단은 이미 작성된 워크로그에 참조 링크로 연결하는 방식이 여기서 처음 적용된다.

### 0.2 본 챕터가 해소하는 미결 항목

| 출처                | 항목                                            | 본 챕터 §        |
| ------------------- | ----------------------------------------------- | ---------------- |
| 챕터 02 §2.10·§7.11 | nd04 /var/log 과다 축적 의심                    | §2.1 — 확정 해소 |
| 챕터 02 §2.8        | nd05 `crash` 태그 10+건의 부팅 경계 확인        | §2.2             |
| 챕터 05 §2.10       | nd02/nd04 mgmt 평면 iSCSI 세션의 로그 계층 영향 | §2.4             |
| 챕터 06 §2.7        | VM 112 작성자 추적 — pvedaemon access log       | §2.5, §2.9       |
| 챕터 06 §2.8        | VM 802 마이그레이션 실패 정확한 시각 로그       | §2.6             |

---

## 1. 개념 — 본 챕터 이해에 필요한 최소 배경

### 1.1 systemd-journald — 현대 리눅스 로그의 중심

Debian Trixie 기반 Proxmox VE 9.1은 **systemd-journald**를 중앙 로그 수집기로 사용한다. 전통적 `/var/log/syslog`·`/var/log/messages`의 역할이 journald의 바이너리 저널로 대부분 이관되었고, 각 서비스·커널 메시지·사용자 이벤트가 이곳에 모인다.

저장 위치:

```markdown
/var/log/journal/{machine-id}/*.journal
```

`machine-id`는 각 노드 고유의 UUID. 본 환경 5노드 모두 `/var/log/journal/` 하위에 각자 디렉터리가 있다.

**journald의 조회는 `journalctl` 명령 하나로 통일**되며, 다음 옵션이 핵심.

| 옵션                | 용도                              |
| ------------------- | --------------------------------- |
| `-u {service}`      | 특정 systemd unit의 로그만        |
| `-p {priority}`     | 우선순위 필터 (0=emerg ~ 7=debug) |
| `--since / --until` | 시간 범위                         |
| `-b {N}`            | N번째 부팅 세션의 로그 (0=현재)   |
| `-f`                | 실시간 follow (tail -f 상응)      |
| `--list-boots`      | 부팅 세션 목록                    |

### 1.2 journald 저장 용량 정책 — `SystemMaxUse`

journald 기본 정책은 다음 중 먼저 도달하는 값으로 용량을 제한한다:

1. `/var/log/journal`이 위치한 파일시스템의 **10%**
2. 파일시스템의 **여유 공간 15%**가 남을 때까지
3. 명시적 설정 `SystemMaxUse={bytes}`

본 환경의 `/etc/systemd/journald.conf`는 `[Journal]` 섹션만 있고 **설정 값 모두 주석 처리된 상태**(§2.1). 즉 모든 기본값 적용. rpool이 크므로(챕터 03 기준 약 236G) 10% ≈ 23GiB까지 자동 확장 가능. nd04의 2.8GiB는 아직 임계 근처 아님.

### 1.3 PVE 자체 로그 — `/var/log/pve/`와 task log

journald와 병행하여 PVE는 자체 로그 구조를 운영.

```markdown
/var/log/pve/
├── tasks/                        # 모든 비동기 작업의 이력
│   ├── 0/ 1/ 2/ ... E/ F/        # UPID 마지막 16진수로 분산
│   ├── index                     # 최근 작업 인덱스
│   └── index.1                   # 어제 인덱스 (로테이션됨)
├── replicate/                    # 스토리지 replication 작업 로그
└── (기타)

/var/log/pveproxy/                # PVE Web UI 접근·에러 로그 (Apache 스타일)
/var/log/pve-firewall.log         # PVE firewall 이벤트
```

**task log의 UPID 구조**는 다음과 같이 파싱된다:

```markdown
UPID:pve-nd01:00397E4D:1228D275:69EB1085:qmconfig:102:test_testerB@pve:
    └노드    └PID    └시작틱  └Unix시각  └작업종류  └대상 └실행 주체
```

UPID는 "Unique Process ID"의 약자. **`qmigrate:802`는 "VM 802 마이그레이션 작업"**, `qmconfig:102`는 "VM 102 config 변경" 등.

본 챕터에서 **작성자 추적의 핵심은 UPID의 마지막 필드(실행 주체)**다. `test_testerB@pve`, `admin01@pve`, `root@pam` 같은 식으로 PVE 인증 사용자가 찍혀 있다.

### 1.4 `wtmpdb` — 로그인 이력 관리의 변화

Debian Trixie 이후 전통적 `utmp`/`wtmp` 대신 **`wtmpdb`** (SQLite 기반)로 로그인 이력을 관리. 조회는 여전히 `last` 명령으로 가능하나 내부적으로 `wtmpdb` 읽음.

`wtmpdb begins {timestamp}` 라인이 **최초 기록 시각**을 보여준다. 그 이전의 로그인 이력은 저장되지 않음. 본 환경 5노드의 `wtmpdb begins`는 대부분 **2026-04-20~04-23** 범위 — 즉 **최근 5일치만 기록**되는 상태(§2.7).

이는 `wtmpdb`의 자체 로테이션 또는 이전 버전(`utmp`) 마이그레이션 시점과 관련. 본 환경 운영 중 `wtmpdb` 파일을 주기적으로 정리하는 cron 없음을 확인(챕터 02 §2.11의 crontab 분석). 즉 **기본 rotation**(weekly)이 적용 중.

### 1.5 logrotate — 전통 로그의 관리

journald 외에 전통적 text 로그도 여전히 존재한다(PVE의 `/var/log/pve/*`, `pveproxy/*`, firewall log 등). 이들은 `logrotate`에 의해 관리.

본 환경 5노드 `/etc/logrotate.conf` 공통 설정:

```markdown
weekly            # 주간 로테이션
rotate 4          # 최근 4주치 유지
create            # 로테이션 후 새 파일 생성
include /etc/logrotate.d
```

`/etc/logrotate.d/` 하위 개별 설정 파일들로 서비스별 정책 세밀 조정. 본 환경 5노드 모두 다음 설정 파일 존재:

```markdown
alternatives, apt, btmp, ceph-common, chrony, corosync, dpkg, frr, pve, pve-firewall, wtmp, wtmpdb
```

nd03, nd05는 **`openvswitch-switch` 추가** — 과거 OVS 사용 흔적이 설정 파일에 남아있으나 현재 활성 여부는 확인 필요.

### 1.6 iSCSI 로그 — `iscsid` 데몬의 journald 통합

`iscsid`(Open-iSCSI initiator)는 독자적 로그 파일 없이 **journald로만 출력**한다. `journalctl -u iscsid`로 조회. 본 환경 5노드의 iSCSI 이벤트가 journald에 직접 적재되며, 이것이 §2.4에서 다룰 대량 에러 로그의 저장 주체.

### 1.7 pvedaemon access log — 작성자 추적의 금맥

PVE 관리 UI와 API의 모든 인증·작업 시도는 `pvedaemon`에 로그된다. journald에서 `journalctl -u pvedaemon`으로 조회.

```markdown
Apr 24 15:41:03 pve-nd01 pvedaemon[3743212]: <root@pam> successful auth for user 'root@pam'
Apr 24 15:41:03 pve-nd01 pvedaemon[3764676]: <test_testerB@pve> update VM 102: -delete scsi2
```

**각 작업 시 실행 주체와 대상이 명시**된다. 이 로그를 시간 역순으로 추적하면 "2026-04-22 13:14에 VM 112 config를 편집한 사람"을 찾는 것이 가능.

---

## 2. 정찰 명령과 출력 해석

데이터 수집: 2026-04-25. 5노드 동시 수집.

### 2.1 /var/log 용량 분포 — 🟡 nd04 과다의 정체 확정

`du -sh /var/log` 5노드 결과:

| 노드         | /var/log 총 | 그중 /var/log/journal | 판독                           |
| ------------ | ----------- | --------------------- | ------------------------------ |
| pve-nd01     | 983M        | **948M (96.4%)**      | journal이 거의 전부            |
| pve-nd02     | 318M        | 314M (98.7%)          | 동일 경향                      |
| pve-nd03     | 291M        | 285M (97.9%)          | 동일 경향                      |
| **pve-nd04** | **2.9G**    | **2.8G (96.5%)**      | **🔴 최대 — 챕터 02 의심 해소**|
| pve-nd05     | 679M        | 671M (98.8%)          | 동일 경향                      |

**판독**:

1. **챕터 02 §2.10에서 제기된 "nd04 /var/log 12GiB 의심"은 실측 2.9GiB로 과대 추정**이었다. 챕터 02 수집 시점(2026-04-23)의 `du -sh /` 결과에서 nd04의 ROOT이 12GiB였던 것은 `/var/log` 외 다른 경로(예: 이미 언급된 `/var/lib/vz` 등) 기여였을 가능성. 본 챕터 실측이 최신·정확.
2. **nd04가 다른 노드의 3배~10배 크기**인 것은 사실. 원인 추정:
   - **nd04의 가동 시간은 16일**(챕터 02 §2.8) — 중위 수준. 가동 시간 자체가 원인 아님
   - **VM 106 (58-CICD)가 nd04 주력**(챕터 02 §2.5) — CI/CD 워크로드는 빈번한 로그 생성 유발 가능
   - **iSCSI 유령 LUN 에러 대량**(§2.4) — nd04에서 하루 103,022건. 쌓이는 주 원인
3. **5노드 모두 journald가 /var/log의 96~99% 점유**. 전통적 text 로그의 비중은 미미(pveproxy가 nd05에서 3.5M로 두 번째 큰 정도). **로그 관리의 초점은 journald 정책**이어야 함.

#### 2.1.1 journalctl --disk-usage와의 일치 검증

`journalctl --disk-usage`는 archived + active journal의 합계를 보고:

| 노드 | `du` 기준 | `journalctl` 기준 | 차이 |
| ---- | --------- | ----------------- | ---- |
| nd01 | 948M      | 947.5M            | ≈ 0  |
| nd02 | 314M      | 312.9M            | ≈ 0  |
| nd03 | 285M      | 284.3M            | ≈ 0  |
| nd04 | 2.8G      | 2.8G              | ≈ 0  |
| nd05 | 671M      | 670.9M            | ≈ 0  |

완전 일치. `/var/log/journal` 외부에 숨은 journal 없음. 측정 신뢰도 높음.

#### 2.1.2 journald 설정 — 기본값 운영

5노드 모두 `/etc/systemd/journald.conf`가 **`[Journal]` 섹션 뿐**, 아래 설정 라인 모두 주석 또는 미지정:

```markdown
[Journal]
# (본 환경 5노드 모두 이 상태, 실제 설정 키 없음)
```

즉 모든 기본값 적용:

- `Storage=auto` → `/var/log/journal` 존재하므로 persistent 저장
- `SystemMaxUse=` 미지정 → 파일시스템의 10% 또는 15% free 중 작은 값
- `SystemKeepFree=` 미지정 → 15%
- `MaxRetentionSec=` 미지정 → 영구 보존 (용량 한계 도달 시 FIFO)
- `MaxFileSec=1month` (기본)

**함의**: 본 환경은 journald가 **자동으로 용량을 관리**하고 있으며, 수동 용량 제한이 없다. rpool 236G의 10% = 약 23GiB까지 자동 확장 가능. nd04의 2.8GiB는 임계의 약 12% 수준 — 안정적.

단 **장기적으로 관리 부재의 리스크**가 있다. 특히 iSCSI 유령 LUN 에러가 지속되면(§2.4) 하루 수십MiB씩 누적된다. 한 달 기준으로는 GiB 단위. 챕터 04의 스토리지 정비가 완료되면 이 증가율이 크게 줄 것.

**권고** (운영팀 범위): `SystemMaxUse=5G` 명시 설정. 어느 노드도 5GiB 초과하지 않도록. 단 현재 운영에 긴급 필요 없음.

### 2.2 journalctl --list-boots — 5노드 부팅 경계 확정

챕터 02 §2.8에서 `last reboot` 기준으로 정리한 부팅 이력을 journald 기준으로 재검증.

| 노드     | 부팅 기록 수 | 현재 세션 시작   | 특이사항                                             |
| -------- | ------------ | ---------------- | ---------------------------------------------------- |
| nd01     | 3개          | 2026-03-20 09:23 | 34일 연속 가동, 3월 초 설정 시도 2회                 |
| nd02     | 2개          | 2026-03-05 15:39 | **49일 연속 가동**                                   |
| nd03     | 2개          | 2026-03-05 15:41 | **49일 연속 가동**                                   |
| nd04     | 2개          | 2026-04-07 08:42 | 16일 연속 (4/6 20:05 graceful shutdown 후 익일 기동) |
| **nd05** | **11개**     | 2026-04-23 11:18 | **장기 반복 reboot — HA 시험**                       |

nd05의 11개 부팅 이력 중 4/15~4/17 구간에 6회 집중:

```markdown
-7  Wed 2026-04-15 15:37  ~  16:45
-6  Wed 2026-04-15 17:23  ~  17:56
-5  Wed 2026-04-15 17:59  ~  Thu 04-16 10:00
-4  Thu 2026-04-16 10:04  ~  14:37
-3  Thu 2026-04-16 14:47  ~  Fri 04-17 09:42
-2  Fri 2026-04-17 10:02  ~  10:03
-1  Fri 2026-04-17 11:03  ~  Thu 04-23 11:15
 0  Thu 2026-04-23 11:18  ~  현재 (작성자가 수동 reboot)
```

**판독**:

1. **4/15~4/17 기간의 6회 reboot은 `wtmpdb`의 `crash` 태그와 일치** — 챕터 02 §1.4의 원칙대로, 이 시점은 **테스트 팀 합류(4/20) 이전**이므로 개발팀의 HA 페일오버 시험으로 재분류. journald 경계 시점이 이 판단을 보강한다.
2. **`-2`의 1분짜리 세션**(10:02~10:03)은 특이. 부팅 후 1분 만에 다시 종료된 이 세션은 **BIOS 수준의 빠른 재부팅 또는 구성 오류 진단** 흔적일 수 있다. 그러나 현 시점에서 확인 불가능하며 운영에 영향 없음.
3. **journald의 부팅 경계와 `wtmpdb last reboot`이 일치**하는 것은 시스템 일관성의 증거. 불일치가 나타나면 systemd 또는 PAM의 buggy 상태 시사.

### 2.3 오늘의 ERROR 로그 집계 — 🔴 5노드 합계 ≈45만 건

`journalctl --since today -p err | wc -l` 5노드:

| 노드         | ERROR 건수 (24시간) | 분당 평균  | 주요 원인                               |
| ------------ | ------------------- | ---------- | --------------------------------------- |
| **pve-nd01** | **131,968**         | **≈92/분** | iSCSI `target not found`                |
| pve-nd02     | 108,735             | ≈76/분     | iSCSI `target not found`                |
| pve-nd03     | 13,217              | ≈9/분      | VM 702 qga timeout + postfix aliases.db |
| **pve-nd04** | **103,022**         | ≈72/분     | iSCSI `target not found`                |
| pve-nd05     | 94,136              | ≈65/분     | iSCSI `target not found`                |
| **합계**     | **≈451,000**        |            |                                         |

**5노드 중 nd03만 iSCSI 에러가 없다**. 이는 챕터 05 §2.10에서 발견한 "nd03의 iSCSI 세션이 3개만"인 사실과 정확히 일치한다 — **유령 LUN 접속 시도를 할 target 자체가 initiator DB에 적게 등록**되어 있기 때문.

#### 2.3.1 nd03의 독특한 에러 패턴

nd03은 다른 노드와 달리 두 종류의 에러가 주력:

```markdown
Apr 24 00:00:03 pve-nd03 pvescheduler[2219753]: VM 702 qga command failed - VM 702 qga command 'guest-ping' failed - got timeout
Apr 24 00:26:04 pve-nd03 postfix/local[2241898]: error: open database /etc/aliases.db: No such file or directory
```

**VM 702 qga timeout**: `pvescheduler`가 **5분마다 VM의 QEMU Guest Agent에 ping**을 보내는데, VM 702가 응답하지 않음. QGA가 VM 내부에 설치되지 않았거나, 서비스가 정지 상태. 5분 간격으로 에러 2건 × 24시간 = **≈576건/일**이 VM 702 한 건으로 발생. 챕터 06 §2.12에서 VM 702의 3 snapshot이 2026-03-19 이후 없는 "실험 종료 상태"임을 확인했으므로, QGA도 방치된 것으로 추정.

**postfix aliases.db 없음**: `/etc/aliases.db`는 postfix의 aliases 해시 데이터베이스. 이 파일이 없으면 매 메일 발송 시도마다 에러. 즉 **로컬 postfix가 설치돼 있으나 초기 설정 미완**. `postalias /etc/aliases` 한 번이면 해소. 그러나 본 환경에서 메일 발송 자체가 거의 사용되지 않으므로 즉시 수정하지 않아도 영향 없음.

### 2.4 iSCSI 유령 LUN 에러 — 45만 건 로그 폭탄의 정체

5노드 공통으로 나타나는 **`initiator error - target not found (02/03)`** 패턴은 다음 형태로 매초 수 회 반복.

```markdown
Apr 24 00:00:00 pve-nd01 iscsid[1885]: connection8:0 login rejected: initiator error - target not found (02/03)
Apr 24 00:00:01 pve-nd01 iscsid[1885]: connection9:0 login rejected: initiator error - target not found (02/03)
Apr 24 00:00:01 pve-nd01 iscsid[1885]: connection6:0 login rejected: initiator error - target not found (02/03)
...
```

#### 2.4.1 원인 진단의 위임 — 워크로그 참조

본 에러의 근본 원인과 해결 절차는 이미 본 저자의 워크로그에서 상세 진단되었다:

> **참조**: `CMP Pre-Test WorkLogs` 시리즈 — `2026-04-24-iscsi-multi-storage-provisioning`
> - §1 "iSCSI 스토리지의 3계층 책장" — Open-iSCSI Node DB의 영속성 원리
> - §4.5 "세션 상태 전수 조사" — SID ↔ Target 매핑으로 범인 교체 (원인: `testerA` 고아 3건 + 자기 구작업 SID 7)
> - §4.7 "SID 7 정리 절차" — `iscsiadm -o delete`의 실전 사용
> - §5 "잔여 과제 — 타 테스터 고아 리소스" — `testerA` 영역의 정리 문의 템플릿

본 챕터는 이 진단 결과를 전제로, **로그 계층에서 이 현상이 야기하는 파급**만 다룬다.

#### 2.4.2 로그 계층에서의 파급

유령 LUN 재접속 루프가 로그에 미치는 영향:

1. **저장 용량**: 매초 수 건의 에러가 journald에 적재. 연구 결과 약 **하루 50~80MiB**의 journal 증가를 유발(전체의 ≈2%). 장기 누적 시 GiB 단위.
2. **모니터링 노이즈**: `journalctl -p err` 필터를 써도 의미 있는 에러(OOM·disk failure·authentication 문제 등)가 **iSCSI 노이즈 속에 묻힘**. "오늘 에러 N건"이 의미를 잃음.
3. **분석 왜곡**: STN 중 문제 발생 시 로그 분석의 첫 단계가 "iSCSI 에러 제외 필터링"이 되어야 한다. 효율 저하.
4. **에러 레이트 기반 알림 시스템의 오작동**: 만약 Prometheus/Grafana가 journal ERROR 레이트를 메트릭으로 수집한다면, **모든 노드가 항상 경보 상태**가 된다. 실질 알림이 무의미해짐.

#### 2.4.3 정비 전후의 예상 로그 개선

워크로그 §5에서 제안한 `testerA` 고아 정리 + 자기 SID 7 정리가 완료되면, 5노드 ERROR 건수가 다음과 같이 줄 것으로 추정:

| 노드 | 현재    | 정비 후 예상                        |
| ---- | ------- | ----------------------------------- |
| nd01 | 131,968 | ≈500~1,000 (정상 iSCSI 정기 체크만) |
| nd02 | 108,735 | ≈500~1,000                          |
| nd03 | 13,217  | ≈576 (VM 702 qga) + ≈수백 (postfix) |
| nd04 | 103,022 | ≈500~1,000                          |
| nd05 | 94,136  | ≈500~1,000                          |

**합계 약 45만 → 약 5,000** 수준. **99% 감소**. 단일 스토리지 정비가 로그 계층에 주는 영향이 매우 크다. 이 정비가 STN 전 완료되어야 할 강한 동기가 여기서 생긴다.

### 2.5 pvedaemon access log — 사용자 인증·작업 전수

`journalctl -u pvedaemon -n 30` 5노드에서 다음 사용자 계정이 관찰됨:

| 사용자             | 관찰 빈도                      | 판독                                           |
| ------------------ | ------------------------------ | ---------------------------------------------- |
| `root@pam`         | 매우 빈번 (내부 cron·스케줄러) | 시스템 자동 작업. 추적 대상 아님               |
| `admin01@pve`      | 중간                           | **관리자 계정 — 다수 테스터가 공유 사용** 정황 |
| `test_testerB@pve` | 빈번                           | testerB의 작업 계정                            |
| `test_testerC@pve` | 빈번                           | testerC의 작업 계정                            |
| `test_lmh@pve`     | 중간                           | testerD의 계정                                 |
| `test_yhkim@pve`   | 관찰됨                         | **새로운 계정 — userMemories에 없는 사용자**   |
| `{testerSelf}@pve` | 빈번                           | 본 핸드북 작성자의 계정                        |

**판독**:

1. **`admin01@pve`가 관리자 계정으로 다수 참여**: nd02의 `vzdump --all` (2026-04-22 13:13), nd01의 잦은 `successful auth`, nd05에서 VM 101(`bani`) 집중 편집 등. 이 계정은 공용 관리자 계정일 가능성 — 누가 썼는지는 기록 안 됨. CMP 프로덕션에서 이런 공용 계정 사용은 **감사 추적 불가능** 리스크.
2. **`test_yhkim@pve` — 새 사용자**: userMemories에 없는 사용자가 VM 811에 디스크 추가 작업(2026-04-24 15:17). **새 테스터가 합류했거나 기존 테스터의 보조 계정**일 가능성. 팀에 확인 필요 — 챕터 04 협의 항목.
3. **`{testerSelf}@pve`**: 작성자 자신의 계정. 챕터 01 §7.1에서 `testerSelf`로 마스킹 정책 확정된 주체.
4. **모든 인증 로그가 journald에 남음**: 즉 **모든 로그인·모든 작업이 추적 가능**. 단 조회 명령이 복잡해 실무에서는 잘 쓰이지 않음. 본 챕터 §2.9에서 작성자 추적 실전 방법 정리.

#### 2.5.1 admin01 계정의 반복 실패 사례 (nd05 VM 101)

nd05의 pvedaemon 로그에 다음 반복 패턴:

```markdown
Apr 24 15:39:52 pve-nd05 pvedaemon: <admin01@pve> update VM 101: -delete balloon,shares,allow-ksm -memory 3584
Apr 24 15:39:52 pve-nd05 pvedaemon: cannot delete 'balloon' - not set in current configuration!
Apr 24 15:39:52 pve-nd05 pvedaemon: cannot delete 'shares' - not set in current configuration!
Apr 24 15:39:52 pve-nd05 pvedaemon: cannot delete 'allow-ksm' - not set in current configuration!
```

`admin01@pve`가 VM 101에서 **없는 옵션(`balloon`, `shares`, `allow-ksm`)을 삭제하려다 7회 반복 실패**. 각 시도 간격은 수십 초~수분.

**해석**:

- VM 101(`bani`)의 설정 정리 시도 중인 것으로 보임
- PVE WebUI에서 "삭제" 버튼을 클릭했으나 **없는 옵션을 지우는 요청**을 계속 보냄
- 사용자가 UI 동작을 오해하거나, 버그성 동작과 씨름 중

챕터 06 §2.6.3에서 VM 101(`bani`)을 "모호 사례"로 분류했는데, 본 패턴을 보면 **admin01이 정리하려고 시도 중**인 상태. 챕터 04 협의 시 `bani`의 처분 방침을 admin01과 함께 확인 권고.

### 2.6 VM 802 마이그레이션 실패 — 정확한 시각 로그

챕터 02 §2.5·챕터 06 §2.8에서 "Apr 16 경 마이그레이션 중단 후 8일 방치"로 정리한 VM 802. 본 챕터에서 **시간대별 정확한 흐름**을 로그에서 확인.

```markdown
Apr 16 13:00:18 pve-nd03 systemd: pve-dbus-vmstate@802.service: Deactivated successfully.
Apr 16 13:00:20 pve-nd03 kernel:  tap802i0: left allmulticast mode
Apr 16 13:00:20 pve-nd03 kernel:  fwbr802i0: port 2(tap802i0) entered disabled state
Apr 16 13:00:21 pve-nd03 systemd:  802.scope: Consumed 4.078s CPU time, 1.9G memory peak.
Apr 16 13:00:21 pve-nd03 pvedaemon[115614]:
   <admin01@pve> end task UPID:pve-nd03:0001D301:15925672:69E05EBF:qmigrate:802:admin01@pve: OK

Apr 16 13:05:45 pve-nd03 qm[122662]:
   <root@pam> starting task UPID:pve-nd03:0001DF27:1592DDB9:69E06019:qmstart:802:root@pam:
Apr 16 13:05:45 pve-nd03 qm[122663]: start VM 802: UPID:pve-nd03:0001DF27:1592DDB9:69E06019:qmstart:802:root@pam:
Apr 16 13:05:45 pve-nd03 systemd: Started 802.scope.
Apr 16 13:05:45 pve-nd03 kernel: tap802i0: entered promiscuous mode
```

**흐름 재구성**:

1. **13:00:18**: VM 802의 기존 QEMU 인스턴스가 `Deactivated` — 마이그레이션 시작. 출발지 노드(nd03 기준으로 마이그레이션 대상이 nd03 아닌 다른 노드 또는 반대)
2. **13:00:20~21**: bridge tap 인터페이스 제거, VM scope 4.078s CPU 소비 후 종료. **여기서 마이그레이션은 성공적으로 VM 종료**
3. **13:00:21**: `admin01@pve`가 `qmigrate:802` 작업을 **`end task ... OK`**로 종료. **마이그레이션 자체는 admin01의 관점에서 OK로 종료됨**.
4. **13:05:45** (5분 27초 후): **`root@pam`**(시스템 또는 HA)이 `qmstart:802`를 시작. 다시 기동. tap 인터페이스 재생성

**재해석** — 챕터 06 §2.8에서 "마이그레이션 중단 8일 방치"로 판정했으나, 로그 증거는 **다른 이야기**를 한다:

- admin01이 실행한 `qmigrate:802`는 **OK로 종료**
- 5분 후 `root@pam`이 다시 `qmstart:802` 수행 → VM이 **nd03에서 재기동**
- 그 이후 VM 프로세스(`ps -ef`의 `kvm -id 802`)는 여전히 `-incoming` 플래그로 살아있음

이 모순의 가능성:

- (a) **admin01의 OK는 "마이그레이션 명령 전송 성공"**이지 "마이그레이션 완료 성공"이 아닐 수 있다. QEMU의 `-incoming` 모드가 수신 대기 상태로 들어갔고, 그 후 추가 이벤트가 없어 paused 상태로 장기 잔존
- (b) `root@pam`의 `qmstart`가 **잘못된 재기동**일 수 있다. HA가 VM 상태를 오인하여 불필요 재기동을 일으킨 것

**결론**: 본 챕터는 이 사건의 완전한 재구성을 포기하지 않으나, **데이터 부족**을 인정한다. 추가 로그 분석 또는 admin01에 문의 필요. 챕터 04 인계 항목으로 이동.

### 2.7 로그인 이력 — wtmpdb 분석

5노드 `last -n 10` 결과에서 다음 패턴 관찰.

#### 2.7.1 로그인 출발지 IP 분포

접속 출발지 IP가 다음 두 대역에 집중:

- **`10.99.250.X`** 대역: 가장 빈번. 테스터 PC / 사무실 LAN 으로 추정 (챕터 05 §2.7에서도 CMP `:18080` peer로 등장)
- **`10.99.10.X`** 대역: 노드 간 상호 접속. 챕터 01 §7.1의 `/etc/hosts` 정비 작업에서 수행된 `ssh pve-ndXX` 접속 흔적

추가로 소수의 VM IP(`10.99.40.92`)에서 nd04, nd05 접속 — **VM 내부에서 호스트로 접속**. VM 9502(`92-test-vm`)가 vm 평면 `10.99.40.92`를 가지고 있어 이 소스 가능.

#### 2.7.2 `wtmpdb begins` 시각 분포

| 노드 | wtmpdb begins    |
| ---- | ---------------- |
| nd01 | 2026-04-23 17:28 |
| nd02 | 2026-04-20 17:32 |
| nd03 | 2026-04-22 09:32 |
| nd04 | 2026-04-23 14:27 |
| nd05 | 2026-04-23 17:34 |

5노드 모두 **최근 5일 이내**부터 기록 시작. 이전 이력은 wtmpdb 로테이션 또는 이전(utmp→wtmpdb) 마이그레이션 시점에 유실된 것으로 보인다. 즉 **4월 20일 이전의 root 로그인 이력은 추적 불가**.

이는 VM 112(3/4 생성, 4/22 최종 편집 추정)의 작성자 추적에 **wtmpdb는 쓸 수 없다**는 의미. journald의 pvedaemon 로그를 써야 함.

### 2.8 HA 자원 재배치 이력 — `pve-ha-lrm` 로그

`journalctl -u pve-ha-lrm` 결과에서 다음 특이 이벤트.

#### 2.8.1 VM 116의 마이그레이션 lock timeout (4/23 17:15)

```markdown
Apr 23 17:15:04 pve-nd01 pve-ha-lrm: VM isn't running. Doing offline migration instead.
Apr 23 17:15:04 pve-nd01 pve-ha-lrm: <root@pam> starting task UPID:...:qmigrate:116:root@pam:
Apr 23 17:15:09 pve-nd01 pve-ha-lrm: Task ... still active, waiting
Apr 23 17:15:14 pve-nd01 pve-ha-lrm: can't lock file '/var/lock/pve-manager/pve-migrate-116' - got timeout
Apr 23 17:15:14 pve-nd01 pve-ha-lrm: service vm:116 not moved (migration error)

Apr 23 17:15:24 pve-nd01 pve-ha-lrm: VM isn't running. Doing offline migration instead. (재시도)
Apr 23 17:15:34 pve-nd01 pve-ha-lrm: can't lock file ... - got timeout
Apr 23 17:15:34 pve-nd01 pve-ha-lrm: service vm:116 not moved (migration error)
```

**판독**:

- HA가 **정지 상태 VM 116의 오프라인 마이그레이션을 시도**. VM이 이미 멈춰있는데도 HA가 자동으로 다른 노드로 옮기려 함
- `/var/lock/pve-manager/pve-migrate-116` 파일의 **락 획득 실패**로 2회 연속 timeout
- 원인 추정: 다른 프로세스(아마 다른 노드에서의 동일 작업)가 이 lock을 잡고 있음. pmxcfs 상의 lock 파일은 5노드 공유

이 시도는 4/23 17:15 ~ 17:28 사이 여러 번 반복된 것으로 보이며(nd02/nd03의 pve-ha-lrm 로그에도 유사 패턴 관찰), 최종적으로 **VM 116은 원래 노드(nd01)에 그대로 남음** — 챕터 06 §2.3에서 `vm:116 (pve-nd01, stopped)`로 확인된 상태와 일치.

이 이벤트는 **HA 자동 재배치 로직의 미성숙**을 드러낸다. 정지된 VM까지 자동으로 옮기려는 것은 의도된 동작일 수도 있으나(노드 유지보수 시), lock 경합 관리가 부족하여 **수 분간 락 대기 → timeout → 재시도** 패턴을 5노드 모두에 유발. 로그 용량 소비 + 모니터링 노이즈의 부차 원인.

#### 2.8.2 VM 799/800 4/24 오전 리밸런싱

4/24 오전 10:58~11:25 사이 VM 799와 VM 800이 여러 번 노드 간 이동:

- nd05 → nd02 (VM 799) → nd03 → nd02
- nd04 → nd02 (VM 800) → nd01 → nd02

**5노드 HA 리밸런싱 작업이 수행된 시점**. 누가 시작했는지 pvedaemon 로그 추적 필요. 이 사건은 챕터 06 §2.6의 "799, 800 VMID 실험" 맥락과 연관.

### 2.9 작성자 추적 실전 절차

챕터 06에서 "VM 112 작성자 미상"을 추적 대상으로 박았고, 본 챕터에서 실전 절차를 정리한다.

#### 2.9.1 추적 대상 VM 선정

- **우선순위 1**: VM 112 (3일 고부하, config mtime 4/22 13:14)
- **우선순위 2**: VM 101 `bani` (admin01이 편집 시도 중)
- **우선순위 3**: VM 702 (snapshot 3개 방치, QGA 응답 없음)
- **우선순위 4**: VM 802 (마이그레이션 중단 상태)

#### 2.9.2 추적 명령 순서 (VM 112 예시)

**1단계 — config mtime 확인**:

```bash
ssh pve-nd02 "stat /etc/pve/nodes/pve-nd02/qemu-server/112.conf"
# Modify: 2026-04-22 13:14 (예시)
```

**2단계 — 해당 시각 전후 pvedaemon 로그 조회**:

```bash
ssh pve-nd02 "journalctl -u pvedaemon --since '2026-04-22 13:00' \
               --until '2026-04-22 13:30' --no-pager | grep -iE 'VM 112'"
```

결과에서 **`<{user}@{realm}>`** 부분을 추출.

**3단계 — 결과 판독**:

본 수집에서는 4/22 13:13~14에 `admin01@pve`가 `vzdump --all --mode snapshot` 백업 작업을 수행했음이 나타남. **VM 112도 이 백업 대상이었을 가능성이 높음** (`--all`이므로). 즉 **4/22 13:14의 config mtime 변경은 admin01의 백업 작업이 유발했을 가능성**. 실제 "VM 작성자"와는 무관한 부수 효과.

**4단계 — VM 생성 시점으로 회귀**:

VM 112의 `ctime=1772761175` = **2026-03-04 14:39:35 (UTC) / 2026-03-04 23:39:35 (KST)** 로 변환. 이 시각 전후 pvedaemon 로그 조회:

```bash
ssh pve-nd02 "journalctl -u pvedaemon --since '2026-03-04 14:30' \
               --until '2026-03-04 14:50' --no-pager | grep -iE 'qmcreate|VM 112'"
```

단, **nd02는 journald가 2026-03-05부터 기록됨**(§2.2). 즉 **VM 112 생성 당일의 로그는 유실됨**.

**5단계 — 대안 경로**:

- `/etc/pve/nodes/pve-nd02/qemu-server/112.conf.tmp.*` 백업 파일 (있다면)
- task log: `ls /var/log/pve/tasks/` 하위에 qmcreate 기록 (본 노드에서 실행된 경우)
- 최후 수단: Slack 질의

#### 2.9.3 VM 112의 작성자 추적 결론

**journald 부팅 경계 때문에 VM 112 작성 시점의 로그는 유실**. 본 챕터에서 추적 불가. 다음 경로로 이월:

- **Slack 전체 질의** (챕터 06 §7.3의 5번 전략): "VMID 112, 이름 `112-test-vm`의 작성자 응답 요청"
- 24시간 응답 없으면 **처분 보류 유지** (삭제 금지)

다른 VM도 같은 한계 존재. **journald 보존 기간 내에 생성된 VM**만 작성자 로그 추적 가능. 그 이전 VM은 질의 방식이 실질적.

### 2.10 dmesg 커널 경고

5노드 `dmesg -T -l err,warn` 결과:

| 노드                   | 경고 건수 | 내용                                                                                                                                                |
| ---------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| nd01, nd02, nd04, nd05 | 0         | 없음                                                                                                                                                |
| nd03                   | 2         | `sd 14:0:0:0: Power-on or device reset occurred`, `[sdj] Preferred minimum I/O size 4096 bytes not a multiple of physical block size (16384 bytes)` |

**nd03의 `sdj`**: 챕터 05 §2.10의 iSCSI 세션 목록에서 **SID 10 = `cmptest-zfs-node-target-testerSelf` (10.99.30.17)**. 즉 **testerSelf(본 작성자)의 iSCSI 테스트 target의 디스크**가 nd03에도 보이는 중. 2026-04-24에 재접속 이벤트 발생.

"Preferred minimum I/O size 4096 bytes not a multiple of physical block size (16384 bytes)" 경고는 **iSCSI ZVol의 논리 블록(4KiB)과 TrueNAS ZFS 측 권장 I/O(16KiB) 불일치** 시 발생. 성능에 약한 영향. 무시 가능하나 정확한 해석을 위해 TrueNAS의 ZVol volblocksize 설정 검토 권고. 본 작성자 책임 영역이므로 워크로그 추가 분석 인계.

### 2.11 OOM Killer 이력

5노드 `journalctl --since '30 days ago' | grep -iE 'oom-killer|out of memory'` 결과: **5노드 모두 0건**.

**메모리 압박으로 인한 프로세스 강제 종료 없음**. 챕터 02 §2.2의 "Swap 0 + ZFS ARC 1GiB 튜닝으로 OOM 리스크 증가" 우려는 실측으로 **현재는 안전**. ARC 튜닝이 효과적임의 방증.

### 2.12 logrotate 설정 — 5노드 거의 동일

5노드 `/etc/logrotate.conf` 공통:

```markdown
weekly
rotate 4
create
include /etc/logrotate.d
```

`/etc/logrotate.d/` 하위 파일 수:

| 노드             | 파일 수 | 특이사항                      |
| ---------------- | ------- | ----------------------------- |
| nd01, nd02, nd04 | 12      | 공통 구성                     |
| nd03, nd05       | 13      | **`openvswitch-switch` 추가** |

nd03과 nd05에만 OVS logrotate 설정 존재. 그러나 챕터 05 §2.4에서 5노드 모두 **일반 Linux bridge만 사용** 확인(OVS 비활성). 즉 **OVS logrotate 설정은 과거 잔재** — 기능에 영향 없으나 불일치.

추정: 두 노드는 과거 OVS 테스트 이력이 있거나, apt로 `openvswitch-common` 패키지가 설치된 상태에서 logrotate 설정이 자동 배치됨. 기능 영향 없음, 정리 우선순위 낮음.

### 2.13 `/var/log/pve/tasks/index` 인덱스 파일

5노드 공통으로 `/var/log/pve/tasks/index`와 `index.1` 파일 존재. nd05 기준:

```markdown
-rw-r--r-- 1 root root  6050 Apr 24 15:43 /var/log/pve/tasks/index
-rw-r--r-- 1 root root 50106 Apr 24 14:19 /var/log/pve/tasks/index.1
```

`index`는 현재 주, `index.1`은 이전 주. 각 줄이 하나의 task UPID 요약. 이 파일을 `grep`하면 **특정 VM에 대한 모든 최근 작업 이력**을 빠르게 조회 가능.

예:

```bash
grep 'qmigrate:802' /var/log/pve/tasks/index*
# → VM 802 관련 모든 마이그레이션 task의 UPID와 실행 시각·사용자
```

본 인덱스는 작성자 추적의 보조 수단으로 유용. 단 인덱스 로테이션이 짧아(주 1회, 2주치만) 오래된 기록은 없음.

---

## 3. 출력의 비정상 패턴과 조기 경보

### 3.1 정상 패턴

```markdown
[정상 1] journalctl --disk-usage가 노드당 3GiB 이하 (현재 모두 충족)
[정상 2] journalctl -p err | wc -l이 시간당 1000건 이하 (현재 iSCSI 유령으로 초과)
[정상 3] OOM Killer 기록 없음
[정상 4] dmesg err/warn가 0 또는 알려진 무해 경고만
[정상 5] pve-ha-lrm 로그에 lock timeout 없음
[정상 6] /var/log/pve/tasks/index가 매일 증가 (활동 있음)
```

### 3.2 의심 패턴

| #   | 패턴                                               | 추정 원인                                      | 즉시 확인                  |
| --- | -------------------------------------------------- | ---------------------------------------------- | -------------------------- |
| 1   | journalctl --disk-usage가 5GiB 초과                | 에러 폭증 또는 SystemMaxUse 미설정의 장기 누적 | SystemMaxUse 설정          |
| 2   | ERROR 레이트가 전일 대비 10배 이상                 | 새 장애 발생                                   | 최근 1시간 에러 top 샘플링 |
| 3   | `pve-ha-lrm` lock timeout 반복                     | 동시성 경합 또는 pmxcfs 문제                   | pmxcfs 상태 확인           |
| 4   | `pvedaemon` worker restart 빈번                    | 메모리 누수 또는 외부 요청 이상                | pvedaemon 프로세스 추적    |
| 5   | wtmpdb에 낯선 출발지 IP                            | 외부 침입 또는 의도하지 않은 접속              | IP별 권한 확인             |
| 6   | task index 파일이 매일 감소                        | task 정리 과다 또는 설정 오류                  | /var/log/pve/tasks/ 상태   |
| 7   | journald 부팅 경계가 `wtmpdb last reboot`와 불일치 | 비정상 종료 또는 systemd 문제                  | 양쪽 로그 교차             |
| 8   | `admin01@pve` 외 공용 계정 로그인                  | 신규 공용 계정 도입                            | 관리자 확인                |
| 9   | dmesg에 iSCSI 외 새로운 err/warn                   | 하드웨어 초기 신호                             | SMART + journalctl -k      |
| 10  | kernel log에 `Call Trace`                          | 커널 이슈                                      | **즉시 중단 신호**         |

### 3.3 즉시 중단 신호

#### 신호 A: 커널 Call Trace

```bash
journalctl -k --since '10 minutes ago' | grep -c 'Call Trace:'
```

결과 > 0이면 커널이 비정상 상태. 노드 reboot 전에 `vmcore` 수집 및 분석 필요.

#### 신호 B: OOM Killer 활성

```bash
journalctl --since '1 hour ago' | grep -iE 'oom-killer|Out of memory'
```

VM 또는 주요 프로세스가 OOM으로 죽었으면 즉시 조치. 영향받은 VM의 디스크는 손상 가능.

#### 신호 C: journald storage 실패

```bash
journalctl --verify 2>&1 | grep -iE 'fail|corrupt'
```

journal 파일 손상이 있으면 과거 분석이 불가능해진다. rpool 디스크 건강 즉시 점검.

---

## 4. 이 영역의 CMP 테스트 대분류와 시나리오

### 4.1 CRUD 기능 검증

#### 시나리오 4.1.1 — 노드 로그 조회 기능

CMP가 노드별 journal·task·pvedaemon 로그를 UI에서 조회 가능해야 한다.

- 사전 정찰: §2.1, §2.5
- 검증 항목:
  - 서비스별 필터링 (pvedaemon, pveproxy, pve-ha-lrm 등)
  - 시간 범위 지정
  - 우선순위(priority) 필터
  - 검색어 grep
  - 5노드 로그 통합 조회

#### 시나리오 4.1.2 — task 이력 조회

- CMP UI에서 특정 VM의 task 이력 (qmigrate, qmstart, qmconfig, qmdestroy 등) 시간순 조회
- 각 task 클릭 시 해당 pvedaemon 로그 상세 노출
- 사전 정찰: §2.13

### 4.2 스테이징 워크플로우

해당 없음.

### 4.3 위험 시나리오·에러 처리

#### 시나리오 4.3.1 — 로그 저장 용량 임계 도달 대응

journal이 SystemMaxUse를 초과하기 직전 CMP가 경고를 표시하는가.

- 기대: "nd04 journal usage 85% reached" 알림
- 현재는 수동 `journalctl --disk-usage`만 가능
- CMP가 대시보드에 **5노드 journal 사용량 바**를 띄우는 것이 실무에 유용

### 4.4 클러스터 일관성

#### 시나리오 4.4.1 — 5노드 로그 시간 일관성

5노드 chrony 기준 시각이 일치하는지(챕터 02 §2.7의 NTP reference 분산 확인과 연계). 본 챕터 정찰에서 확인된 시각 오차는 500μs 이하.

- 기대: 5노드의 로그 시계열 상관 분석 가능 (ms 단위 차이 무시 가능)
- 위험: NTP 장애 시 시계열 상관이 무너짐

### 4.5 작성자 추적 기능

#### 시나리오 4.5.1 — VM 작성자 조회

CMP UI에서 VM 우클릭 → "작성자 조회" 메뉴. 자동으로:

1. VM의 `ctime` 파싱
2. 해당 시각 pvedaemon 로그 `qmcreate:{vmid}` 항목 검색
3. 실행 주체 `<user@realm>` 반환
4. journald 보존 범위 외의 VM은 "추적 불가, 팀 문의 필요" 표시

본 챕터 §2.9의 수작업 절차를 CMP가 자동화하면 **VM 처분 의사결정 속도가 대폭 향상**.

---

## 5. 정찰 ↔ 테스트 단계 역방향 매핑

| 수행하려는 액션       | 선행 정찰 (본 챕터)                      | 추가 선행      |
| --------------------- | ---------------------------------------- | -------------- |
| 장애 원인 분석        | §2.3 ERROR 집계 + §2.4 iSCSI 노이즈 제거 | 워크로그 참조  |
| VM 처분 의사결정      | §2.9 작성자 추적                         | 챕터 06 분류   |
| STN 중 성능 저하 원인 | §2.11 OOM 확인 + dmesg                   | 챕터 02 부하   |
| HA 리밸런싱 동작 검증 | §2.8 pve-ha-lrm 이력                     | 챕터 01 정족수 |
| 로그 용량 관리        | §2.1, §2.12 logrotate                    | 운영팀         |

---

## 6. 정찰 결과를 산출물로 정리하는 양식

### 6.1 산출물 — 로그 시스템 베이스라인 카드

```markdown
# 로그 시스템 베이스라인 — YYYY-MM-DD HH:MM

## 5노드 /var/log 사용량
| 노드 | 총량 | journal | 증가율 (주간) |

## ERROR 레이트 (시간당)
| 노드 | 현재 | 전주 평균 | 임계 위반? |

## OOM 이력 (30일)
- 각 노드 건수

## HA 관련 이벤트 요약 (주간)
- 성공 마이그레이션: N
- 실패/timeout: N (내역)

## 미확인 로그인 출발지
- (있을 경우)
```

### 6.2 작성자 추적 리포트 양식

```markdown
# 작성자 추적 리포트 — VM {vmid}

## 대상 VM
- VMID: ___
- 이름: ___
- ctime (생성 시각): ___
- 현재 상태: ___

## 추적 경로
1. [ ] config mtime 확인: ___
2. [ ] pvedaemon 로그 조회 (ctime 전후): ___
3. [ ] task log 조회: ___
4. [ ] wtmpdb 교차 확인: ___

## 결과
- 확정된 작성자: ___
- 또는 "추적 불가" 사유: ___

## 후속 조치
- [ ] 작성자 확인 완료 → 처분 진행
- [ ] Slack 질의 발송
- [ ] 처분 보류
```

---

## 7. 본 챕터에서 발견된 잔여 정비·추적 항목

| #   | 발견 항목                                  | 인계                          | 우선순위 | 상태                                            |
| --- | ------------------------------------------ | ----------------------------- | -------- | ----------------------------------------------- |
| 1   | **iSCSI 유령 LUN 에러 45만 건/일**         | **WorkLog 2026-04-24**        | **P0**   | 부분 정리 완료 (testerSelf SID 7), testerA 잔존 |
| 2   | VM 802 마이그레이션 로그 해석 모순         | 챕터 04 + admin01 문의        | P1       | 원인 확정 불가, 추가 조사 필요                  |
| 3   | VM 112 작성자 추적 — journald 보존 밖      | 챕터 06 §7.3 5번 (Slack 질의) | P1       | journald 한계 확정                              |
| 4   | nd04 /var/log 2.9GiB — 타 노드 대비 10배   | 지속 관찰                     | P2       | 기본값 내 운영, 주간 관찰                       |
| 5   | `test_yhkim@pve` 새 사용자                 | 챕터 04 + 팀 확인             | P2       | 새 테스터 또는 보조 계정?                       |
| 6   | admin01 계정 다수 공유 사용 정황           | 챕터 04 + CMP 설계            | P2       | 감사 추적성 리스크                              |
| 7   | VM 101 (`bani`) admin01이 반복 편집 시도   | 챕터 04                       | P2       | admin01과 처분 방침 합의                        |
| 8   | VM 702 QGA 미응답 576건/일                 | 챕터 06                       | P3       | VM 702 처분과 연계                              |
| 9   | postfix `/etc/aliases.db` 미초기화         | 운영팀                        | P3       | `postalias /etc/aliases`                        |
| 10  | nd03/nd05만 `openvswitch-switch` logrotate | 운영팀                        | P3       | 과거 잔재, 영향 없음                            |
| 11  | VM 116 HA 마이그레이션 lock timeout        | 챕터 04                       | P2       | 동시성 관리 개선                                |
| 12  | VM 799/800 4/24 오전 리밸런싱 주체         | 챕터 04                       | P3       | pvedaemon 로그 추가 조사                        |
| 13  | `journald SystemMaxUse` 미설정             | 운영팀                        | P3       | 명시적 5G 설정 권고                             |
| 14  | nd03 `sdj` I/O 크기 불일치 경고            | **WorkLog**                   | P3       | testerSelf 영역                                 |
| 15  | wtmpdb 5일 이전 이력 유실                  | 본 챕터 박제                  | —        | 장기 추적 불가 전제                             |

### 7.1 본 챕터에서 인지한 WorkLog 참조 원칙

§2.4에서 iSCSI 유령 LUN 에러 45만 건의 **원인 진단을 WorkLog에 위임**한 방식이 본 챕터에서 처음 적용되었다. 이 패턴의 일반화:

**핸드북 챕터의 역할**: 현상(phenomenon) 박제 + 영향 범위 정량화 + 다른 계층과의 연결
**WorkLog의 역할**: 단일 문제의 근본 원인 진단 + 해결 절차 + 교훈 박제

둘을 분리하는 이유:

- 핸드북 독자(STN 준비자, 팀원)는 **현상과 영향**을 알고 싶어 한다
- WorkLog 독자(자기 자신, 미래의 자기)는 **왜·어떻게 해결했나**를 알고 싶어 한다
- 양쪽 맥락이 한 문서에 섞이면 분량이 팽창하고 대상 독자의 관심과 어긋남

본 원칙은 **챕터 00 §4 또는 §5에 소급 반영**하고 WorkLog 시리즈를 핸드북의 공식 보조 자산으로 등록할 것을 권고한다. 챕터 09(Pre-test 체크리스트) 작성 시 이 원칙으로 참조 구조 표준화.

### 7.2 본 수집 명령의 결함 — 다행히 없음

이전 챕터들(05 brctl show 절단, 06 ls head -60 절단)에서 있었던 수집 명령 결함이 본 챕터에서는 없다. 모든 명령이 의도한 출력을 온전히 제공. 다만 `--since today`는 **시점 민감**하므로 다음 수집 시 결과가 다를 수 있음을 명시. ERROR 건수는 24시간 스냅샷.

---

## 부록 A. 명령 치트 시트

```bash
NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"

# === 5노드 로그 용량 빠른 체크 ===
for n in $NODES; do
  size=$(ssh "$n" "journalctl --disk-usage" | awk '{print $7}')
  echo "[$n] journal: $size"
done

# === 5노드 시간당 ERROR 레이트 ===
for n in $NODES; do
  cnt=$(ssh "$n" "journalctl --since '1 hour ago' -p err --no-pager | wc -l")
  echo "[$n] ERROR/hour: $cnt"
done

# === iSCSI 노이즈 제외한 진짜 에러 ===
for n in $NODES; do
  echo "=== [$n] non-iSCSI errors (1h) ==="
  ssh "$n" "journalctl --since '1 hour ago' -p err --no-pager | \
            grep -vE 'iscsid.*target not found|iscsid.*Kernel reported' | head -5"
done

# === VM 작성자 추적 (수동) ===
VMID=112
NODE=pve-nd02
CTIME_RAW=$(ssh $NODE "qm config $VMID" | grep '^meta:' | grep -oP 'ctime=\K[0-9]+')
CTIME=$(date -d @"$CTIME_RAW" +"%Y-%m-%d %H:%M")
echo "VM $VMID ctime: $CTIME"
ssh $NODE "journalctl -u pvedaemon --since \"$CTIME\" \
  --until \"$(date -d \"$CTIME +30 minutes\" +'%Y-%m-%d %H:%M')\" \
  --no-pager | grep -iE 'VM $VMID|qmcreate:$VMID'"

# === task log 빠른 조회 ===
ssh pve-nd01 "grep 'qmigrate:802' /var/log/pve/tasks/index* 2>/dev/null"
```

## 부록 B. 다음 챕터로의 인계

| 본 챕터 발견                        | 챕터 04 (스토리지 자원 관리) 처리 |
| ----------------------------------- | --------------------------------- |
| iSCSI 에러 정비 완료 후 예상 감소율 | testerA 고아 정리의 긴급도 근거   |
| `admin01@pve` 공용 계정 사용        | 계정 정책 논의                    |

| 본 챕터 발견                 | 챕터 08 (위험 매트릭스) 처리 |
| ---------------------------- | ---------------------------- |
| journald SystemMaxUse 미설정 | 장기 운영 리스크             |
| admin01 공용 계정            | 감사 추적성 리스크           |
| 새 사용자 `test_yhkim@pve`   | 신원 확인 필요               |

| 본 챕터 발견                         | 챕터 09 (Pre-test 체크리스트) 처리 |
| ------------------------------------ | ---------------------------------- |
| iSCSI 정비 완료 후 ERROR 레이트 확인 | STN 직전 체크 항목                 |
| OOM 이력 없음 확인                   | 정기 헬스 체크                     |

## 부록 C. 참고 자료

| 주제                  | URL                                                                            |
| --------------------- | ------------------------------------------------------------------------------ |
| systemd-journald.conf | https://www.freedesktop.org/software/systemd/man/systemd-journald.service.html |
| journalctl 매뉴얼     | https://www.freedesktop.org/software/systemd/man/journalctl.html               |
| Proxmox pvedaemon     | https://pve.proxmox.com/pve-docs/chapter-pve-service-daemons.html              |
| wtmpdb 프로젝트       | https://github.com/thkukuk/wtmpdb                                              |
| logrotate 매뉴얼      | https://linux.die.net/man/8/logrotate                                          |
| Proxmox Task log 형식 | https://pve.proxmox.com/wiki/Proxmox_VE_API                                    |

---

> **다음 챕터**: `08-risk-matrix-and-isolation.md` — 1~7장에서 발견된 모든 리스크를 **격자 매트릭스(Blast Radius × Reversibility)**로 집약하고, 테스트팀 격리 전략을 도출한다. 이 챕터가 STN 직전의 "붉은 선" 목록이 된다.
