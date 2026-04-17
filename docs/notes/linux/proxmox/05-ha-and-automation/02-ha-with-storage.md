---
title: "HA & ZFS Replication 기반 자동 페일오버"
date: 2026-04-13
lastmod: 2026-04-17
author: "Davi"
description: "Proxmox HA 아키텍처, CRM/LRM 상태 머신, ZFS Replication을 이용한 로컬 스토리지 HA 구성, node-affinity 룰 설계, systemd Timer 기반 ZFS TRIM 자동화까지."
slug: "ha-with-storage"
section: "notes"
category: "proxmox/ha"
tags: [proxmox, ha, high-availability, crm, lrm, zfs, replication, pvesr, failover, node-affinity, systemd, trim, fencing]
order: 2
series: "Proxmox VE 학습 시리즈"
series_order: 8
status: "active"
draft: false
search: true
toc: true
difficulty: "intermediate"
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목          | 내용                                                      |
| ------------- | --------------------------------------------------------- |
| 선행 문서     | `01-setup/02-cluster-setup.md`                            |
| 클러스터      | test (3노드: pve / pve-ksy / kcy0122)                     |
| 스토리지      | local-zfs (ZFS, 각 노드 로컬), shared (NFS, pve-ksy 제공) |
| HA 관리 VM    | VM 101 (에러 복구), VM 301 `cld-api` (신규 HA 등록)       |
| 네트워크 대역 | 10.10.250.0/24, GW 10.10.250.1                            |

---

## 1. Proxmox HA 아키텍처

### 1.1 HA를 구성하는 두 데몬

Proxmox HA는 두 개의 데몬이 역할을 분담한다.

| 데몬                               | 역할                                                                               | 실행 위치                |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ------------------------ |
| **CRM** (Cluster Resource Manager) | 클러스터 전체 HA 정책 조율. 어느 노드에서 어떤 VM을 실행할지 결정. 페일오버 트리거 | 마스터 노드 1개에서 실행 |
| **LRM** (Local Resource Manager)   | CRM의 지시를 받아 각 노드에서 실제 VM 기동/정지 수행                               | 모든 노드에서 실행       |

CRM은 클러스터의 마스터(Active) 노드에서만 실행된다. 마스터 노드가 다운되면 다른 노드가 마스터를 인수하고 CRM을 기동한다. LRM은 모든 노드에서 항상 실행되며 CRM의 명령을 기다린다.

### 1.2 HA 상태 머신

HA 리소스(VM)는 다음 상태 중 하나에 있다:

```markdown
                ┌──────────────────────────────────┐
                ↓                                  │
[disabled] → [stopped] → [started] → [running]    │
                ↑                        │          │
                └────────────────────────┘          │
                      페일오버/노드 장애             │
                                                   │
              [error] ←─ 반복 실패 ─────────────────┘
```

| 상태       | 의미                                                         |
| ---------- | ------------------------------------------------------------ |
| `disabled` | HA 관리에서 일시적으로 제외. CRM이 이 VM을 건드리지 않음     |
| `stopped`  | HA가 관리하지만 의도적으로 정지 상태로 유지                  |
| `started`  | HA가 이 VM을 실행 중인 상태로 유지하려 함                    |
| `running`  | 실제로 실행 중                                               |
| `error`    | 기동 시도가 일정 횟수 실패하여 CRM이 자동 개입을 중단한 상태 |
| `migrate`  | 노드 간 이전(마이그레이션) 진행 중 — 일시 락 상태            |

`error` 상태는 **관리자가 수동으로 해소해야** 한다. 원인을 파악하고 수동으로 `disabled` → `started`로 전환해야 HA 관리가 재개된다.

### 1.3 Fencing의 역할

HA 페일오버에서 가장 중요한 개념이 **Fencing**이다. 노드가 응답하지 않을 때, 클러스터는 그 노드가 정말 죽었는지, 아니면 네트워크만 단절됐는지 알 수 없다.

만약 노드가 실제로는 살아있지만 네트워크만 단절된 상태에서 다른 노드가 동일한 VM을 기동하면, **두 노드가 동시에 동일 VM을 실행하고 동일 스토리지에 쓰기**를 시도하는 split-brain이 발생한다. 데이터 손상이 불가피하다.

Fencing은 이것을 방지하기 위해 **의심 노드를 강제로 차단**한다. 전원을 끄거나, 네트워크 포트를 차단하거나, IPMI로 리셋한다. "확실히 죽은 것을 확인한 뒤" 페일오버를 진행한다.

**Fencing 수단:**

| 수단                           | 동작                                               | 환경                          |
| ------------------------------ | -------------------------------------------------- | ----------------------------- |
| IPMI/iDRAC (Hardware Watchdog) | 원격 전원 제어로 노드 강제 종료                    | 물리 서버 — **프로덕션 필수** |
| Software Watchdog              | 소프트웨어 타이머 만료 시 커널 패닉 유도 후 재부팅 | 가상화 환경                   |
| No Fencing                     | Fencing 없이 진행 — 데이터 손상 위험               | **사용 금지**                 |

VirtualBox 중첩 환경에서는 하드웨어 Fencing을 구성할 수 없으므로 소프트웨어 워치독이 동작한다. 실제 프로덕션에서는 IPMI 기반 Fencing 없이는 HA 구성이 의미가 없다.

---

## 2. 로컬 ZFS와 HA의 관계

### 2.1 HA가 공유 스토리지를 요구하는 이유

HA 페일오버의 핵심 동작은 **VM 디스크 이미지에 페일오버 대상 노드가 접근**하는 것이다. NFS, iSCSI, Ceph처럼 모든 노드가 동일한 스토리지를 공유하면, 노드 A에서 노드 B로 VM이 이전될 때 디스크 이미지가 이미 노드 B에서 접근 가능하다.

로컬 ZFS는 해당 노드에만 존재한다. 노드 A의 `local-zfs`에 VM 디스크가 있다면, 노드 B는 그 디스크에 접근할 수 없다. 이 문제를 해결하는 것이 **Proxmox Storage Replication**이다.

### 2.2 ZFS Replication 동작 원리

Proxmox Storage Replication은 `zfs snapshot` + `zfs send | zfs receive`를 자동화한 래퍼다.

```markdown
[kcy0122 노드]                    [pve-ksy 노드]
local-zfs/vm-301-disk-0           local-zfs/vm-301-disk-0
       │                                  │
       │   zfs snapshot → zfs send        │
       └──────────────────────────────────►
       │   (SSH 터널, 노드명 hostname으로 연결)
```

1. 소스 노드(`kcy0122`)에서 VM 디스크의 ZFS 스냅샷 생성
2. SSH를 통해 타겟 노드(`pve-ksy`)로 스냅샷 전송
3. 타겟 노드의 동일 이름 ZFS 풀에 수신 (`zfs receive`)
4. 다음 복제 시에는 이전 스냅샷과의 **증분(Incremental) 변경분만** 전송

이 방식의 특성:

| 항목           | 값                                             |
| -------------- | ---------------------------------------------- |
| 전송 오버헤드  | 최초 복제: 전체 데이터 / 이후: 증분만          |
| 최소 복제 주기 | 1분 (ZFS 스냅샷 + 전송 오버헤드로 인한 하한선) |
| RPO            | 복제 주기 내 쓰기 유실 가능                    |
| 연결 방식      | SSH (hostname 기반 — `/etc/hosts` 등록 필수)   |

### 2.3 RPO 비교

| 스토리지 방식             | 동작                                | RPO                  |
| ------------------------- | ----------------------------------- | -------------------- |
| 공유 스토리지 (NFS/iSCSI) | 모든 노드가 동일 스토리지 직접 접근 | 0                    |
| ZFS Replication + HA      | 주기적 스냅샷 전송                  | 복제 주기 (최소 1분) |
| Ceph RBD (동기식)         | 모든 쓰기를 복수 노드에 동기 기록   | 0                    |

RPO(Recovery Point Objective) 0이 필요한 프로덕션 환경에서는 Ceph RBD 같은 동기식 복제로 가야 한다. ZFS Replication은 비동기이므로 복제 주기 내 데이터 유실 가능성이 존재한다.

---

## 3. ZFS Replication 설정

### 3.1 사전 조건 확인

**ZFS 풀 이름 일치:**

Proxmox Replication은 `zfs receive`를 타겟 노드의 **동일 이름 풀**에 수신한다. 풀 이름이 다르면 복제가 불가능하다.

```bash
# 소스 노드 (kcy0122)
zpool list
# NAME        SIZE  ALLOC   FREE  HEALTH
# local-zfs  99.5G  3.11G  96.4G  ONLINE

# 타겟 노드 (pve-ksy)
ssh root@pve-ksy "zpool list"
# NAME        SIZE  ALLOC   FREE  HEALTH
# local-zfs  99.5G  3.12G  96.4G  ONLINE
# ↑ 이름 동일 확인
```

**ZFS 풀이 storage.cfg에 등록되어 있는지 확인:**

```bash
cat /etc/pve/storage.cfg | grep -A6 local-zfs
# zfspool: local-zfs
#     pool local-zfs
#     content rootdir,images
#     mountpoint /local-zfs
#     nodes pve,kcy0122,pve-ksy   ← 세 노드 모두 등록됨을 확인
#     sparse 1
```

**`/etc/hosts` — hostname resolution 필수:**

```bash
# 모든 노드에 동일하게 적용
cat /etc/hosts
# 127.0.0.1 localhost.localdomain localhost
#
# # Proxmox Cluster Nodes
# 10.10.250.115 pve.example.com pve
# 10.10.250.117 pve-ksy.letech.local pve-ksy
# 10.10.250.119 kcy0122.proxmox.letech.kr kcy0122
```

`/etc/hosts` 미등록 시 증상: `pvesr status`에서 `SYNCING` 상태가 지속되고, `journalctl -t pvesr`에 아무 로그도 찍히지 않는다. `ssh root@pve-ksy "zpool list"`로 hostname resolution 가능 여부를 먼저 확인한다.

### 3.2 복제 작업 등록 (Proxmox 9.x)

```bash
# kcy0122 → pve-ksy 복제 (5분 주기)
pvesr create-local-job 301-0 pve-ksy --schedule "*/5"

# kcy0122 → pve 복제 (5분 주기)
pvesr create-local-job 301-1 pve --schedule "*/5"

# 옵션 해설:
# 301-0  : Job ID. {VMID}-{순번} 형식 권장
# pve-ksy: 타겟 노드명
# */5    : systemd Calendar Event 형식. 매 5분마다. 최소값 */1
```

스케줄 문법은 systemd Calendar Event 형식을 따른다. `*/5`는 "5의 배수 분마다(0, 5, 10, ...)"를 의미한다.

### 3.3 복제 실행 및 상태 확인

```bash
# 즉시 실행 — 전체 Job
pvesr run

# 특정 Job만 즉시 실행 (포어그라운드, 에러 콘솔 출력)
pvesr run --id 301-0

# systemd 타이머 큐에 등록 (백그라운드, Guest Agent 없으면 fsfreeze 스킵)
pvesr schedule-now 301-0

# 상태 확인
pvesr status
# JobID  Enabled  Target        LastSync              NextSync              Duration  State
# 301-0  Yes      local/pve-ksy  2026-04-14_10:36:56  2026-04-14_10:40:00  2.875168  OK
# 301-1  Yes      local/pve      2026-04-14_10:36:07  2026-04-14_10:40:00  3.991381  OK
```

**`pvesr run --id` vs `pvesr schedule-now`의 차이:**

| 명령                 | 실행 방식              | Guest Agent 없을 때 fsfreeze 처리 | 에러 출력 |
| -------------------- | ---------------------- | --------------------------------- | --------- |
| `pvesr run --id`     | 포어그라운드 직접 실행 | 타임아웃 에러 콘솔 출력           | 명시적    |
| `pvesr schedule-now` | systemd 타이머 큐 등록 | 조용히 스킵 후 진행               | 억제      |

데이터 정합성이 중요한 환경에서는 fsfreeze 에러가 명시적으로 보이는 `pvesr run --id`를 통해 문제를 먼저 파악하는 것이 낫다.

### 3.4 페일오버 시 복제 방향 자동 전환

VM이 `kcy0122 → pve-ksy`로 페일오버되면, Proxmox CRM이 복제 작업의 소스 노드를 자동으로 `pve-ksy`로 전환한다. `pve-ksy`가 새 소스가 되어 나머지 노드로 복제를 이어간다. 페일백 시에도 방향이 자동으로 원래대로 돌아온다. 수동 개입 불필요.

---

## 4. HA 설정

### 4.1 Proxmox 9.x HA 룰 시스템

Proxmox 9.x에서 기존의 **HA 그룹(Group)** 개념이 **룰(Rules)** 시스템으로 교체되었다. `ha-manager groupadd` 등의 명령은 deprecated 상태다.

| 룰 타입             | 설명                                                     |
| ------------------- | -------------------------------------------------------- |
| `node-affinity`     | VM이 어느 노드에 배치될지 우선순위를 정의                |
| `resource-affinity` | VM 간의 배치 관계를 정의 (동일 노드 유지 또는 강제 분리) |

### 4.2 HA 리소스 등록 및 룰 설정

```bash
# Step 1. HA 리소스로 등록 (CRM이 이 VM을 관리하기 시작)
ha-manager add vm:301 --state started

# Step 2. node-affinity 룰 생성
# kcy0122가 우선순위 5(가장 높음), pve/pve-ksy는 폴백(우선순위 1)
ha-manager rules add node-affinity vm301-ha-rule \
  --resources vm:301 \
  --nodes kcy0122:5,pve:1,pve-ksy:1

# Step 3. strict 옵션 설정 (--nodes도 함께 명시해야 동작)
# strict=0: 우선 노드 없을 때 다른 노드로 페일오버 허용
ha-manager rules set node-affinity vm301-ha-rule \
  --nodes kcy0122:5,pve:1,pve-ksy:1 \
  --strict 0

# 상태 확인
ha-manager status
ha-manager rules config
```

> Proxmox 9.x에서 `ha-manager rules set`에 `--strict`만 단독으로 전달하면 오류가 발생한다. `--nodes`를 항상 함께 명시해야 한다.

### 4.3 node-affinity 우선순위 설계

Priority 값이 높을수록 해당 노드를 선호한다. 동일 Priority면 임의 선택.

| 시나리오                       | 설정 예시                                   |
| ------------------------------ | ------------------------------------------- |
| 특정 노드 고정, 나머지는 폴백  | `kcy0122:5,pve:1,pve-ksy:1`                 |
| 두 노드를 동등한 1순위로       | `kcy0122:3,pve-ksy:3,pve:1`                 |
| 모든 노드 동등 (CRM 자율 선택) | `kcy0122:1,pve:1,pve-ksy:1`                 |
| 특정 노드 완전 배제            | 해당 노드를 `--nodes`에서 제외 + `strict=1` |

`strict=1`은 `--nodes`에 정의된 노드에서만 VM을 실행하고, 모두 다운된 경우 VM을 기동하지 않는다. `strict=0`은 정의된 노드가 없을 때 다른 노드로 폴백한다. 서비스 가용성을 우선하면 `strict=0`, 특정 노드 격리가 중요하면 `strict=1`.

### 4.4 HA 설정 파일 구조

```bash
cat /etc/pve/ha/rules.cfg
# node-affinity: vm301-ha-rule
#     nodes kcy0122:5,pve:1,pve-ksy:1
#     resources vm:301
#     strict 0

cat /etc/pve/ha/resources.cfg
# vm 301
#     state started
```

두 파일 모두 pmxcfs를 통해 클러스터 전체에 실시간 동기화된다.

---

## 5. HA 에러 복구

<DocEmbed
  src="notes/linux/proxmox/06-references/07-troubleshooting.md"
  anchor="#### HA 에러 복구 시퀀스"
  title="간단한 HA 에러 복구 절차"
/>

<DocEmbed
  src="notes/linux/proxmox/06-references/07-troubleshooting.md"
  anchor="#### Corosync 토큰 타임아웃 → HA error 연쇄"
  title="5.4 Corosync 토큰 타임아웃이 HA error를 유발하는 경로"
/>

---

## 6. ZFS TRIM 자동화

### 6.1 `discard=ignore`와 배치 TRIM 전략

Cloud Image VM에서 `discard=ignore`로 디스크를 구성하면, VM 내부의 TRIM 명령이 ZFS 레이어까지 전달되지 않는다. 삭제된 블록을 ZFS pool에 반환하려면 Proxmox 노드에서 직접 `zpool trim`을 실행해야 한다.

| 명령                   | 실행 위치    | 동작                                                                      |
| ---------------------- | ------------ | ------------------------------------------------------------------------- |
| `fstrim /`             | VM 내부      | 파일시스템 → 하이퍼바이저로 TRIM 전달. `discard=ignore` 시 ZFS까지 미전달 |
| `zpool trim local-zfs` | Proxmox 노드 | ZFS 풀 전체를 직접 처리. `discard` 설정과 무관                            |

`discard=ignore` 환경에서는 반드시 **Proxmox 노드에서 `zpool trim`을 실행**해야 한다.

### 6.2 cron vs systemd timer

| 항목           | cron                          | systemd timer                            |
| -------------- | ----------------------------- | ---------------------------------------- |
| 실행 로그      | `/var/log/syslog`에 단순 기록 | `journalctl`로 상세 추적                 |
| 누락 실행 처리 | 시간이 지나면 그냥 스킵       | `Persistent=true` 시 부팅 후 즉시 실행   |
| 의존성 설정    | 불가                          | `After=`, `Wants=` 유닛 의존성 설정 가능 |
| 실패 알림      | 별도 설정 필요                | `OnFailure=` 핸들러 등록 가능            |

`Persistent=true`는 systemd timer에서 특히 중요하다. 서버가 09:30에 꺼져있었더라도 부팅 후 즉시 "밀린" 작업을 실행한다. 물리 서버가 유지보수로 내려가 있다가 올라왔을 때도 TRIM이 보장된다.

### 6.3 systemd Timer 설정

```bash
# /etc/systemd/system/zpool-trim.service
cat > /etc/systemd/system/zpool-trim.service << 'EOF'
[Unit]
Description=ZFS Pool TRIM - local-zfs
After=zfs.target

[Service]
Type=oneshot
ExecStart=/sbin/zpool trim local-zfs
StandardOutput=journal
StandardError=journal
EOF

# /etc/systemd/system/zpool-trim.timer
cat > /etc/systemd/system/zpool-trim.timer << 'EOF'
[Unit]
Description=ZFS Pool TRIM Timer - daily at 09:30

[Timer]
OnCalendar=*-*-* 09:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

# 세 노드 전부에서 등록 및 활성화
systemctl daemon-reload
systemctl enable --now zpool-trim.timer

# 등록 확인
systemctl list-timers | grep zpool
# NEXT                         LEFT        LAST                         PASSED  UNIT             ACTIVATES
# Mon 2026-04-15 09:30:00 KST  14h left    Sun 2026-04-14 09:30:00 KST  9h ago  zpool-trim.timer zpool-trim.service
```

### 6.4 TRIM 즉시 실행 및 검증

```bash
# 수동 즉시 실행
systemctl start zpool-trim.service

# 실행 결과 확인
journalctl -u zpool-trim.service -n 20

# ZFS pool 상태 확인 (trim 진행 중이면 progress 표시)
zpool status -t local-zfs
```

---

## 7. 실습 기록

### 7.1 VM 101 HA 에러 복구 전체 흐름

```bash
# 현재 상태
ha-manager status
# service vm:101 (kcy0122, error)

# error 해소
ha-manager set vm:101 --state disabled
# trying to acquire cfs lock 'domain-ha' ...
#  OK

ha-manager status
# service vm:101 (kcy0122, disabled)

ha-manager set vm:101 --state started

watch ha-manager status
# service vm:101 (kcy0122, started)   ← 정상 복구 확인
```

### 7.2 ZFS Replication SYNCING 고착 문제

**증상:**

```bash
pvesr status
# 301-0  Yes  local/pve-ksy  -  pending  -  0  SYNCING   ← 고착
# 301-1  Yes  local/pve      -  pending  -  0  OK

journalctl -t pvesr -n 50 --no-pager
# -- No entries --   ← 로그가 아예 없음
```

**원인 추적:**

```bash
systemctl status pvesr
# Unit pvesr.service could not be found.
# → pvesr 데몬 자체는 서비스가 아닌 systemd timer로 동작

ssh root@pve-ksy "zpool list"
# ssh: Could not resolve hostname pve-ksy: Name or service not known
# → /etc/hosts에 노드 hostname 미등록
```

**해결:** 세 노드 전부의 `/etc/hosts`에 서로의 노드 정보 등록 후 `pvesr run`으로 즉시 동기화.

### 7.3 VM 301 HA 등록 전체 흐름

```bash
# ZFS Replication Job 등록
pvesr create-local-job 301-0 pve-ksy --schedule "*/5"
pvesr create-local-job 301-1 pve --schedule "*/5"

# 즉시 동기화 (hosts 수정 후)
pvesr run
pvesr status
# 301-0  Yes  local/pve-ksy  2026-04-14_10:36:56  2026-04-14_10:40:00  2.875168  OK
# 301-1  Yes  local/pve      2026-04-14_10:36:07  2026-04-14_10:40:00  3.991381  OK

# HA 등록
ha-manager add vm:301 --state started

# node-affinity 룰 등록
ha-manager rules add node-affinity vm301-ha-rule \
  --resources vm:301 \
  --nodes kcy0122:5,pve:1,pve-ksy:1

ha-manager rules set node-affinity vm301-ha-rule \
  --nodes kcy0122:5,pve:1,pve-ksy:1 \
  --strict 0

# 최종 확인
cat /etc/pve/ha/rules.cfg
# node-affinity: vm301-ha-rule
#     nodes kcy0122:5,pve:1,pve-ksy:1
#     resources vm:301
#     strict 0
```

---

## 부록: 검증 체크리스트

```bash
# ZFS Replication 상태
pvesr status
# 모든 Job State: OK 확인

# HA 리소스 상태
ha-manager status
# quorum OK
# service vm:301 (kcy0122, running) 확인

# ZFS TRIM 타이머 등록 확인
systemctl list-timers | grep zpool

# 페일오버 테스트 (선택)
# kcy0122 노드를 VirtualBox에서 강제 중단
# pve 또는 pve-ksy에서 VM 301이 자동 기동되는지 확인
ha-manager status   # migrate → started → running 전환 확인
```

> - **공식 문서 — HA Manager:** https://pve.proxmox.com/wiki/High_Availability
> - **공식 문서 — Storage Replication:** https://pve.proxmox.com/wiki/Storage_Replication
> - **공식 문서 — HA Manager CLI:** https://pve.proxmox.com/pve-docs/ha-manager.1.html
