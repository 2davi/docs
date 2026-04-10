---
title: "Proxmox VE 실습 - VM 복제/스냅샷"
date: 2026-04-08
lastmod: 2026-04-09
author: "Davi"
description: "VM 복제/스냅샷과 관련한 Proxmox 개념과 CLI 조작을 다룬다."
slug: "proxmox-vm-clone-and-snapshot"
section: "notes"
category: "linux"
tags: [proxmox, qemu, kvm, rest-api, cloud-init, guest-agent, vzdump, snapshot, clone, backup, restore, template, upid]
order: 40
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 4
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 1. VM 복제 (Clone)

### 1.1 복제 명령어

```bash
qm clone <VMID> <NEWID> [OPTIONS]
```

```bash
qm clone <VMID> <NEWID> \
  --name <이름> \         # 새 VM 이름
  --full \                # 강제로 Full Clone (템플릿에서도 Full로)
  --storage <스토리지> \  # 클론 디스크가 저장될 스토리지 지정
  --snapname <스냅샷>     # 특정 스냅샷 시점을 기준으로 클론
```

### 1.2 "복제한다는 것"이 뭐냐

VM 하나는 두 가지로 구성된다:

```markdown
① /etc/pve/qemu-server/<VM_ID>.conf      ← 메타데이터(CPU, RAM, NIC 설정 등)
② Storage Pool의 Disk Volume             ← 실제 데이터(수 GB ~ 수백 GB)
```

`qm clone`이 하는 일은 이 두 가지를 **"어떻게"** 복사하느냐의 문제이다. 그리고 "어떻게"의 답이 **Full Clone**이냐 **Linked Clone**이냐를 결정한다.

아래 도식은 그 차이를 **Storage Layer**에서 설명한다.

```markdown
[Full Clone]
────────────────────────────────────────
  원본 VM 디스크:  [Block A][Block B][Block C]...
                           ↓ 전체 복사 (수 분 소요)
  클론 VM 디스크:  [Block A δ'][Block B δ'][Block C δ']...
                   (완전히 독립된 새 볼륨)


[Linked Clone]  ← Template이 있어야만 가능
────────────────────────────────────────
  Template 디스크: [Block A][Block B][Block C]  (읽기 전용 고정)
                    ↑           ↑           ↑
                    │ 공유 참조(CoW 베이스) │
                    │                       │
           Clone-1 델타 레이어      Clone-2 델타 레이어
           (변경분만 저장)          (변경분만 저장)
           예: [Block B δ'']        예: [Block C δ'']
```

Linked Clone에서 Clone-1이 `Block B`를 수정하면:

1. 템플릿의 `Block B` 읽기
2. 자기 델타 레이어에 `Block B δ''` 복사 후 수정
3. 이후로는 템플릿 `Block B` 대신 델타의 `Block B δ''` 참조

이제 **Copy-on-Write(CoW)**를 따라 _쓰기가 일어나기 전까지는 아무것도 복사하지 않는다._

### 1.3 Full Clone vs Linked Clone

이 두 가지 방식의 차이를 정확히 이해하는 것이 중요하다.

**Full Clone:**

- 원본 VM의 디스크 데이터를 **통째로 복사**한다.
- 복제 후 원본과 완전히 독립적이다. 원본을 삭제해도 클론에 영향 없음.
- 시간과 디스크 공간을 많이 소모한다.
- 일반 VM을 복제하면 자동으로 Full Clone이 수행된다.

**Linked Clone:**

- 원본 디스크를 **읽기 전용 베이스(Base)** 로 공유하고, 클론은 변경분(Delta)만 별도 저장한다.
- **Template(템플릿)에서만 생성 가능하다.** `qm template <VMID>`로 VM을 템플릿으로 변환하면, 이후 클론 시 Linked Clone이 기본 동작이 된다.
- 생성이 거의 즉각적이고, 디스크 공간 절약이 크다.
- **대신, 원본 템플릿을 삭제할 수 없다.** 모든 Linked Clone이 제거되기 전까지 템플릿은 보존되어야 한다.
- Proxmox에서 Linked Clone은 **LVM-thin 또는 ZFS 스토리지에서만** 지원된다. (`local-lvm`은 LVM-thin 기반이라 사용 가능.)

| 항목          | Linked Clone                                        | Full Clone                      |
| ------------- | --------------------------------------------------- | ------------------------------- |
| 디스크 구조   | 템플릿 디스크를 참조(reference)                     | 템플릿 디스크를 독립 복사       |
| 생성 속도     | 매우 빠름 (메타데이터만 생성)                       | 느림 (디스크 전체 복사)         |
| 저장 용량     | 변경분(delta)만 사용                                | 전체 용량 별도 사용             |
| 템플릿 의존성 | 템플릿(920) 삭제 불가 — 참조가 끊기면 클론도 파괴됨 | 완전 독립, 템플릿 삭제해도 무관 |
| 성능          | 초기 I/O가 다소 느림 (CoW 오버헤드)                 | 템플릿과 동일한 성능            |
| 용도          | 빠른 개발 환경 스핀업, 단기 테스트 VM               | 운영 배포, 장기 운용 VM         |

> `--full` 옵션을 붙이지 않고 명령하면 기본값을 사용한다. 일반 VM은 Full Clone, 템플릿은 Linked Clone이 기본값이다.

### 1.4 CoW (Copy-on-Write) 원리

Linked Clone의 기반이 되는 개념이다. 원본 데이터를 즉시 복사하지 않고, **쓰기가 발생하는 시점에만** 해당 블록을 복사한다.

```markdown
      [Template Disk -- Readonly]
                   ↑    읽기 참조
      ┌────────────┴────────────┐
      ↓                         ↓
[Clone-A 델타]            [Clone-B 델타]
 (변경분만)                (변경분만)
```

QCOW2 포맷은 이 CoW 메커니즘을 파일 레벨에서 구현하고, ZFS와 LVM-thin은 블록 레벨에서 구현한다.

> Linked Clone을 실행하면, 뭔가 버벅이면서 Full Clone보다 느린 것 같다는 생각이 든다.

Linked Clone은 **생성은 빠르지만, 생성 직후 처음 쓰기(write)가 발생할 때마다 느려진다.** 그 이유가 CoW 메커니즘 때문이다.

```markdown
[Read]  템플릿 베이스 디스크 직접 읽기  →  빠름
[Write] 해당 블록을 클론 레이어에 복사 후 기록  →  느림 (CoW 오버헤드)
```

VM 부팅 직후에는 OS가 디스크 여러 블록에 동시에 쓰기를 시도하므로, 부팅 초반에 I/O가 집중적으로 튀는 현상이 나타난다. Full Clone은 이미 독립된 디스크라 이 오버헤드가 없는 것.
거기다 여러 Linked Clone VM이 동일한 템플릿 베이스 디스크를 동시에 읽으면 스토리지 경합(contention)까지 겹쳐서 더 버벅인다.

| 상황                                | 추천                |
| ----------------------------------- | ------------------- |
| 빠르게 찍어보고 바로 버릴 테스트 VM | Linked Clone        |
| 부팅 후 오래 운용, I/O 성능 중요    | Full Clone          |
| 동시에 여러 VM 띄워서 부하 테스트   | Full Clone          |
| 스토리지 공간이 빡빡한 홈랩 환경    | Linked Clone (단기) |

### 1.5 Template(템플릿) 개념

VM을 템플릿으로 변환하면 디스크가 읽기 전용(Read-Only)으로 마킹된다. 이 VM은 더 이상 시작(Start)할 수 없고, 오직 Clone의 "원판" 역할만 한다.

```bash
qm template <VMID>
```

한번 템플릿으로 변환하면 **되돌릴 수 없다.** 그래서 변환 전에 반드시 스냅샷이나 백업을 확보해 둬라.

### 1.6 VM 복제 실습

#### 생각 없이 복제

```bash
# dev-api VM 백업용 Full Clone
qm clone 201 999
# dev-api VM 템플릿 Full Clone
qm clone 999 920
# dev-api VM 템플릿 전환
qm template 920
```

```bash
root@kcy0122:~# qm clone 201 999
create full clone of drive scsi0 (local-lvm:vm-201-disk-0)
  WARNING: You have not turned on protection against thin pools running out of space.
  WARNING: Set activation/thin_pool_autoextend_threshold below 100 to trigger automatic extension of thin pools before they get full.
  Logical volume "vm-999-disk-0" created.
  WARNING: Sum of all thin volume sizes (96.00 GiB) exceeds the size of thin pool pve/data and the size of whole volume group (<63.50 GiB).
  Logical volume pve/vm-999-disk-0 changed.
transferred 0.0 B of 32.0 GiB (0.00%)
transferred 327.7 MiB of 32.0 GiB (1.00%)
transferred 655.4 MiB of 32.0 GiB (2.00%)
# :
transferred 31.1 GiB of 32.0 GiB (97.09%)
transferred 31.4 GiB of 32.0 GiB (98.10%)
transferred 31.7 GiB of 32.0 GiB (99.10%)
transferred 32.0 GiB of 32.0 GiB (100.00%)
transferred 32.0 GiB of 32.0 GiB (100.00%)
```

#### 생각 하고 복제

> 우선, 앞서 복제한 VM과 템플릿을 제거한다.

```bash
qm destroy 999
qm destroy 920
```

> 그리고, 백업용으로 복제할 VM을 설정한다.

```bash
qm clone 201 9201 \
  --name tpl-dev-api \
  --full \
  --storage local-lvm
```

- **9201~9299:** dev-api VM의 백업
- **8201~8299:** dev-api VM의 템플릿

첫 dev-api VM의 템플릿은 9201 VM의 스냅샷을 찍고 만들겠다.

---

## 2. 스냅샷 (Snapshot)

### 2.1 스냅샷 명령어

```bash
qm snapshot <VMID> <SNAPNAME> [--description <string>] [--vmstate <bool>]
```

### 2.1 스냅샷이란

스냅샷은 **특정 시점의 VM 상태를 캡처**하는 것이다. 디스크의 상태, 설정, 그리고 선택적으로 메모리(RAM) 상태까지 보존한다. 마치 게임에서 "세이브 포인트"를 찍는 것과 같다. 단순하게 "상태 저장"이라고 막연하게 이해하면 안 된다.

**스냅샷이 무엇을 저장하는지**를 보면:

```markdown
스냅샷  =  ① 디스크 상태 (항상)
        +  ② VM 설정(.conf 내용) (항상)
        +  ③ RAM 상태 (--vmstate 1 옵션 시에만)
```

디스크 상태는 **스냅샷 체인(Snapshot Chain)**으로 저장된다.

### 2.2 QCOW2 Snapshot Chain의 I/O 동작

QCOW2 포맷에서 스냅샷을 찍으면, 그 시점의 디스크 상태가 "동결"되고, 이후의 모든 변경은 새로운 레이어에 기록된다. 스냅샷을 여러 번 찍으면 체인이 형성된다.

```markdown
[base] ← [snap1] ← [snap2] ← [current(live)]
```

이 체인에서 `current`가 `Block X`를 읽으려 할 때의 동작:

```markdown
① current 레이어에 Block X가 있나? → 있으면 반환
②                                      없으면 snap2 레이어 확인
③                                         없으면 snap1 레이어 확인
④                                           없으면 base 레이어에서 반환
```

이다. 그래서 스냅샷을 찍으면 찍을 수록 디스크 성능이 선형적으로 떨어진다.

**성능 영향:** 체인이 길어질수록, 특정 블록을 읽을 때 여러 레이어를 거슬러 올라가야 하므로 I/O 성능이 저하된다. 체인이 4단계라는 건, **최악의 경우 읽기 I/O가 4번 발생한다는 뜻**.

> 스냅샷은 **단기 롤백 용도**로 사용하고, 작업이 끝나면 삭제하는 것이 원칙이다. 장기 보관 목적이라면 백업(vzdump)을 사용하라.

### 2.3 RAM State 포함 여부 (`--vmstate`)

`--vmstate 1`로 스냅샷을 찍으면 VM의 메모리 내용까지 저장한다.

- **RAM 포함 스냅샷:** 롤백 시 VM이 스냅샷 당시의 실행 상태 그대로 복원된다. 프로세스가 동작 중이던 상태 그대로.
- **RAM 미포함 스냅샷:** 롤백 시 디스크 상태만 복원되고, VM은 정지(Stopped) 상태가 된다. 마치 전원이 갑자기 꺼졌다 켜진 것과 유사.

RAM 포함 스냅샷은 스냅샷 크기가 메모리 용량만큼 커지고, 생성 시간도 더 걸린다.

| 항목        | vmstate 미포함     | vmstate 포함                    |
| ----------- | ------------------ | ------------------------------- |
| 스냅샷 크기 | 디스크 변경분      | 디스크 변경분 + RAM 용량        |
| 생성 시간   | 짧음               | 길어짐 (RAM Dump 시간 추가)     |
| 롤백 결과   | VM 정지 상태       | 스냅샷 시점 실행 상태 그대로    |
| 적합한 상황 | 패치 전 체크포인트 | 특정 실행 상태 보존이 필요할 때 |

> `--vmstate`는 DB가 떠 있는 상태, 특정 트랜젝션 처리 중 상태를 보존해야 할 때 유용하다.
> 하지만 운영 환경 VM에 RAM 16GB 잡혀 있으면 스냅샷 하나에 16GB+를 물리는 격이다.
> 함부로 쓰면 스토리지를 통째로 날리는 격.

### 2.4 스냅샷 관련 명령어

```bash
# 1. 스냅샷 생성 (작업 전)
qm snapshot <VMID> <SNAPNAME> --description "업데이트 전 백업"

# 2. 현재 스냅샷 목록 확인
qm listsnapshot <VMID>

# 3-A. 작업 성공 → 스냅샷 불필요, 삭제
qm delsnapshot <VMID> <SNAPNAME>

# 3-B. 작업 실패 → 롤백 (현재 상태는 유실됨, 복구 불가)
qm rollback <VMID> <SNAPNAME>
```

> **`qm rollback` 전에 진짜로 다시 한 번 더 생각하자.** 롤백하는 순간, 스냅샷 이후에 쌓인 모든 변경(δ 레이어)이 날아간다. CMP에서 롤백 API 호출할 때 반드시 확인 단계를 넣어야 한다.

### 2.5 스냅샷은 백업이 아니다

```markdown
스냅샷: [물리 디스크 A] 위에 [base] + [snap1] + [snap2] 전부 존재
백업  : [물리 디스크 A] → vzdump → [스토리지 B의 .vma 파일]
```

이것아 반드시 기억해야 할 원칙이다. 스냅샷은 **같은 디스크 위에** 존재한다. 디스크가 물리적으로 고장 나면 스냅샷도 함께 소실된다. 반면 백업(vzdump)은 별도의 스토리지에 독립적인 파일로 저장된다.

> 디스크 장애, 스토리지 풀 corruption, 실수로 `qm destroy` 날리는 상황에서 스냅샷은 아무 의미가 없다.


### 2.6 VM 스냅샷 실습

#### VM 9201 스냅샷 저장

```bash
qm snapshot 9201 snap-clean
  --description "standard template snapshot (apt-full-upgraded)"
```

#### 스냅샷으로 템플릿 생성

```bash
# 1. 템플릿 전용 ID로 VM 복제
qm clone 9201 8201 \
  --name tpl-dev-api
  --full \
  --storage local-lvm \
  --snapname snap-clean

# 2. 템플릿 전환
qm template 8201
```

> 이 순간부터 VM 8201은 수정/부팅 불가 상태로 잠긴다. VM 8201 템플릿을 Linked Clone 또는 Full Clone으로 새 VM을 뽑아 쓸 수 있다.

---

## 최종 VM 목록

![Proxmox WebUI - clone and snapshot](./assets/20260409_001.png)

---

> **공식 문서:** https://pve.proxmox.com/pve-docs/pve-admin-guide.html#qm_copy_and_clone
> **공식 문서:** https://pve.proxmox.com/pve-docs/pve-admin-guide.html#qm_snapshots
