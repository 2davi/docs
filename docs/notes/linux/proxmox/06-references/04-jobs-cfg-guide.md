---
title: "jobs.cfg 완전 가이드"
date: 2026-04-16
lastmod: 2026-04-16
author: "Davi"
description: "Proxmox VE 백업 스케줄 정의 파일 /etc/pve/jobs.cfg의 전체 속성 레퍼런스. 대상 필터, 스케줄 문법, 보존 정책, Fleecing, 훅 스크립트, pvesh API 관리까지."
slug: "jobs-cfg-guide"
section: "notes"
category: "proxmox/ref."
tags: [proxmox, vzdump, jobs-cfg, backup, schedule, prune-backups, fleecing, hook-script, pvescheduler]
order: 4
series: "Proxmox VE 학습 시리즈"
#series_order: 0
status: "active"
draft: false
search: true
toc: true
difficulty: "intermediate"
version: "Proxmox VE 9.1"
---

## 개요

`/etc/pve/jobs.cfg`는 Proxmox VE 클러스터 전체에서 공유되는 백업 잡(Job) 정의 파일이다. GUI의 **Datacenter → Backup**에서 잡을 생성·수정하면 이 파일이 자동으로 갱신되며, `pvescheduler` 데몬이 파싱하여 스케줄대로 실행한다. 파일을 직접 편집하거나 `pvesh` API CLI를 통해 관리하는 것도 완전히 지원된다.

> `/etc/pve/` 경로는 클러스터 파일시스템(pmxcfs)으로 모든 노드에 실시간 복제된다. 직접 편집 시에는 구문 오류가 없도록 주의해야 한다.

---

## 파일 구조 기본 형식

```ini
vzdump: <job-id>
    <key> <value>
    <key> <value>
    ...

vzdump: <job-id-2>
    <key> <value>
    ...
```

- 각 잡은 `vzdump: <id>` 헤더 줄로 시작한다
- 속성은 **탭(Tab) 또는 4칸 공백** 들여쓰기 후 `key value` 형식으로 기술한다 (`:` 구분자 없음)
- 빈 줄로 잡 블록을 구분한다
- `#`으로 시작하는 줄은 주석이다

### Job ID 명명 규칙

GUI가 생성하는 ID는 `backup-<UUID>` 형식이다. 직접 생성할 때는 `backup-myvm-daily`처럼 의미 있는 이름을 써도 무방하지만, 영문 소문자·숫자·하이픈만 허용되며 최대 길이 제한이 있다.

---

## 속성 전체 레퍼런스

### 필수 속성

| 속성 | 타입 | 설명 |
| ---- | ---- | ---- |
| `storage <id>` | string | 백업 파일을 저장할 스토리지 ID (필수) |
| `schedule <expr>` | string | 실행 스케줄 (systemd calendar 형식) |

---

### 대상 지정 속성 (택일)

| 속성 | 예시 값 | 설명 |
| ---- | ------- | ---- |
| `vmid <id>` | `100` 또는 `100,101,102` | 특정 VM/CT ID 지정, 쉼표로 복수 지정 가능 |
| `all 1` | `1` | 노드의 모든 VM/CT 백업 |
| `pool <n>` | `production` | 특정 리소스 풀에 속한 전체 VM 백업 |
| `exclude <id>` | `101,102` | `all 1` 사용 시 제외할 VMID 목록 |

`vmid`, `all`, `pool`은 서로 배타적이다. 하나만 선택해야 한다.

---

### 노드 지정

```ini
node pve01
```

또는 복수 노드:

```ini
nodes pve01,pve02,pve03
```

`node`/`nodes`를 생략하면 클러스터 내 모든 노드에서 실행된다. 단일 노드를 지정하면 해당 노드에 속한 VM만 백업된다.

---

### 스케줄 (`schedule`) 상세

Proxmox는 systemd 캘린더 이벤트(Calendar Events)의 서브셋을 사용한다. `systemd-analyze calendar '<expr>'` 명령으로 파싱 결과를 사전 검증할 수 있다.

| 표현식 | 실행 시점 |
| ------ | --------- |
| `daily` | 매일 00:00 |
| `weekly` | 매주 월요일 00:00 |
| `monthly` | 매월 1일 00:00 |
| `hourly` | 매 시간 0분 |
| `*/30` | 30분 간격 |
| `02:00` | 매일 오전 2시 |
| `mon 03:00` | 매주 월요일 03:00 |
| `fri 23:00` | 매주 금요일 23:00 |
| `mon..fri 23:55` | 평일(월~금) 23:55 |
| `sat,sun 04:00` | 주말 04:00 |
| `*-*-01 03:00` | 매월 1일 03:00 |

> Proxmox는 요일에 와일드카드(`*`) 사용을 허용하지 않으므로, 요일 없이 날짜만 지정할 때는 `*-*-01 03:00:00` 형식처럼 요일 필드를 아예 생략해야 한다.

---

### 백업 모드 (`mode`)

| 값 | VM 다운타임 | 동작 원리 | 권장 상황 |
| --- | ----------- | --------- | --------- |
| `snapshot` (기본값) | 없음 | QEMU 블록 레이어 live backup | 일반 운영 VM |
| `suspend` | 짧게 있음 | 일시 정지 후 rsync | 레거시 호환용 (비권장) |
| `stop` | 있음 (종료 후 복구) | 완전 종료 후 백업 | 최고 일관성이 필요할 때 |

`snapshot` 모드에서 QEMU Guest Agent가 활성화(`agent: 1`)된 경우, `guest-fsfreeze-freeze/thaw`를 호출하여 파일시스템 일관성을 강화한다.

---

### 압축 (`compress`)

| 값 | 압축률 | 속도 | 멀티스레드 |
| --- | ------ | ---- | ---------- |
| `0` / `none` | 없음 | 최고 | N/A |
| `lzo` | 낮음 | 빠름 | 단일 |
| `gzip` | 높음 | 느림 | pigz 설치 시 가능 |
| `zstd` (권장) | 높음 | 빠름 | 기본 지원 |

zstd 스레드 수는 별도 `zstd` 속성으로 제어한다:

```ini
compress zstd
zstd 4      # 4 스레드 사용 (0이면 CPU 코어 절반 자동 사용)
```

---

### 대역폭 제한 (`bwlimit`)

단위는 **KiB/s**이다. 0으로 설정하면 무제한이다.

```ini
bwlimit 51200    # 50 MiB/s
bwlimit 102400   # 100 MiB/s
bwlimit 0        # 무제한
```

---

### 보존 정책 (`prune-backups`)

쉼표로 구분된 복합 옵션 문자열이다. 규칙은 나열 순서대로 독립적으로 적용된다.

| 옵션 | 의미 |
| ---- | ---- |
| `keep-all=1` | 모든 백업 영구 보존 (다른 옵션과 충돌) |
| `keep-last=N` | 최신 N개 무조건 보존 |
| `keep-hourly=N` | 최근 N 시간, 시간당 최신 1개 |
| `keep-daily=N` | 최근 N 일, 하루당 최신 1개 |
| `keep-weekly=N` | 최근 N 주, 주당 최신 1개 (월~일 기준) |
| `keep-monthly=N` | 최근 N 개월, 월당 최신 1개 |
| `keep-yearly=N` | 최근 N 년, 연당 최신 1개 |

**실무 권장 보존 정책 예시 (일별 백업 기준):**

```ini
prune-backups keep-last=3,keep-daily=13,keep-weekly=8,keep-monthly=11,keep-yearly=9
```

이 설정은 최소 10년치 백업 커버리지를 제공한다.

---

### 알림 (`notification-mode`)

| 값 | 동작 |
| --- | ---- |
| `auto` (기본값) | `mailto` 설정 시 이메일, 미설정 시 notification-system 사용 |
| `legacy-sendmail` | 시스템 `sendmail`로 직접 발송 (v8.1 이전 방식) |
| `notification-system` | Datacenter → Notifications 매처(Matcher) 기반 발송 |

`notification-system` 사용 시 `mailto`, `mailnotification` 속성은 무시된다.

---

### Fleecing (`fleecing`)

VM 전용 고급 백업 최적화 기능으로, 백업 중 게스트의 새 쓰기 데이터를 백업 타겟 대신 **고속 로컬 스토리지에 임시 캐싱**한다.

```ini
# 비활성화 (기본값)
fleecing 0

# 활성화 - 로컬 스토리지 지정 필수
fleecing enabled=1,storage=local-lvm
```

Fleecing 스토리지는 **씬 프로비저닝(Thin Provisioning)**과 discard를 지원하는 고속 로컬 스토리지(LVM-thin, ZFS sparse, RBD 등)를 사용해야 한다.

---

### 성능 튜닝 속성

```ini
ionice 5                   # I/O 우선순위 (0-8, 기본값 7, BFQ 스케줄러 사용 시)
performance max-workers=8  # VM 병렬 I/O 워커 수 (1-256, 기본값 16)
zstd 4                     # zstd 압축 스레드 수
pigz 4                     # gzip 대신 pigz 사용 (1=코어 절반, N>1=N 스레드)
```

---

### 기타 속성

| 속성 | 기본값 | 설명 |
| ---- | ------ | ---- |
| `enabled 1` | `1` | 잡 활성화(`1`) / 비활성화(`0`) |
| `repeat-missed 0` | `0` | 실행 누락 시 가능한 빨리 재실행 여부 |
| `comment <string>` | — | 잡 설명 (최대 512자) |
| `protected 0` | `0` | 생성되는 백업에 보호 플래그 설정 |
| `notes-template <tmpl>` | — | 백업 노트 자동 생성 템플릿 |
| `script <path>` | — | 훅 스크립트 경로 |
| `stopwait 10` | `10` | stop 모드 시 VM 종료 대기 최대 시간(분) |
| `lockwait 180` | `180` | 글로벌 락 획득 대기 시간(분) |
| `tmpdir <path>` | — | 임시 파일 저장 디렉토리 (suspend 모드 CT) |

---

### 훅 스크립트 (`script`)

`script` 속성으로 백업 생명주기의 각 단계에 커스텀 스크립트를 후킹할 수 있다. **GUI에서는 이 속성을 설정할 수 없으며**, 파일 직접 편집 또는 `pvesh set` API로만 추가 가능하다.

스크립트가 호출되는 단계(Phase):

| 단계 | 호출 시점 | 유형 |
| ---- | --------- | ---- |
| `job-init` | 잡 초기화 직후 | 잡 전체 |
| `job-start` | 첫 백업 시작 전 | 잡 전체 |
| `job-end` | 마지막 백업 완료 후 | 잡 전체 |
| `job-abort` | 잡 중단 시 | 잡 전체 |
| `backup-start` | 각 VM 백업 시작 | VM별 |
| `backup-end` | 각 VM 백업 완료 | VM별 |
| `backup-abort` | 각 VM 백업 실패 | VM별 |
| `log-end` | 로그 파일 쓰기 완료 | VM별 |
| `pre-stop` | VM 종료 직전 | VM별 |
| `pre-restart` | VM 재시작 직전 | VM별 |
| `post-restart` | VM 재시작 직후 | VM별 |

스크립트 내에서 활용 가능한 환경변수: `TARGET`(백업 파일 경로), `LOGFILE`(로그 파일 경로), `STOREID`, `DUMPDIR`, `HOSTNAME`, `VMTYPE`.

---

## 잡 관리 방법

### 방법 1: 파일 직접 편집

```bash
vi /etc/pve/jobs.cfg
```

편집 후 `pvescheduler` 재시작 없이 즉시 반영된다.

### 방법 2: pvesh API CLI

```bash
# 잡 목록 조회
pvesh get /cluster/backup

# 특정 잡 상세 조회
pvesh get /cluster/backup/backup-8a0d2f63-a1ca

# 새 잡 생성
pvesh create /cluster/backup \
  --storage local-pbs \
  --vmid 100,101 \
  --schedule "mon..fri 02:00" \
  --mode snapshot \
  --compress zstd \
  --prune-backups "keep-last=3,keep-daily=7"

# 기존 잡 수정
pvesh set /cluster/backup/backup-8a0d2f63-a1ca \
  --vmid 100,101,102

# 잡 삭제
pvesh delete /cluster/backup/backup-8a0d2f63-a1ca
```

### 방법 3: 훅 스크립트 추가 (GUI 불가 항목)

```bash
pvesh set /cluster/backup/backup-07cdf241-8b56 \
  --script /usr/local/bin/my-hook-script.sh
```

---

## `/etc/vzdump.conf` vs `jobs.cfg` 관계

| 파일 | 범위 | 역할 |
| ---- | ---- | ---- |
| `/etc/vzdump.conf` | 노드 전역 | 모든 백업 잡의 **기본값(Fallback)** 설정 |
| `/etc/pve/jobs.cfg` | 클러스터 전체 | 개별 잡 정의, `vzdump.conf` 값을 **오버라이드** |

`jobs.cfg`에서 명시한 값이 항상 `vzdump.conf`의 전역 설정보다 우선한다. 공통으로 쓰이는 `bwlimit`, `compress`, `mode`는 `vzdump.conf`에 한 번만 설정하고, 잡별 예외 사항만 `jobs.cfg`에서 재정의하는 패턴이 효율적이다.

---

## 실전 구성 예시

### 예시 1: 소규모 학습 환경

```ini
vzdump: backup-dev-daily
    schedule daily 03:00
    all 1
    storage shared
    mode snapshot
    compress zstd
    prune-backups keep-last=3,keep-daily=7
    enabled 1
    notification-mode notification-system
    notes-template {{cluster}}, {{guestname}}, {{node}}, {{vmid}}
```

### 예시 2: 대규모 운영 환경 (PBS + Fleecing)

```ini
vzdump: backup-prod-nightly
    schedule mon..sat 01:00
    pool production
    storage pbs-storage
    mode snapshot
    compress zstd
    zstd 8
    bwlimit 204800
    performance max-workers=4
    fleecing enabled=1,storage=local-lvm
    prune-backups keep-last=4,keep-monthly=6
    enabled 1
    notification-mode notification-system
    repeat-missed 1
    notes-template {{cluster}}, {{guestname}}, {{vmid}}
```

### 예시 3: 평일 DB 서버 전용 (데이터 일관성 우선)

```ini
vzdump: backup-db-daily
    schedule mon..fri 23:00
    vmid 200,201
    node pve-db-node
    storage pbs-db
    mode stop
    compress zstd
    stopwait 15
    prune-backups keep-last=3,keep-daily=13,keep-weekly=4
    enabled 1
    script /etc/pve/scripts/db-backup-hook.sh
    notification-mode notification-system
    notes-template {{guestname}}_{{vmid}}
```

### 예시 4: 클러스터 내 특정 Pool 백업

```ini
vzdump: backup-dev-pool
    schedule sun 04:00
    pool development
    storage local-backup
    mode snapshot
    compress zstd
    prune-backups keep-last=2,keep-weekly=2
    enabled 1
    comment Dev pool weekly backup
    notification-mode notification-system
```

---

## 보존 정책 설계 원칙

보존 규칙은 **위에서 아래로 순차 적용**되며 이미 보존 처리된 백업은 다음 규칙에서 카운트되지 않는다.

```ini
keep-last=3         → 최신 3개 무조건 보존
keep-daily=13       → keep-last 커버 이후 13일치 일별 최신 1개
keep-weekly=8       → 이후 8주치 주별 최신 1개
keep-monthly=11     → 이후 11개월치 월별 최신 1개
keep-yearly=9       → 이후 9년치 연별 최신 1개
```

백업 빈도와 보존 기간이 맞지 않으면 중간 구간에 공백이 생길 수 있다. 예를 들어, 주 1회 백업에 `keep-daily=7`을 설정하면 실질적으로 7일치 중 최신 1개만 보존된다. **백업 빈도에 맞는 보존 옵션을 사용**하는 것이 핵심이다.

---

## 주의사항 및 운영 팁

1. **jobs.cfg 직접 편집 주의:** 구문 오류 시 pvescheduler가 해당 잡 전체를 파싱하지 못한다. 편집 후 `pvesh get /cluster/backup`으로 반드시 검증하라.

2. **script 속성은 GUI에서 보이지 않는다:** GUI로 잡을 편집하면 `script` 라인이 제거될 수 있다. 편집 후 반드시 재설정해야 한다.

3. **fleecing 스토리지 용량 계획:** Fleecing 이미지는 원본 디스크 크기만큼 커질 수 있다. 씬 프로비저닝 스토리지가 아닐 경우 풀 사이즈를 사전 할당한다.

4. **repeat-missed:** 유지보수 창 이후 밀린 백업이 동시에 실행될 수 있으므로 I/O 집약적인 환경에서는 신중하게 활성화하라.

5. **스토리지 레벨 prune vs 잡 레벨 prune:** `jobs.cfg`의 `prune-backups`가 스토리지 설정을 **오버라이드**한다. 두 설정이 충돌하지 않도록 일관성을 유지해야 한다.

---

## 참고 자료

| 주제 | URL |
| ---- | --- |
| Proxmox 백업 공식 문서 | https://pve.proxmox.com/pve-docs/chapter-vzdump.html |
| Backup API 레퍼런스 | https://pve.proxmox.com/pve-docs/api-viewer/#/cluster/backup |
| Proxmox Notifications | https://pve.proxmox.com/pve-docs-8/chapter-notifications.html |
| vzdump hook script 예시 | https://www.apalrd.net/posts/2022/pve_backup/ |
