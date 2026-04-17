---
title: "VM 백업 & 복구"
date: 2026-04-09
lastmod: 2026-04-16
author: "Davi"
description: "vzdump 백업 모드 선택 기준, .vma 파일 구조, qmrestore 복구 옵션, 보존 정책 설계, 스냅샷과의 결정적 차이까지."
slug: "backup-restore"
section: "notes"
category: "proxmox/backup"
tags: [proxmox, vzdump, qmrestore, backup, restore, snapshot, vma, zstd, retention]
order: 1
series: "Proxmox VE 학습 시리즈"
series_order: 6
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목          | 내용                                          |
| ------------- | --------------------------------------------- |
| 선행 문서     | `02-vm-lifecycle/02-vm-clone-and-snapshot.md` |
| 노드명        | kcy0122                                       |
| 백업 스토리지 | `local` (dir, /var/lib/vz)                    |

---

## 1. 백업과 스냅샷의 결정적 차이

스냅샷과 백업은 "VM 상태를 저장한다"는 겉모습이 비슷해서 혼동하기 쉽지만, 구조적으로 완전히 다르다.

```markdown
스냅샷:  [pve/data 풀] ─── base ─── snap1 ─── snap2 ─── current
                          ↑_________________________________↑
                          전부 동일한 물리 스토리지 위에 존재

백업:    [pve/data 풀] → vzdump → [별도 스토리지의 .vma.zst 파일]
                                   ↑
                                   완전히 독립된 파일. 원본과 다른 디스크여도 됨.
```

스냅샷은 **같은 디스크 위에** 존재한다. 물리 디스크가 고장 나면 스냅샷도 함께 사라진다. 백업은 별도 스토리지에 자기 완결적인 파일로 존재하므로, 원본 스토리지 풀이 완전히 날아가도 복구할 수 있다.

이것이 "스냅샷은 백업이 아니다"라는 원칙의 물리적 근거다.

---

## 2. vzdump — 백업 실행 엔진

### 2.1 명령어 구조

```bash
vzdump <VMID> [OPTIONS]

vzdump <VMID> \
  --mode     snapshot \        # 백업 모드 (stop | snapshot | suspend)
  --compress zstd \            # 압축 알고리즘
  --storage  <스토리지명> \    # 백업 저장 위치 (기본: local)
  --notes    "<메모>" \        # 백업 파일에 첨부할 메모
  --remove   3                 # 보관 개수 초과 시 오래된 것 자동 삭제
```

Proxmox의 백업은 항상 **풀 백업(Full Backup)**이다. 증분 백업은 PBS(Proxmox Backup Server)의 영역이고, vzdump는 매번 VM 전체를 하나의 아카이브로 만든다.

### 2.2 백업 모드 — 가장 중요한 선택

백업 모드는 "VM을 어떤 상태로 두고 디스크를 읽느냐"를 결정한다. 데이터 일관성과 다운타임 사이의 트레이드오프다.

#### Stop 모드

VM을 정상 종료(Graceful Shutdown)한 뒤 디스크를 복사한다. VM이 완전히 꺼진 상태에서 파일시스템 저널이 깨끗하게 닫혀 있으므로 **데이터 일관성이 100% 보장**된다.

중요한 오해 하나: Stop 모드가 백업이 끝날 때까지 VM이 꺼져 있는 것은 **아니다.** Proxmox는 VM 종료 직후 즉시 재기동시키고, 실제 디스크 복사는 백그라운드에서 진행한다. 다운타임은 종료부터 재기동까지의 수 초~수십 초 구간뿐이다.

```markdown
qm stop <VMID>                     ← VM 종료 (다운타임 시작)
  ↓
QEMU 프로세스가 디스크 스냅샷 포인트 설정
  ↓
qm start <VMID>                    ← VM 재기동 (다운타임 종료)
  ↓
백그라운드에서 스냅샷 포인트 기준 블록 복사   ← VM은 실행 중
```

#### Snapshot 모드

VM을 중단하지 않고 **QEMU 블록 레이어에서 라이브 백업**을 수행한다. 다운타임이 거의 없다.

QEMU Guest Agent가 설치되어 있으면 백업 직전에 `guest-fsfreeze-freeze`를 호출하여 파일시스템 I/O를 수 ms간 일시 중단하고, 일관된 스냅샷 포인트를 확보한 뒤 `guest-fsfreeze-thaw`로 재개한다. 이 freeze 구간이 사실상의 다운타임이며, 수십 ms 수준이다.

Guest Agent가 없으면 파일시스템이 동결되지 않은 채로 스냅샷이 찍힌다. 복원하면 비정상 종료 후 재부팅한 것과 동일한 상태가 된다. ext4/xfs는 저널링으로 대부분 복구되지만, DB 트랜잭션 중간 상태 같은 애플리케이션 레벨 일관성은 보장하지 못한다.

```markdown
VM 실행 중
  ↓
QEMU 블록 레이어: dirty bitmap 활성화   ← 이 시점부터 변경 블록 추적
  ↓
[Guest Agent 있을 때] fsfreeze-freeze   ← 파일시스템 쓰기 일시 중단 (수 ms)
  ↓
QEMU internal snapshot 생성            ← 일관된 시작점 확보
  ↓
[Guest Agent 있을 때] fsfreeze-thaw     ← 파일시스템 쓰기 재개
  ↓
백그라운드에서 스냅샷 기준 블록 복사   ← VM은 계속 실행 중
  ↓
복사 완료 후 internal snapshot 제거
```

#### Suspend 모드 (비권장)

VM을 일시 정지(Suspend)한 뒤 Snapshot 모드를 호출한다. Proxmox 9.x에서는 스토리지가 스냅샷을 지원하면 내부적으로 Snapshot 모드로 폴백하므로 Stop과 Snapshot 두 가지만 구분하면 충분하다. 하위 호환성을 위해 남아 있는 옵션.

#### 모드 비교

| 모드     | 다운타임          | 데이터 일관성                          | 적합 상황                        |
| -------- | ----------------- | -------------------------------------- | -------------------------------- |
| Stop     | 짧음 (수~수십 초) | 완벽                                   | 계획된 유지보수, 마이그레이션 전 |
| Snapshot | 거의 없음 (수 ms) | Guest Agent 있으면 높음, 없으면 불완전 | 정기 백업, 운영 환경             |
| Suspend  | 중간              | Stop과 비슷                            | 사용하지 말 것                   |

### 2.3 백업 파일의 물리적 실체 — .vma 포맷

`vzdump`이 만드는 것은 결국 **하나의 아카이브 파일**이다.

```markdown
/var/lib/vz/dump/
  └── vzdump-qemu-201-2026_04_09-14_30_00.vma.zst
  └── vzdump-qemu-201-2026_04_09-14_30_00.vma.zst.notes
  └── vzdump-qemu-201-2026_04_09-14_30_00.log
```

파일명 구조:

```markdown
vzdump  -  qemu  -  201  -  2026_04_09-14_30_00  .  vma  .  zst
  ↑          ↑      ↑             ↑                   ↑      ↑
도구명     VM타입   VMID        타임스탬프            포맷   압축
```

`.vma` 파일 내부 구조:

```markdown
.vma 파일
  ├── header      : VM 설정 메타데이터 (스토리지, NIC, CPU 정보 등)
  ├── config blob : /etc/pve/qemu-server/<VMID>.conf 전체
  └── disk blobs  : 각 디스크 볼륨의 raw 데이터 스트림
```

`.conf` 파일까지 아카이브에 포함되기 때문에, 복구 시 원래 VM 설정이 그대로 재현된다. 스냅샷은 `.conf`를 별도 저장하지 않는다는 점에서 이것이 결정적 차이다.

| 확장자     | 의미           |
| ---------- | -------------- |
| `.vma`     | 비압축         |
| `.vma.lzo` | LZO 압축       |
| `.vma.gz`  | gzip 압축      |
| `.vma.zst` | zstd 압축      |
| `.notes`   | 백업 메모 파일 |
| `.log`     | 백업 실행 로그 |

### 2.4 압축 알고리즘 선택

```bash
vzdump <VMID> --compress zstd   # 권장
vzdump <VMID> --compress gzip
vzdump <VMID> --compress lzo
vzdump <VMID> --compress 0      # 압축 없음
```

| 알고리즘 | 속도      | 압축률 | CPU 부하  | 특징                                          |
| -------- | --------- | ------ | --------- | --------------------------------------------- |
| `zstd`   | 빠름      | 높음   | 낮음      | 속도·압축률 균형. **Proxmox 7.0 이후 기본값** |
| `lzo`    | 빠름      | 낮음   | 매우 낮음 | CPU 부하 최소. 빠른 복구 우선 시              |
| `gzip`   | 느림      | 높음   | 높음      | 전통적 방식. 호환성 좋음                      |
| 없음     | 가장 빠름 | 없음   | 없음      | 스토리지 여유가 충분하고 속도가 최우선일 때   |

`zstd`는 Facebook이 개발한 알고리즘으로 gzip 수준의 압축률을 lzo 수준의 속도로 달성한다. 특별한 이유가 없다면 `zstd`를 사용한다.

### 2.5 보관 정책 (Retention)

```bash
vzdump <VMID> --mode snapshot --compress zstd \
  --prune-backups keep-last=3,keep-daily=7,keep-weekly=4,keep-monthly=6
```

`--remove N`은 단순히 최근 N개만 남기는 축약 옵션이고, `--prune-backups`는 세분화된 정책을 지정할 수 있다.

| 옵션             | 동작                                                            |
| ---------------- | --------------------------------------------------------------- |
| `keep-all=1`     | 모든 백업 영구 보존. 스토리지 고갈 위험                         |
| `keep-last=N`    | 가장 최근 N개만 유지. 시간 무관, 개수 기준                      |
| `keep-daily=N`   | 최근 N일간 하루 1개씩 유지. 하루에 여러 번 백업해도 마지막 것만 |
| `keep-weekly=N`  | 최근 N주간 주 1개씩 유지                                        |
| `keep-monthly=N` | 최근 N개월간 월 1개씩 유지                                      |
| `keep-yearly=N`  | 최근 N년간 연 1개씩 유지                                        |

> `--remove`를 빠뜨리면 백업이 무한정 쌓여 스토리지를 잡아먹는다. 운영 환경에서는 반드시 보존 정책을 명시한다.

---

## 3. qmrestore — 복구 실행 엔진

### 3.1 명령어 구조

```bash
qmrestore <백업파일> <VMID> [OPTIONS]
```

`qmrestore`는 `.vma` 파일을 분해하여 역순으로 재조립한다. 먼저 아카이브 내부의 `.conf` 메타데이터를 읽어 VM 설정을 복원하고, 디스크 Blob을 지정된 스토리지에 기록한다.

### 3.2 VMID 충돌 처리

```bash
# 현재 VMID 201이 실행 중인데 동일 VMID로 복구 시도하면:
qmrestore vzdump-qemu-201-*.vma.zst 201
# → ERROR: VM 201 already exists

# 해결 1: 다른 VMID로 복구
qmrestore vzdump-qemu-201-*.vma.zst 299

# 해결 2: --unique 옵션 — MAC 주소 등 게스트 고유값 자동 재생성
# 원본 VM과 네트워크 충돌 방지. 원본이 살아있는 상태에서 복구할 때 필수.
qmrestore vzdump-qemu-201-*.vma.zst 299 --unique

# 해결 3: --force 옵션 — 기존 VM을 덮어씀 (위험)
# 기존 201의 디스크가 영구 삭제된다. 반드시 확인 후 사용.
qmrestore vzdump-qemu-201-*.vma.zst 201 --force
```

> **CMP 구현 시:** `--force`는 기존 데이터를 영구 삭제하므로, API 호출 전 반드시 사용자 확인 단계를 넣어야 한다. `qm rollback`과 동일한 수준의 불가역 작업이다.

### 3.3 스토리지 대상 지정

```bash
qmrestore <백업파일> <VMID> --storage local-lvm
```

`--storage` 없이 복구하면, 아카이브 내부 `.conf`에 기록된 원본 스토리지명(`local-lvm`, `local-zfs` 등)으로 복구를 시도한다. 다른 노드로 이전하거나 스토리지 구성이 달라진 경우 실패한다.

다른 노드 또는 다른 스토리지로 복구할 때는 항상 `--storage`를 명시한다.

### 3.4 복구 시 주요 주의사항

| 시나리오             | 처리 방법                                                                              |
| -------------------- | -------------------------------------------------------------------------------------- |
| VMID 충돌            | 다른 VMID 지정 또는 `--unique` 사용                                                    |
| 다른 노드로 복구     | 백업 파일이 있는 스토리지에 대상 노드가 접근 가능해야 함. NFS 공유 스토리지 필요       |
| 다른 스토리지로 복구 | `--storage` 명시. 원본이 local-lvm이어도 shared로 복구 가능                            |
| 네트워크 충돌        | 복구된 VM은 원본과 동일한 MAC·IP를 가짐. 원본이 실행 중이면 충돌 발생. `--unique` 필수 |
| 특정 파일만 복구     | 임시 VMID로 전체 복구 → 필요한 파일 추출 → 임시 VM 삭제                                |

**복구는 복구해봐야 완료다.** 백업이 됐다고 끝이 아니라, 실제로 복구하여 부팅이 되고 서비스가 동작하는 것까지 확인해야 진짜 완료다. 이 과정을 자동화하는 것이 CMP의 Backup Verification 기능이다.

---

## 4. 실습

### 4.1 모드별 백업 실행

```bash
# Snapshot 모드 (VM 실행 유지)
vzdump 201 --mode snapshot --storage local --compress zstd

# Stop 모드 (짧은 다운타임)
vzdump 201 --mode stop --storage local --compress zstd

# 백업 파일 확인
ls -lh /var/lib/vz/dump/vzdump-qemu-201-*
```

### 4.2 복구 실습

```bash
# 시나리오 1: 다른 VMID로 복구
qmrestore /var/lib/vz/dump/vzdump-qemu-201-*.vma.zst 299 \
  --storage local-lvm

# 시나리오 2: 복구된 VM 부팅 확인
qm start 299
qm status 299

# 시나리오 3: 테스트 완료 후 정리
qm destroy 299 --purge
```

### 4.3 보존 정책 시뮬레이션

```bash
# 삭제 없이 어떤 백업이 정리될지 미리 확인 (--dry-run)
pvesm prune-backups local --type qemu --vmid 201 \
  --keep-last 2 --dry-run

# 실제 적용
pvesm prune-backups local --type qemu --vmid 201 \
  --keep-last 2
```

> `--dry-run` 없이 바로 실행하지 말 것. 삭제는 되돌릴 수 없다.

---

## 부록: 검증 체크리스트

```bash
# 백업 파일 목록 확인
ls -lh /var/lib/vz/dump/

# 백업 로그 확인 (마지막 백업의 성공/실패)
cat /var/lib/vz/dump/vzdump-qemu-201-*.log | tail -5
# → "INFO: Finished Backup of VM 201 (xx:xx:xx)" 확인

# Guest Agent fsfreeze 동작 확인 (Snapshot 모드 백업 로그)
grep -i "freeze\|thaw" /var/lib/vz/dump/vzdump-qemu-201-*.log

# 복구 후 VM 설정이 원본과 동일한지 비교
diff <(qm config 201) <(qm config 299)
```

> - **공식 문서:** https://pve.proxmox.com/pve-docs/chapter-vzdump.html
> - **공식 문서 — Restore:** https://pve.proxmox.com/pve-docs/chapter-vzdump.html#_restore
