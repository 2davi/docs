---
title: "Proxmox VE 실습 - VM 백업/복구"
date: 2026-04-09
lastmod: 2026-04-09
author: "Davi"
description: "VM 백업/복구와 관련한 Proxmox 개념과 CLI 조작을 다룬다."
slug: "proxmox-vm-backup-and-restore"
section: "notes"
category: "linux"
tags: [proxmox, qemu, kvm, rest-api, cloud-init, guest-agent, vzdump, snapshot, clone, backup, restore, template, upid]
order: 150
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 5
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 1. 백업 (Backup) — vzdump

### 백업과 스냅샷: **독립성**

```powershell
스냅샷:  [pve/data 풀] ─── base ─── snap1 ─── snap2 ─── current
                        ↑_____________________↑
                        같은 물리 스토리지 위에 전부 존재

백업:    [pve/data 풀] → vzdump → [local 스토리지의 .vma.zst 파일]
                                   ↑
                                   완전히 독립된 파일. 스토리지가 달라도 됨.
```

> 스토리지 풀이 고장나도 백업 파일은 살아있다. 반대로 백업 파일을 지워도 VM은 정상 작동한다.

### 1.1 백업 명령어

```bash
vzdump <VMID> [OPTIONS]
```

```bash
vzdump <VM_ID> \
  --mode snapshot \          # 백업 모드
  --compress zstd \          # 압축 알고리즘
  --storage <STORAGE_NAME> \ # 백업 저장 위치 (기본: local)
  --notes "<ANY_COMMENT>" \  # 백업에 메모 첨부
  --remove 3                 # 보관 개수 초과 시 오래된 것 자동 삭제
```

> `--remove`가 중요하다. 이 설정을 빠뜨리면, 백업이 쌓여서 스토리지를 잡아먹는다. 운영 환경에서는 보고나 정책(Retention Policy)로 강제한다.

Proxmox의 백업은 항상 **풀 백업(Full Backup)**이다. VM 설정과 모든 디스크 데이터가 하나의 아카이브 파일(`.vma`)로 만들어진다.

### 1.2 백업의 물리적 실체

`vzdump`가 만들어내는 건 결국 **하나의 아카이브 파일**이다.
QEMU VM의 백업은 `.vma` (Virtual Machine Archive) 포맷으로 저장된다. 압축 알고리즘에 따라 확장자가 달라진다.

```powershell
/var/lib/vz/dump/
  └── vzdump-qemu-102-2026_04_09-14_30_00.vma.zst
```

**파일명 구조:**

```powershell
vzdump - qemu - 102 - 2026_04_09-14_30_00 . vma . zst
  ↑        ↑     ↑           ↑               ↑     ↑
도구명   VM타입  VMID       타임스탬프       포맷  압축
```

**`.vma` 파일 내부 구조:**

```powershell
.vma 파일 내부 구조
  ├── header       : VM 설정(config) 메타데이터
  ├── config blob  : /etc/pve/qemu-server/<VMID>.conf 전체
  └── disk blobs   : 각 디스크 볼륨의 raw 데이터 스트림
```

| 확장자                          | 의미      |
| ------------------------------- | --------- |
| `vzdump-qemu-<VMID>-<날짜>.vma` | 비압축    |
| `*.vma.lzo`                     | LZO 압축  |
| `*.vma.gz`                      | gzip 압축 |
| `*.vma.zst`                     | zstd 압축 |

`.conf` 파일까지 아카이브에 포함되기 때문에, 복구 시 원래 VM 설정이 그대로 재현된다. 이게 스냅샷과 백업의 결정적 차이.

> **백업은 스토리지와 완전히 독립된 자기 완결적 파일**이다.

? 자기 완결적 파일이 무슨 뜻이야?

### 1.3 백업 모드 (Backup Mode)

이 세 가지 모드의 차이를 정확히 이해하는 것이 CMP의 백업 정책 설계에 직결된다.

**Stop 모드:**

VM을 정상 종료(Graceful Shutdown)시킨 뒤 백업을 수행한다. VM이 깨끗하게 종료된 상태에서 디스크를 복사하므로, **데이터 일관성(Consistency)\*이 100% 보장된다.** 다만 백업이 시작될 때 짧은 다운타임(Downtime)이 발생한다. Proxmox는 셧다운 후 vCPU를 일시 정지(Pause)한 상태에서 백업 트래킹을 시작하고, 준비가 되면 VM을 다시 기동하므로, 실제 다운타임은 수 초에서 수 분 수준이다.\*\* 전체 백업 시간 동안 VM이 꺼져 있는 것은 아니다.

\* - **VM이 완전히 꺼진 상태에서 디스크를 읽으니까,** 파일시스템 저널이 깨끗하게 닫혀 있기 때문.
\*\* - Proxmox는 VM을 완전히 종료 후 즉시 재기동시키며, 디스크 복사는 백그라운드에서 진행한다.

```powershell
qm stop <VMID>          ← VM 정상 종료
  ↓
vzdump 디스크 복사       ← VM 꺼진 상태에서 블록 단위 복사
  ↓
qm start <VMID>         ← VM 재기동
```

**Snapshot 모드:**

VM을 중단하지 않고, **QEMU 블록 레이어에서 라이브 백업(Live Backup)**을 수행한다. 다운타임이 거의 없다.\* QEMU Guest Agent가 활성화되어 있으면, 백업 직전에 `guest-fsfreeze-freeze`를 호출하여 파일시스템을 동결(Freeze)하고, 백업 준비가 끝나면 `guest-fsfreeze-thaw`로 해동(Thaw)한다. 이를 통해 파일시스템 수준의 일관성을 확보한다.

Guest Agent가 없으면? 파일시스템이 동결되지 않으므로, 복원 시 비정상 종료 후 부팅한 것과 유사한 상태가 된다. 파일시스템 저널링(Journaling)이 있다면 대부분 복구 가능하지만, 애플리케이션 레벨의 데이터 일관성은 보장하지 못한다.\*\*

\* - 핵심은 **"fsfreeze"** 구간이 수 ms로 극히 짧다는 것이다.
\*\* - Guest Agent가 없으면 fsfreeze 단계가 누락되고, 파일시스템이 쓰기 중인 상태에서 스냅샷이 찍힌다. 이 경우 복원하면 **비정상 종료 후 재부팅한 것과 동일한 상태**가 된다. **ext4/xfs**는 저널링 덕분에 대부분 복구되나, 애플리케이션 레벨은 보장 못 함(DB 트랜젝션 중간 상태 등).

```powershell
VM 실행 중
  ↓
QEMU 블록 레이어에 "dirty bitmap" 활성화   ← 이 시점부터 변경 블록 추적 시작
  ↓
[Guest Agent 있을 때] fsfreeze-freeze      ← 파일시스템 쓰기 일시 중단 (수 ms)
  ↓
QEMU internal snapshot 생성               ← 일관된 시작점 확보
  ↓
[Guest Agent 있을 때] fsfreeze-thaw        ← 파일시스템 쓰기 재개
  ↓
백그라운드에서 스냅샷 기준점부터 블록 복사  ← VM은 계속 실행 중
  ↓
복사 완료 후 internal snapshot 제거
```

**Suspend 모드 (호환성 유지용, 비권장):**

VM을 일시 정지(Suspend)한 뒤 Snapshot 모드를 호출한다. Snapshot 모드보다 다운타임이 길면서 데이터 일관성이 더 좋아지지도 않기 때문에, Proxmox 공식 문서에서도 Snapshot 모드 사용을 권장한다.

```powershell
VM 일시 정지(Suspend to RAM)
  ↓
Snapshot 모드 호출
  ↓
VM 재개
```

**정리하자면:**

| 모드     | 다운타임         | 데이터 일관성                          | 적합한 상황                           |
| -------- | ---------------- | -------------------------------------- | ------------------------------------- |
| Stop     | 짧음 (수초~수분) | 완벽                                   | 계획된 유지보수, 마이그레이션 전 백업 |
| Suspend  | 중간             | Stop과 비슷 (비권장)                   | 사용하지 말 것                        |
| Snapshot | 거의 없음        | Guest Agent 있으면 높음, 없으면 불완전 | 정기 백업, 운영 환경                  |

### 1.4 압축 알고리즘

명령어는 다음과 같다:

```bash
vzdump <VMID> --compress zstd   # 권장
vzdump <VMID> --compress gzip
vzdump <VMID> --compress lzo
vzdump <VMID> --compress 0      # 압축 없음
```

| 알고리즘      | 속도      | 압축률 | CPU 부하  | 특징                                         |
| ------------- | --------- | ------ | --------- | -------------------------------------------- |
| `lzo`         | 빠름      | 낮음   | 매우 낮음 | CPU 부하 최소, 빠른 백업/복원 우선 시        |
| `gzip`        | 느림      | 높음   | 높음      | 전통적, 호환성 좋음                          |
| `zstd` (권장) | 빠름      | 높음   | 낮음      | 속도와 압축률 모두 우수. Proxmox 기본 권장값 |
| 없음          | 가장 빠름 | 없음   | 없음      | 가장 빠름                                    |

`zstd`는 Facebook이 개발한 압축 알고리즘으로, `gzip` 수준의 압축률을 `lzo` 수준의 속도로 달성한다. 특별한 이유가 없다면 `zstd`를 사용하라. Proxmox 7.0부터 기본값이 `zstd`로 바뀐 이유이다.

### 1.5 백업 보관 정책 (Retention)

```bash
vzdump <VMID> --mode snapshot --compress zstd \
  --prune-backups keep-last=3,keep-daily=7,keep-weekly=4,keep-monthly=6
```

`prune-backups` 옵션으로 보관 정책을 세밀하게 설정할 수 있다. 이 정책은 스토리지(Storage) 레벨에서도 설정 가능하고, Web UI의 `Datacenter → Storage → Edit`에서도 관리할 수 있다.

---

## 2. 복구 (Restore)

### 2.1 복구 명령어

```bash
qmrestore <file> <VMID> [OPTIONS]
```

`qmrestore`는 `.vma` 파일을 분해해서 역순으로 재조립한다. `.conf` 메타데이터를 먼저 읽어서 VM 설정을 복원하고, 디스크 Blob을 스토리지에 기록한다.

### 2.1 기본 사용

```bash
# 특정 스토리지에 복원
qmrestore /var/lib/vz/dump/vzdump-qemu-100-2026_04_07-12_00_00.vma.zst 200 \
  --storage local-lvm
```

### 2.2 VMID 충돌 처리

```bash
# 현재 VMID 102가 살아있는데, 백업에서도 102로 복구하려 하면?
qmrestore /var/lib/vz/dump/vzdump-qemu-102-*.vma.zst 102
# → ERROR: VM 102 already exists
```

> 복원하려는 VMID가 이미 사용 중이면 에러가 발생한다. 두 가지 해결 방법이 있다.

1. 다른 VMID를 지정: `qmrestore <file> 201`
2. `--unique` 옵션 사용: MAC 주소 등 게스트 고유값을 자동 재생성하여, 원본 VM과 네트워크 충돌을 방지
3. `--force` 옵션 사용:

```bash
# 다른 VMID로 복구
qmrestore /var/lib/vz/dump/vzdump-qemu-102-*.vma.zst 200

# 기존 VMID와 충돌 시 --unique 사용
qmrestore <file> 200 --unique

# 기존 VM 덮어쓰기 (위험 — 기존 102 데이터 날아감)
qmrestore /var/lib/vz/dump/vzdump-qemu-102-*.vma.zst 102 --force
```

### 2.3 스토리지 대상 지정

```bash
qmrestore <백업파일> <VMID> --storage <스토리지명>
```

`--storage` 옵션으로 복원 대상 스토리지를 지정한다. 생략하면 백업 당시의 원래 스토리지에 복원을 시도하는데, 해당 스토리지가 존재하지 않으면 실패한다. 다른 노드(Node)로 마이그레이션(Migration)하면서 복원할 때는 반드시 대상 스토리지를 명시하라.

> 백업 파일 안의 `.conf`에는 원본이 사용하던 스토리지명(`local-lvm` 등)이 박혀있다. 복구 대상 노드에 동일한 스토리지명이 없으면 에러 발생. `--storage` 옵션을 명시적으로 지정하면 이를 오버라이드할 수 있다.

<br/>

> 클러스터간 VM 이동(Migration Alternative)으로 백업 + 복구를 쓸 때 이 옵션이 필수이다.

---

---

> **공식 문서:** https://pve.proxmox.com/pve-docs/chapter-vzdump.html
> **공식 문서:** https://pve.proxmox.com/pve-docs/chapter-vzdump.html#_restore
