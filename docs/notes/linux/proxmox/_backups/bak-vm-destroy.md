---
title: "Proxmox VE 실습 - VM 삭제"
date: 2026-04-08
lastmod: 2026-04-08
author: "Davi"
description: "VM 삭제와 관련한 Proxmox 개념과 CLI 조작을 다룬다."
slug: "proxmox-vm-destroy"
#section: "notes"
category: "etc."
tags: [proxmox, qemu, kvm, rest-api, cloud-init, guest-agent, vzdump, snapshot, clone, backup, restore, template, upid]
order: 30
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 3
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
embed_only: true
---

## 환경 정보

| 항목            | 내용                                |
| --------------- | ----------------------------------- |
| Proxmox VE      | 9.1-1 (Debian Bookworm 기반)        |
| 선행 문서       | `02-proxmox-vm-create-and-setup.md` |
| 관리 인터페이스 | `https://127.0.0.1:8006`            |
| 노드명          | kcy0122                             |

> 이 문서는 `02-proxmox-vm-create-and-setup.md`에서 초기 설정이 완료된 상태를 전제로 한다.

---

## 1. VM 삭제 (Destroy)

```bash
qm destroy <VMID> [--destroy-unreferenced-disks <bool>] [--purge] [--skiplock]
```

### 1.1 무엇이 삭제되는가

`qm destroy`는 다음을 수행한다.

1. VM 설정 파일(`/etc/pve/qemu-server/<VMID>.conf`) 제거
2. 설정에 참조된 모든 디스크 볼륨(Volume) 삭제
3. VM 관련 방화벽 규칙 및 권한(Permission) 제거

### 1.2 주의할 옵션

`--destroy-unreferenced-disks` (기본값 `0`): 이 옵션을 `1`로 설정하면, `.conf` 파일에 참조되지 않지만 VMID가 일치하는 디스크도 전부 삭제한다. 예를 들어 `qm set`으로 디스크를 떼어낸(detach) 뒤 `.conf`에서는 사라졌지만 스토리지 풀(Storage Pool)에는 남아 있는 "고아(Orphan) 디스크"를 정리할 때 사용한다.

`--purge`: 백업 작업(Backup Job), 복제 작업(Replication Job), HA 설정 등에서도 해당 VMID를 제거한다. 운영 환경에서는 이 옵션 없이 삭제하면 스케줄러(Scheduler)가 존재하지 않는 VM을 백업하려다 에러를 뱉는 상황이 생긴다.

### 1.3 스토리지 풀 공간 회수

LVM-thin이나 ZFS 같은 씬 프로비저닝(Thin Provisioning) 스토리지에서는 VM을 삭제해도 **즉시 물리 공간이 반환되지 않을 수 있다.** 이는 Copy-on-Write 구조 때문이다. `fstrim`(Guest 내부) 또는 스토리지 레벨의 트림(Trim) 작업이 필요할 수 있다.

> **공식 CLI 레퍼런스:** https://pve.proxmox.com/pve-docs/qm.1.html

## 2. VM 삭제 실습

이전 문서에서 생성한 VM을 확인한다.

```bash
root@kcy0122:/etc/pve/qemu-server# ls -l
total 3
-rw-r----- 1 root www-data 148 Apr  7 17:00 100.conf
-rw-r----- 1 root www-data 402 Apr  8 11:46 101.conf
-rw-r----- 1 root www-data 429 Apr  8 10:43 102.conf
-rw-r----- 1 root www-data 271 Apr  8 10:16 998.conf
-rw-r----- 1 root www-data 272 Apr  8 10:06 999.conf
```

> 삭제 명령어 입력

```bash
root@kcy0122:/etc/pve/qemu-server# qm destroy 101
  Logical volume "vm-101-disk-0" successfully removed.
root@kcy0122:/etc/pve/qemu-server# qm destroy 998
  Logical volume "vm-998-disk-0" successfully removed.
root@kcy0122:/etc/pve/qemu-server# qm destroy 999
  Logical volume "vm-999-disk-0" successfully removed.
```

> 결과

```bash
root@kcy0122:/etc/pve/qemu-server# ls -l
total 1
-rw-r----- 1 root www-data 148 Apr  7 17:00 100.conf
-rw-r----- 1 root www-data 429 Apr  8 10:43 102.conf
```
