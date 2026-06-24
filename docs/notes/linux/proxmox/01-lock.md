---
title: "VM Lock 푸는 과정"
date: 2026-06-24
lastmod: 2026-06-24
author: "Davi"
description: ""
slug: "unlock"
section: "notes"
category: "proxmox"
tags: []
order: 1
series: "Proxmox"
series_order: 1
status: "active"
draft: false
search: true
toc: true
difficulty: beginner
version: "Proxmox VE 9.1"
---

종종 Lock이 걸려서 VM으로 원하는 명령을 전달하지 못할 때가 있다.

**1. .conf 파일에서 무슨 lock인지 확인:**

```bash
qm config VM_ID | grep lock

# VM_ID: lock 여부 확인하려는 VM의 ID
```

migrate lock이라면 쉽게 건들지 말자.

**2. lock을 건 작업(프로세스)이 죽었는지 확인:**

```bash
ps aux | grep -E "vzdump|qm|qemu" | grep VM_ID
pvesh get /nodes/ND_NM/qemu/VM_ID/status/current

# VM_ID: lock 여부 확인하려는 VM의 ID
# ND_NM: 해당 VM이 올라타있는 노드의 이름(hostname)
```

**3. 정석적인 방법으로 lock 해제:**

```bash
qm unlock VM_ID

# VM_ID: lock 여부 확인하려는 VM의 ID
```

**만약 .conf 파일에 lock 필드가 없다면:**

```bash
lsof /run/lock/qemu-server/lock-VM_ID.conf
fuser -v /run/lock/qemu-server/lock-VM_ID.conf

# 아무것도 안 나오면...
rm /run/lock/qemu-server/lock-VM_ID.conf

# 잡고 있는 프로세스가 존재하면...
# 그냥 알아서 죽을 때까지 기다리든가, 프로세스 kill을 하든가.
# 이 경우는 난 다룰 줄 모른다.

# VM_ID: lock 여부 확인하려는 VM의 ID
```

## 발생 상황: VM 삭제 시도 중 lock

클러스터의 스토리지 연결 상태(RBD, Ceph와 같은) 불량인 환경에서, `--destroy-unreferenced-disks` 옵션을 활성화한 채 삭제 시도를 하면 스토리지 전부 읽으려들다가 세월 네월 걸린다.

**VM > Hardwares 패널에서 디스크 관련된 모든 항목을 분리 후 삭제,**<br/>
VM 삭제 시 `--destroy-unreferenced-disks` 항목을 비활성화한 채 삭제 시도.

삭제 끝나면, 디스크가 위치했던 스토리지에서 혹여 남아있지 않은지 마지막 체크.
