---
title: "VM 복제 & 스냅샷"
date: 2026-04-08
lastmod: 2026-04-16
author: "Davi"
description: "Full Clone vs Linked Clone, CoW 메커니즘, 스냅샷 체인의 I/O 동작, Template 설계 전략, VMID 체계 실습까지."
slug: "vm-clone-and-snapshot"
section: "notes"
category: "proxmox"
tags: [proxmox, qemu, clone, snapshot, template, cow, lvm-thin, linked-clone, full-clone]
order: 2
series: "Proxmox VE 학습 시리즈"
series_order: 4
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목      | 내용                                                 |
| --------- | ---------------------------------------------------- |
| 선행 문서 | `02-vm-lifecycle/01-vm-create.md`                    |
| 실습 VM   | VM 201 (`dev-api-01`, Ubuntu 24.04, e1000 NIC, 활성) |
| 스토리지  | `local-lvm` (LVM-thin pool)                          |

---

## 1. VM 복제 (Clone)

### 1.1 명령어

```bash
qm clone <원본VMID> <새VMID> [OPTIONS]

# 주요 옵션
qm clone <VMID> <NEWID> \
  --name <이름>           \  # 새 VM 이름
  --full                  \  # Full Clone 강제 (템플릿에서도)
  --storage <스토리지>    \  # 클론 디스크가 저장될 스토리지
  --snapname <스냅샷명>      # 특정 스냅샷 시점을 기준으로 복제
```

### 1.2 복제가 하는 일 — 두 가지 레이어

VM 하나는 두 가지 구성 요소로 이루어진다:

```markdown
① /etc/pve/qemu-server/<VMID>.conf    ← 메타데이터 (CPU, RAM, NIC, 디스크 경로)
② 스토리지 풀의 디스크 볼륨          ← 실제 데이터 (수 GB ~ 수백 GB)
```

`qm clone`은 이 두 가지를 **어떻게 복사하느냐**의 문제이고, 그 답이 Full Clone이냐 Linked Clone이냐를 결정한다.

---

## 2. Full Clone vs Linked Clone

### 2.1 스토리지 레이어 관점

```markdown
[Full Clone]
────────────────────────────────────────────────────
원본 VM 디스크:  [Block A][Block B][Block C] ...
                        ↓ 전체 복사 (분 단위 소요)
클론 VM 디스크:  [Block A'][Block B'][Block C'] ...
                (완전히 독립된 새 볼륨)


[Linked Clone]  ← Template이 있어야만 가능
────────────────────────────────────────────────────
Template 디스크: [Block A][Block B][Block C]  (읽기 전용 고정)
                  ↑ 공유 참조(CoW 베이스) ↑
         ┌────────┴────────┐
Clone-1 델타 레이어     Clone-2 델타 레이어
(변경분만 저장)         (변경분만 저장)
```

Linked Clone이 Block B를 수정하면:

1. 템플릿의 Block B 읽기
2. 자신의 델타 레이어에 Block B 복사 후 수정
3. 이후로는 델타 레이어의 수정된 블록 참조

쓰기가 발생하기 전까지는 아무것도 복사하지 않는다 — **Copy-on-Write(CoW)**.

### 2.2 CoW 메커니즘 심층 이해

CoW는 스냅샷과 Linked Clone의 공통 기반 원리다.

```markdown
      [Template Disk — Readonly]
                ↑  읽기 참조
     ┌──────────┴──────────┐
     ↓                      ↓
[Clone-A 델타]          [Clone-B 델타]
 (변경분만)              (변경분만)
```

**읽기(Read):** 클론의 델타 레이어에 해당 블록이 있으면 그것을 읽고, 없으면 템플릿 베이스로 거슬러 올라간다.

**쓰기(Write):** 해당 블록을 먼저 클론의 델타 레이어에 복사(Copy)한 뒤 수정(Write). 이 "복사 후 쓰기"가 CoW 오버헤드의 실체다.

결론적으로 **Linked Clone은 생성은 빠르지만, 생성 직후 처음 쓰기가 발생할 때마다 느려진다.** VM 부팅 직후 OS가 여러 블록에 동시에 쓰기를 시도하므로, 부팅 초반에 I/O가 집중적으로 튀는 현상이 발생한다.

CoW가 구현되는 레이어:

| 구현 레이어     | 방식            | 사용 스토리지 |
| --------------- | --------------- | ------------- |
| 파일 레벨       | QCOW2 포맷 내부 | `local` (dir) |
| 블록 레벨       | LVM-thin 스냅샷 | `local-lvm`   |
| 파일시스템 레벨 | ZFS CoW         | `local-zfs`   |

### 2.3 Full Clone vs Linked Clone 비교

| 항목              | Full Clone                   | Linked Clone                                      |
| ----------------- | ---------------------------- | ------------------------------------------------- |
| 디스크 구조       | 완전 독립 볼륨               | 템플릿 디스크를 CoW 베이스로 참조                 |
| 생성 속도         | 느림 (디스크 전체 복사)      | 매우 빠름 (델타 레이어 메타데이터만 생성)         |
| 저장 용량         | 전체 용량                    | 변경분(delta)만 사용                              |
| 템플릿 의존성     | 없음 (원본 삭제 후에도 독립) | 있음 (모든 Linked Clone 삭제 전 템플릿 보존 필수) |
| 초기 I/O 성능     | 즉시 풀 성능                 | 첫 쓰기마다 CoW 오버헤드 발생                     |
| 스토리지 요구사항 | 없음 (모든 스토리지)         | LVM-thin 또는 ZFS만 지원                          |
| 용도              | 운영 배포, 장기 운용 VM      | 빠른 개발 환경 스핀업, 단기 테스트                |

> `--full` 옵션 없이 클론하면: 일반 VM → Full Clone, 템플릿 → Linked Clone이 기본값이다.

---

## 3. Template — 복제의 원판

### 3.1 Template이란

VM을 Template으로 변환하면 디스크가 **읽기 전용(Read-Only)**으로 마킹된다. 이 VM은 더 이상 Start할 수 없고, 오직 Clone의 원판으로만 기능한다.

```bash
qm template <VMID>
```

**되돌릴 수 없다.** 변환 전에 반드시 스냅샷 또는 백업을 확보해야 한다.

### 3.2 Template 설계 원칙

좋은 Template은 **최소한으로 설정된 기반 이미지**다. 너무 많은 것을 넣으면 클론한 VM마다 불필요한 패키지가 따라붙고, 너무 적게 넣으면 매번 설치 작업이 반복된다.

권장 Template 구성:

- OS 설치 + `apt full-upgrade` 완료
- QEMU Guest Agent 설치
- `cloud-init` 패키지 설치 (Cloud-Init 연동 예정이라면)
- SSH 키 초기화 (`cloud-init clean` 또는 수동 제거)
- 애플리케이션은 넣지 않음

### 3.3 Template 사용 패턴

```markdown
[원본 VM] → qm clone → [백업 클론] → qm snapshot → [스냅샷 기준점]
                                          ↓
                              qm clone (--snapname) → [Template VM]
                                          ↓
                              qm template → [Template] (읽기 전용)
                                          ↓
                    qm clone (Linked 또는 Full) → [운용 VM] ...
```

백업 클론을 중간에 두는 이유: 원본 VM이 Template으로 변환된 뒤 문제가 생겨도 백업 클론에서 다시 만들 수 있다.

---

## 4. 스냅샷 (Snapshot)

### 4.1 명령어

```bash
qm snapshot <VMID> <스냅샷명> [--description <문자열>] [--vmstate <0|1>]
qm listsnapshot <VMID>
qm rollback <VMID> <스냅샷명>
qm delsnapshot <VMID> <스냅샷명>
```

### 4.2 스냅샷이 저장하는 것

```markdown
스냅샷 = ① 디스크 상태       (항상)
        + ② VM 설정(.conf)   (항상)
        + ③ RAM 상태          (--vmstate 1 옵션 시에만)
```

"스냅샷 = 상태 저장"이라는 막연한 이해로 그치면 안 된다. 구체적으로 무엇이 저장되고 무엇이 저장되지 않는지를 알아야 한다.

### 4.3 스냅샷 체인과 I/O 성능 저하

QCOW2 또는 LVM-thin 기반 스냅샷을 찍으면 그 시점의 디스크 상태가 "동결"되고, 이후의 모든 변경은 새로운 델타 레이어에 기록된다. 여러 번 찍으면 체인이 형성된다.

```markdown
[base] ← [snap1] ← [snap2] ← [current(live)]
```

`current`가 Block X를 읽으려 할 때:

```markdown
① current 레이어에 Block X가 있나?  → 있으면 반환
② snap2 레이어에 있나?              → 있으면 반환
③ snap1 레이어에 있나?              → 있으면 반환
④ base 레이어에서 반환
```

체인 깊이가 N이면, 최악의 경우 읽기 I/O가 N번 발생한다. **스냅샷이 쌓일수록 I/O 성능이 선형적으로 저하된다.**

> **원칙:** 스냅샷은 단기 롤백 용도(패치 전/후)로 사용하고, 작업 완료 후 즉시 삭제한다. 장기 보관 목적에는 백업(vzdump)을 사용한다.

### 4.4 RAM State (`--vmstate`) 포함 여부

| 항목        | vmstate 미포함                | vmstate 포함                        |
| ----------- | ----------------------------- | ----------------------------------- |
| 스냅샷 크기 | 디스크 변경분                 | 디스크 변경분 + RAM 용량            |
| 생성 시간   | 짧음                          | RAM Dump 시간 추가                  |
| 롤백 결과   | VM이 정지(Stopped) 상태       | 스냅샷 당시 실행 상태 그대로 복원   |
| 적합 상황   | 패치 전 체크포인트, 일반 백업 | 특정 실행 상태(트랜잭션 중 등) 보존 |

RAM 포함 스냅샷은 RAM 용량만큼 스토리지를 추가 소비한다. 16GB RAM VM에 vmstate 스냅샷을 찍으면 스냅샷 하나에 16GB+ 가 소모된다. 운영 환경에서는 신중하게 사용해야 한다.

### 4.5 스냅샷은 백업이 아니다

```markdown
스냅샷: [물리 디스크 A] 위에 [base] + [snap1] + [snap2] 전부 존재
백업  : [물리 디스크 A] → vzdump → [별도 스토리지 B의 .vma 파일]
```

스냅샷은 **같은 디스크 위에** 존재한다. 물리 디스크가 고장 나거나, 스토리지 풀이 손상되거나, 실수로 `qm destroy`를 실행하면 스냅샷도 함께 소실된다.

백업(vzdump)은 별도의 스토리지에 독립적인 파일로 저장된다. 디스크 장애 상황에서 스냅샷은 아무 의미가 없다.

### 4.6 `qm rollback` 주의사항

롤백은 **되돌릴 수 없다.** 롤백 명령을 실행하는 순간, 스냅샷 이후에 쌓인 모든 변경(델타 레이어)이 영구 삭제된다. CMP에서 롤백 API를 호출할 때는 반드시 사용자 확인 단계를 넣어야 한다.

```bash
# 스냅샷 상태 확인 후 롤백
qm listsnapshot 201

# 롤백 전 반드시 현재 상태를 다시 한 번 확인
qm rollback 201 <스냅샷명>
# → 이후 스냅샷 시점 이후의 모든 변경 소실 (복구 불가)
```

---

## 5. 실습

### 5.1 VMID 체계 정의

| 대역    | 용도                        |
| ------- | --------------------------- |
| 100–199 | 인프라·관리용               |
| 200–299 | 개발 VM (dev-api-01 = 201)  |
| 8xxx    | 템플릿 (tpl-dev-api = 8201) |
| 9xxx    | 백업 보존 클론 (= 9201)     |

### 5.2 백업 클론 생성

VM 201의 현재 상태를 Full Clone으로 백업한다.

```bash
qm clone 201 9201 \
  --name tpl-dev-api \
  --full \
  --storage local-lvm

# 진행 출력
# create full clone of drive scsi0 (local-lvm:vm-201-disk-0)
# transferred 0.0 B of 32.0 GiB (0.00%)
# transferred 327.7 MiB of 32.0 GiB (1.00%)
# ...
# transferred 32.0 GiB of 32.0 GiB (100.00%)
```

Full Clone이므로 32GB 디스크 전체가 복사된다. 시간이 걸린다.

### 5.3 스냅샷 생성 (백업 클론 기준점 마킹)

```bash
qm snapshot 9201 snap-clean \
  --description "standard template snapshot (apt-full-upgraded)"

qm listsnapshot 9201
# └─ snap-clean 2026-04-09 ...
#       standard template snapshot (apt-full-upgraded)
```

### 5.4 스냅샷 기준점으로 템플릿 VM 생성

`snap-clean` 스냅샷 시점을 기준으로 Full Clone하여 템플릿 전용 VM을 만든다.

```bash
qm clone 9201 8201 \
  --name tpl-dev-api \
  --full \
  --storage local-lvm \
  --snapname snap-clean
```

### 5.5 템플릿으로 변환

```bash
qm template 8201
# → 디스크가 읽기 전용으로 마킹됨. 이후 Start 불가.
```

이 시점부터 VM 8201은 수정·부팅이 불가능하고, Linked Clone 또는 Full Clone의 원판으로만 기능한다.

### 5.6 최종 VM 구성

| VMID | 이름        | 역할                                               |
| ---- | ----------- | -------------------------------------------------- |
| 201  | dev-api-01  | 활성 개발 VM (Ubuntu 24.04)                        |
| 9201 | tpl-dev-api | 201의 Full Clone 백업 (`snap-clean` 스냅샷 보유)   |
| 8201 | tpl-dev-api | 9201의 `snap-clean` 기준 클론 → Template 변환 완료 |

---

## 부록: 검증 체크리스트

```bash
# 복제 완료 확인
qm list
# VMID  NAME         STATUS  MEM   BOOTDISK  PID
#  201  dev-api-01   running 1024  32.00G    ...
# 8201  tpl-dev-api  stopped 1024  32.00G    0
# 9201  tpl-dev-api  stopped 1024  32.00G    0

# 템플릿 여부 확인 (lock 필드에 "template" 표시)
qm config 8201 | grep lock
# lock: template

# 스냅샷 목록 확인
qm listsnapshot 9201

# 디스크 볼륨 확인
lvs | grep -E "201|8201|9201"

# Linked Clone 테스트 (8201 템플릿에서)
qm clone 8201 250 --name test-linked
qm start 250
# → 즉각 생성, 스토리지 사용량 확인
lvs | grep 250
# → 델타 레이어가 매우 작은 크기임을 확인
qm destroy 250 --purge
```

> **공식 문서:**

&lt;br>

> - https://pve.proxmox.com/pve-docs/pve-admin-guide.html#qm_copy_and_clone
> - https://pve.proxmox.com/pve-docs/pve-admin-guide.html#qm_snapshots
