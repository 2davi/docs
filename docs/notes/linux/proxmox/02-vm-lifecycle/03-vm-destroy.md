---
title: "VM 삭제"
date: 2026-04-08
lastmod: 2026-04-16
author: "Davi"
description: "qm destroy의 동작 원리, 옵션별 차이, 고아 디스크 처리, TRIM과 스토리지 공간 회수, Linked Clone 삭제 시 의존성 관리까지."
slug: "vm-destroy"
section: "notes"
category: "proxmox"
tags: [proxmox, qemu, destroy, lvm-thin, trim, orphan-disk, linked-clone]
order: 3
series: "Proxmox VE 학습 시리즈"
series_order: 5
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목      | 내용                              |
| --------- | --------------------------------- |
| 선행 문서 | `02-vm-lifecycle/01-vm-create.md` |
| 실습 대상 | 실습 과정에서 생성한 테스트 VM들  |

---

## 1. VM 삭제 명령어

```bash
qm destroy <VMID> [OPTIONS]

# 주요 옵션
qm destroy <VMID> \
  --destroy-unreferenced-disks <0|1> \  # 고아 디스크 처리
  --purge                             \  # 연관 작업(백업·HA·복제) 설정 제거
  --skiplock                             # 락(Lock) 무시하고 강제 삭제
```

---

## 2. `qm destroy`가 하는 일

`qm destroy`를 실행하면 다음 순서로 진행된다:

1. **VM 정지 확인:** 실행 중인 VM에 `qm destroy`를 실행하면 에러를 반환한다. 먼저 `qm stop <VMID>`로 정지해야 한다. (`--skiplock` 없이는)
2. **`.conf` 파일 삭제:** `/etc/pve/qemu-server/<VMID>.conf` 제거
3. **참조된 디스크 볼륨 삭제:** `.conf`에 명시된 `scsi0`, `virtio0`, `ide0` 등 모든 디스크 LV(또는 ZFS dataset) 제거
4. **방화벽 규칙 제거:** `Datacenter → Firewall`에 해당 VM ID로 등록된 규칙 제거
5. **권한(Permission) 정리:** 해당 VMID에 부여된 ACL 항목 제거

---

## 3. 옵션 상세

### 3.1 `--destroy-unreferenced-disks`

기본값은 `0`(비활성). 이 옵션을 `1`로 설정하면 `.conf`에 현재 참조되지 않지만 **VMID가 일치하는 모든 LV**를 스토리지에서 찾아 함께 삭제한다.

**고아 디스크(Orphan Disk)가 생기는 원인:**

```bash
# 예시: scsi0을 detach하면 .conf에서 scsi0 항목이 사라지지만
# 스토리지 풀의 LV는 "unused0"으로 .conf에 남거나, 완전히 분리되어 LV만 남는다
qm set 102 --delete scsi0
```

실수로 VM을 여러 번 생성·삭제하는 과정에서 이전 LV가 남는 경우도 있다. `--destroy-unreferenced-disks 1`을 쓰면 이런 잔여물도 함께 정리된다.

```bash
# 현재 특정 VMID의 모든 LV 확인 (고아 포함)
lvs | grep vm-102
#   vm-102-disk-0 pve Vwi-a-tz--  32.00g data   ← .conf에서 참조 중
#   vm-102-disk-1 pve Vwi-------  32.00g         ← 고아 (미참조)
#   vm-102-disk-2 pve Vwi-------  32.00g         ← 고아 (미참조)

# 고아까지 포함하여 삭제
qm destroy 102 --destroy-unreferenced-disks 1
```

### 3.2 `--purge`

`--purge`를 사용하지 않으면 VM의 `.conf`와 디스크만 삭제된다. 하지만 다음 설정들은 별도 데이터베이스에 저장되어 있어 그대로 남는다:

| 설정           | 위치                        | 문제                                            |
| -------------- | --------------------------- | ----------------------------------------------- |
| 백업 작업(Job) | `Datacenter → Backup`       | 존재하지 않는 VM에 백업을 시도하며 에러 발생    |
| 복제 작업(Job) | `pvesr` 복제 스케줄         | `pvesr status`에 실패한 작업이 계속 표시됨      |
| HA 설정        | `/etc/pve/ha/resources.cfg` | HA Manager가 존재하지 않는 VM을 관리하려다 충돌 |

운영 환경에서 VM을 삭제할 때는 **반드시 `--purge`를 함께 사용**하는 것이 원칙이다.

```bash
qm destroy <VMID> --purge
```

CMP에서 VM 삭제 API를 구현할 때, `purge=1` 파라미터를 기본값으로 포함할지 여부는 운영 정책에 따라 결정해야 한다. 삭제 후 백업 기록 등을 유지하려는 감사(Audit) 목적이 있다면 `purge=0`이 맞다.

### 3.3 `--skiplock`

HA 마이그레이션 중이거나 백업 중인 VM은 `locked` 상태가 된다. 이 상태에서 `qm destroy`를 실행하면 에러를 반환한다.

```log
VM is locked (migrate)
VM is locked (backup)
```

`--skiplock`은 이 락을 무시하고 강제 삭제한다. 락은 작업 중간에 VM을 건드리는 것을 방지하기 위한 보호 장치이므로, `--skiplock`은 **작업이 이미 중단되었음을 확인한 뒤**에 사용해야 한다. 마이그레이션이 진행 중인 VM에 skiplock을 쓰면 데이터 손상으로 이어질 수 있다.

---

## 4. 스토리지 공간 회수 — TRIM과 LVM-thin

### 4.1 삭제해도 공간이 안 줄어드는 현상

LVM-thin 스토리지에서 VM을 삭제했는데 `lvs`로 확인한 `pve/data` pool의 `Data%`가 줄어들지 않는 경우가 있다. 이것은 버그가 아니다.

LVM-thin은 씬 프로비저닝 방식으로 동작한다. LV(VM 디스크)를 삭제하면 pool에서 해당 LV의 익스텐트(Extent) 할당을 해제한다. 그런데 pool 내부에서 어떤 블록이 "실제 데이터가 있는" 블록인지, "삭제되었지만 pool이 아직 모르는" 블록인지를 식별하려면 **TRIM(Discard) 정보**가 필요하다.

게스트 OS가 파일을 삭제해도, 그 사실이 스토리지 레이어까지 전달되지 않으면 pool은 그 블록을 여전히 "사용 중"으로 본다.

### 4.2 TRIM 전달 경로

TRIM이 게스트 OS에서 물리 스토리지까지 전달되려면 다음 경로가 모두 열려있어야 한다:

```markdown
게스트 OS (fstrim)
    ↓
SCSI Discard 명령
    ↓
QEMU virtio-scsi (discard=on 옵션 필요)
    ↓
LVM-thin pool (블록 해제)
```

`--scsi0 local-lvm:32,discard=on`으로 디스크를 생성한 경우, 게스트에서 `fstrim /`를 실행하면 삭제된 블록이 pool로 반환된다.

`--agent enabled=1,fstrim_cloned_disks=1` 설정은 클론 직후 첫 부팅 시 QEMU Guest Agent를 통해 자동으로 `fstrim`을 실행한다.

### 4.3 VM 삭제 후 pool 공간 수동 확인

```bash
# VM 삭제 전
lvs -o lv_name,lv_size,pool_lv,data_percent pve/data
# pve/data 100.00g   (사용: 35%)

qm destroy 250 --purge

# VM 삭제 후 즉시
lvs -o lv_name,lv_size,pool_lv,data_percent pve/data
# pve/data 100.00g   (사용: 35%)  ← 아직 반영 안 됨

# 수동 TRIM 트리거 (pool에 남은 zero 블록 반환)
fstrim -v /
# → pool 공간 반환 확인
lvs -o lv_name,lv_size,pool_lv,data_percent pve/data
# pve/data 100.00g   (사용: 22%)  ← 반영됨
```

---

## 5. Linked Clone 삭제 시 의존성

Linked Clone은 Template 디스크를 CoW 베이스로 공유한다. 이 의존 관계 때문에 삭제 순서에 규칙이 있다.

### 5.1 Template 삭제 불가 조건

Template에서 파생된 Linked Clone이 하나라도 존재하면, Template의 디스크는 삭제할 수 없다.

```bash
qm destroy 8201   # Template
# ERROR: can't remove base volume -- there are .../vm-8201-disk-0 snapshots
```

Linked Clone이 모두 삭제된 후에야 Template 삭제가 가능하다.

### 5.2 올바른 삭제 순서

```markdown
① 모든 Linked Clone 삭제 (qm destroy --purge)
② Template 삭제 (qm destroy --purge)
③ 백업 클론 삭제 또는 보존 결정 (9201)
```

### 5.3 의존 관계 확인

현재 어떤 VM이 특정 LV를 베이스로 참조하고 있는지 확인하는 방법:

```bash
# 모든 .conf에서 특정 LV를 참조하는 VM 찾기
grep -r "vm-8201-disk-0" /etc/pve/qemu-server/
# → 참조하는 VM의 .conf 파일명(=VMID)이 출력됨
```

---

## 6. 실습

### 6.1 테스트 VM 정리

실습 과정에서 생성한 VM 목록 확인:

```bash
ls -l /etc/pve/qemu-server/
# -rw-r----- 1 root www-data 148 Apr  7 100.conf   ← 빈 껍데기
# -rw-r----- 1 root www-data 402 Apr  8 101.conf   ← 시행착오 VM
# -rw-r----- 1 root www-data 429 Apr  8 102.conf   ← 시행착오 VM
# -rw-r----- 1 root www-data 271 Apr  8 998.conf   ← 디스크 테스트 VM
# -rw-r----- 1 root www-data 272 Apr  8 999.conf   ← 깡통 테스트 VM
```

불필요한 VM 삭제:

```bash
qm destroy 101
# Logical volume "vm-101-disk-0" successfully removed.

qm destroy 998
# Logical volume "vm-998-disk-0" successfully removed.

qm destroy 999
# Logical volume "vm-999-disk-0" successfully removed.
```

### 6.2 고아 디스크 정리

VM 102를 반복 생성·삭제하면서 고아 LV가 남아있는지 확인:

```bash
lvs | grep 102
#   vm-102-disk-0 pve Vwi-a-tz--  32.00g data   ← 현재 .conf 참조 중
#   vm-102-disk-1 pve Vwi-------  32.00g         ← 고아
#   vm-102-disk-2 pve Vwi-------  32.00g         ← 고아
```

고아 LV를 수동 제거 후 VM 삭제:

```bash
lvremove /dev/pve/vm-102-disk-1
lvremove /dev/pve/vm-102-disk-2
qm destroy 102
```

또는 `--destroy-unreferenced-disks 1`로 한 번에 처리:

```bash
qm destroy 102 --destroy-unreferenced-disks 1
```

### 6.3 삭제 후 최종 상태 확인

```bash
ls /etc/pve/qemu-server/
# 100.conf   ← 빈 껍데기 (실습 용도로 보존)
# 201.conf   ← dev-api-01 (활성)
# 8201.conf  ← tpl-dev-api (Template)
# 9201.conf  ← tpl-dev-api (백업 클론)

lvs | grep -E "201|8201|9201"
#   vm-201-disk-0  pve Vwi-a-tz--  32.00g data   ← 실행 중
#   vm-8201-disk-0 pve Vri-a-tz--  32.00g data   ← 읽기 전용 (Template)
#   vm-9201-disk-0 pve Vwi-a-tz--  32.00g data   ← 백업 클론
```

---

## 부록: CMP 설계 시 삭제 API 구현 체크리스트

Proxmox REST API로 VM 삭제를 구현할 때 반드시 처리해야 할 사항:

| 항목                              | 처리 방법                                                |
| --------------------------------- | -------------------------------------------------------- |
| 실행 중인 VM 삭제 시도            | `qm stop` 후 `qm destroy`, 또는 사용자에게 경고          |
| Linked Clone이 있는 Template 삭제 | 의존 VM 목록 먼저 조회하여 사용자에게 표시               |
| 삭제 전 확인 단계                 | 사용자 확인(Confirmation) 없이 `DELETE` 직접 호출 금지   |
| `--purge` 적용 여부               | 운영 정책에 따라 기본값 결정 (감사 목적이면 `purge=0`)   |
| `locked` 상태 VM                  | 에러 메시지를 사용자에게 전달하고 `--skiplock` 사용 제한 |
| VMID 재사용 방지                  | 삭제 후 일정 기간(쿨다운) 동안 동일 VMID 할당 차단 권장  |

> **공식 CLI 레퍼런스:** https://pve.proxmox.com/pve-docs/qm.1.html
