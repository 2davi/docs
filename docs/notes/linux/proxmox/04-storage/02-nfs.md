---
title: "NFS 공유 스토리지"
date: 2026-04-14
lastmod: 2026-04-16
author: "Davi"
description: "NFS가 Proxmox 멀티 노드 환경에서 공유 스토리지로 동작하는 원리, Stale NFS Handle 원인 진단, systemd Drop-In으로 pvestatd 의존성 주입하여 재발 방지까지."
slug: "nfs"
section: "notes"
category: "proxmox/storage"
tags: [proxmox, nfs, storage, pvestatd, systemd, stale-handle, mount, troubleshooting, drop-in]
order: 2
series: "Proxmox VE 학습 시리즈"
series_order: 11
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

```markdown
[Cluster] Proxmox VE 9.1 — 3 Nodes
  ├─ pve        10.10.250.115  (NFS 클라이언트)
  ├─ pve-ksy    10.10.250.117  (NFS 서버 겸 클라이언트)
  └─ kcy0122    10.10.250.119  (NFS 클라이언트)

[Storage]
  └─ shared (nfs) — pve-ksy:/mnt/nfs_shared
       클라이언트: pve, kcy0122 두 노드
```

---

## 1. NFS가 Proxmox 공유 스토리지로 동작하는 방식

### 1.1 왜 공유 스토리지가 필요한가

VM 디스크가 특정 노드의 로컬 스토리지(`local-lvm`, `local-zfs`)에만 있다면, 그 노드가 다운됐을 때 다른 노드에서 VM을 기동할 방법이 없다. HA(High Availability) 페일오버와 Live Migration이 제대로 동작하려면 **모든 노드가 동일한 스토리지에 접근**할 수 있어야 한다.

NFS는 이 요구를 네트워크 파일시스템 방식으로 충족한다. NFS 서버가 특정 디렉터리를 네트워크로 공개하면, 클라이언트 노드들이 이것을 마운트하여 로컬 경로처럼 사용한다. 모든 노드가 `/mnt/pve/shared`라는 동일한 경로로 동일한 파일에 접근하게 된다.

```markdown
[pve-ksy] — NFS 서버
  /mnt/nfs_shared (실제 데이터 위치)
       ↑ exports
  10.10.250.0/24 대역에게 공개

[pve]     — NFS 클라이언트
  /mnt/pve/shared → mount → pve-ksy:/mnt/nfs_shared

[kcy0122] — NFS 클라이언트
  /mnt/pve/shared → mount → pve-ksy:/mnt/nfs_shared
```

### 1.2 NFS의 구조적 약점

NFS는 단순하고 설정이 쉽지만 결정적 약점이 있다. **가용성이 NFS 서버에 종속된다.** NFS 서버가 내려가면 클라이언트 노드의 해당 스토리지도 오프라인이 된다. 그것만으로도 충분하지 않다면 다음 문제가 생긴다.

클라이언트 노드가 NFS 서버보다 **먼저 부팅 완료**되면, 클라이언트가 NFS 마운트를 시도하는 시점에 서버가 아직 준비되지 않았다. 이 상태로 마운트를 실패하면 **Stale NFS Handle** 상태가 된다.

---

## 2. Stale NFS Handle — 원인과 증상

### 2.1 Stale NFS Handle이란

리눅스 커널은 NFS 마운트 레코드를 유지한다. NFS 마운트가 시도되면 커널 레벨에서 마운트 정보가 등록되는데, 이후 NFS 서버와의 실제 세션이 사라지더라도 마운트 레코드 자체는 남아있을 수 있다.

이 상태에서 해당 마운트 포인트 경로에 접근하면(`ls`, `cat`, `open` 등), 커널은 마운트 레코드가 있다고 판단하여 NFS 서버에 요청을 시도하지만, 실제 세션이 없으므로 무한 대기 상태(Hang)가 된다.

```bash
# Stale NFS Handle 증상 — kcy0122에서
ls -la /mnt/pve/
^C   # 응답 없음 — Ctrl+C로 강제 종료 필요
```

반면 정상 마운트된 노드에서는:

```bash
# pve에서
ls -la /mnt/pve/
# drwxrwxrwx 8 root root 4096 Apr  9 15:18 shared   ← 즉시 응답
```

### 2.2 발생 경로

이번 실습 환경에서의 실제 발생 경로:

```markdown
pve-ksy 노드가 재부팅됨 (nfs-server 시작 시각: 15:12)
    │
    ↓ 클라이언트 노드(kcy0122)는 이미 부팅 완료 상태
    │
    ↓ pvestatd가 shared 스토리지를 활성화하려 함
    │
    ↓ pvestatd가 NFS 마운트 시도 → pve-ksy 아직 NFS 준비 안 됨
    │
    ↓ 마운트 실패 → 커널에 Stale 마운트 레코드만 남음
    │
    ↓ /mnt/pve/shared 경로의 모든 syscall이 무한 대기 상태로 굳음
```

```markdown
pvescheduler 에러 로그 (Stale 상태의 후유증):
  Apr 16 16:39:21 pvescheduler[1552]: ERROR: Backup of VM 201 failed
                                       - unable to find VM '201'
```

VM 201이 다른 노드에 있거나, Stale NFS Handle 때문에 스토리지가 비활성화된 상태에서 백업 스케줄러가 동작하지 못한 케이스다.

---

## 3. 즉시 조치 — 수동 재마운트

<DocEmbed
  src="notes/linux/proxmox/06-references/07-troubleshooting.md"
  anchor="nfs-shared-storage-마운트-실패"
  title="Stale NFS Handle 즉시 조치 — 수동 재마운트"
/>

---

## 4. 재발 방지 — systemd Drop-In 의존성 주입

<DocEmbed
  src="notes/linux/proxmox/06-references/07-troubleshooting.md"
  anchor="### NFS 마운트 재발 방지 — systemd Drop-In 구성"
  title="NFS 마운트 재발 방지 — systemd Drop-In 구성"
/>

---

## 5. 검증

### 5.1 즉시 실행 테스트

```bash
systemctl start remount-nfs-shared.service
systemctl status remount-nfs-shared.service

# ● remount-nfs-shared.service - Ensure NFS shared storage is mounted before pvestatd
#      Active: active (exited) since Tue 2026-04-14 16:07:58 KST; 1s ago
#     Process: 40371 ExecStart=/usr/local/bin/nfs-shared-mount.sh (code=exited, status=0/SUCCESS)
#
# Apr 14 16:07:56 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] Waiting for NFS server 10.10.250.117...
# Apr 14 16:07:56 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] NFS server reachable (attempt 1)
# Apr 14 16:07:56 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] Stale mount detected. Lazy unmounting...
# Apr 14 16:07:57 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] Mounting 10.10.250.117:/mnt/nfs_shared -> /mnt/pve/shared
# Apr 14 16:07:58 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] Mount successful.
```

### 5.2 재부팅 후 검증

`pve-ksy` 재부팅 후 클라이언트 노드에서 자동 복구 확인:

```bash
pvesm status | grep shared
# shared   nfs   active   ...   ← active가 출력되면 정상
```

---

## 6. NFS 운영 진단 명령어

```bash
# NFS 서버에서
systemctl status nfs-server
exportfs -v                          # 공개 중인 Export 목록

# 클라이언트에서
showmount -e <NFS서버IP>             # NFS 서버 Export 목록 조회
mount | grep nfs                     # 현재 마운트된 NFS 확인
mountpoint -q /mnt/pve/shared && echo "mounted" || echo "not mounted"

# Proxmox 스토리지 상태
pvesm status

# systemd 서비스 상태
systemctl status remount-nfs-shared.service
journalctl -u remount-nfs-shared.service -n 30

# pvestatd Drop-In 확인
systemctl cat pvestatd.service       # 하단에 nfs-shared.conf 섹션 확인
```

---

## 부록: 사례 요약

| 구분          | 내용                                                                                 |
| ------------- | ------------------------------------------------------------------------------------ |
| **증상**      | `unable to activate storage 'shared'` — 마운트 포인트 접근 불가 (Hang)               |
| **원인**      | `pve-ksy` 재부팅 → 클라이언트 `pvestatd`의 NFS 마운트 타이밍 실패 → Stale NFS Handle |
| **즉시 조치** | `umount -l` → `mount -t nfs` 수동 재마운트                                           |
| **재발 방지** | `remount-nfs-shared.service` + `pvestatd` Drop-In으로 부팅 순서 강제                 |
| **적용 노드** | NFS 클라이언트 노드 모두 (`pve`, `kcy0122`)                                          |
