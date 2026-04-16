---
title: "Proxmox VE 트러블슈팅 - NFS Shared Storage 마운트 실패"
date: 2026-04-14
lastmod: 2026-04-14
author: "Davi"
description: "재부팅 후 NFS Shared Storage 활성화 실패 원인 진단 및 systemd 기반 재발 방지 조치."
slug: "proxmox-nfs-shared-storage-troubleshooting"
section: "notes"
category: "linux"
tags: [proxmox, nfs, systemd, storage, troubleshooting, stale-handle, pvestatd, mount]
order: 120
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 12
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 개요

```markdown
[Host]      Windows 11 (Layer 1)
[Hypervisor] VirtualBox - Network Bridge Adapter
[Cluster]   Proxmox VE 9.1 (Layer 2)
  ├─ pve        10.10.250.115  (NFS 클라이언트)
  ├─ pve-ksy    10.10.250.117  (NFS 서버 & 클라이언트)
  └─ kcy0122    10.10.250.119  (NFS 클라이언트)

[Storage]
  ├─ local        (dir)
  ├─ local-lvm    (lvm-thin)
  ├─ local-zfs    (zfs)       ← VM 301 HA + Replication 5분 주기
  └─ shared       (nfs)       ← 이 문서의 대상: pve-ksy:/mnt/nfs_shared
```

`shared` 스토리지는 `pve-ksy`(.117)가 NFS 서버 역할을 하며,
나머지 두 노드(`pve`, `kcy0122`)가 클라이언트로 마운트(Mount)하는 구성이다.

---

## 문제 현상

Proxmox 웹 UI 및 CLI에서 `shared` 스토리지 활성화 실패.

```log
unable to activate storage 'shared' - directory '/mnt/pve/shared' does not exist or is unreachable
```

스토리지 인식 자체는 정상(`/etc/pve/storage.cfg` 항목 존재).
마운트 포인트(Mount Point) 레벨에서의 실패임을 에러 메시지가 명시하고 있다.

---

## 원인 분석

### Step 1 — NFS 서버(`pve-ksy`) 상태 확인

```bash
root@pve-ksy:~# systemctl status nfs-server
● nfs-server.service - NFS server and services
     Active: active (exited) since Tue 2026-04-14 15:12:14 KST; 40min ago
    Process: 1089 ExecStartPre=/usr/sbin/exportfs -r (code=exited, status=0/SUCCESS)
    ...
Apr 14 15:12:13 pve-ksy sh[1103]: nfsdctl: lockd configuration failure
```

서비스 자체는 `active`. 단, `lockd configuration failure` 경고가 출력되었다.

> **`lockd` 경고에 대해:** NFS 파일 잠금(File Lock) 데몬인 `lockd`가
> 중첩 가상화(Nested Virtualization) 환경의 커널 제약으로 초기화에 실패한 것.
> NLM(Network Lock Manager) 기반 잠금이 비정상 동작할 수 있으나,
> 단순 스토리지 마운트 용도에서는 즉각적인 장애 원인이 아니다.

```bash
root@pve-ksy:~# exportfs -v
/mnt/nfs_shared  10.10.250.0/24(sync,wdelay,hide,no_subtree_check,sec=sys,rw,secure,no_root_squash,no_all_squash)
```

Export 목록 정상. 클라이언트 대역(`10.10.250.0/24`) 권한도 올바르다.

```bash
root@kcy0122:~# showmount -e 10.10.250.117
Export list for 10.10.250.117:
/mnt/nfs_shared 10.10.250.0/24
```

클라이언트 노드에서도 NFS 서버 Export 목록이 정상 조회됨.
**네트워크 레이어 문제 아님.**

---

### Step 2 — 클라이언트 노드 마운트 상태 확인

```bash
# pve (.115) - 정상
root@pve:~# mount | grep shared
10.10.250.117:/mnt/nfs_shared on /mnt/pve/shared type nfs4 (rw,...)

root@pve:~# ls -la /mnt/pve/
drwxrwxrwx 8 root root 4096 Apr  9 15:18 shared   # 정상 접근

# kcy0122 (.119) - 비정상
root@kcy0122:~# ls -la /mnt/pve/
^C   # 응답 없음 - 강제 종료 필요
```

`kcy0122`에서 `/mnt/pve/` 접근 시 무한 대기(Hang) 발생.
이것이 **Stale NFS Handle** 상태의 전형적인 증상이다.

---

### 근본 원인

`nfs-server.service` 시작 시각이 **당일 15:12**임을 통해 `pve-ksy`가 재부팅됐음을 확인.

```markdown
Proxmox 클러스터 부팅 순서 문제:

  [클라이언트 노드 부팅 완료]
          ↓ pvestatd 시작
          ↓ NFS 마운트 시도
          ↓ pve-ksy 아직 부팅 중 → 마운트 실패
          ↓ 마운트 레코드만 남고 실제 세션 없음
          ↓ Stale NFS Handle 상태로 굳음
```

커널은 마운트 레코드가 존재한다고 판단하지만,
실제 NFS 서버와의 세션이 없어 해당 경로에 대한 모든 syscall이 무한 대기 상태가 된다.

---

## 즉시 조치

### `pve` (.115)

`pve`는 마운트가 이미 정상 연결 상태였으므로 별도 조치 불필요.

```bash
root@pve:~# pvesm status | grep shared
shared   nfs   active   151720960   84142080   61022208   55.46%
# 정상 확인
```

### `kcy0122` (.119)

Stale 마운트 강제 해제 후 재마운트.

```bash
# 1. pvestatd 재시작 (Proxmox 스토리지 활성화 재시도)
systemctl restart pvestatd

# 2. Stale 마운트 강제 해제
#    -l (lazy): 파일시스템 네임스페이스에서 즉시 분리,
#               실제 해제는 참조가 모두 사라질 때까지 지연.
#               일반 umount는 Stale 상태에서 동작하지 않음.
umount -l /mnt/pve/shared

# 3. 마운트 포인트 보장
mkdir -p /mnt/pve/shared

# 4. 수동 재마운트
mount -t nfs 10.10.250.117:/mnt/nfs_shared /mnt/pve/shared
```

```bash
root@kcy0122:~# pvesm status
Name         Type     Status     Total (KiB)    Used (KiB) Available (KiB)     %
local         dir     active       27098068      16910968        8785244   62.41%
local-lvm lvmthin     active       30707712       1547668       29160043    5.04%
local-zfs zfspool     active      101089280       7459308       93629972    7.38%
shared        nfs     active      151720960      84142080       61022208   55.46%
# shared → active 복구 확인
```

---

## 재발 방지 — `systemd` 마운트 보장 서비스

### 설계 목표

```markdown
[Before] network-online → pvestatd → NFS 마운트 시도 (서버 미준비 시 실패)
[After]  network-online → NFS 가용성 확인 → pvestatd (마운트 보장 후 시작)
```

Proxmox는 `pvestatd`가 Storage를 관리하므로 `/etc/fstab` 직접 수정은 권장하지 않는다.
`pvestatd.service`의 Drop-In(`.conf`) 방식으로 의존성을 주입하여
Proxmox 업데이트 시에도 설정이 유실되지 않도록 한다.

---

### 파일 1 — `/usr/local/bin/nfs-shared-mount.sh`

```bash
#!/bin/bash
# NFS shared storage remount script for Proxmox
# Executed by remount-nfs-shared.service before pvestatd starts.
# Waits for NFS server to become reachable, then forces a clean mount.

NFS_SERVER="10.10.250.117"
NFS_EXPORT="/mnt/nfs_shared"
MOUNT_POINT="/mnt/pve/shared"
MAX_RETRY=12        # 12회 × 5초 = 최대 60초 대기
RETRY_INTERVAL=5

echo "[nfs-shared-mount] Waiting for NFS server ${NFS_SERVER}..."

# ── 1. NFS 서버 응답 대기 ──────────────────────────────────────────────────────
# showmount 는 NFS server 가 export 목록을 응답할 수 있는 상태인지 검증한다.
# 단순 ping 이 아니라 rpcbind(111) + mountd 까지 확인하는 것이 핵심.
for i in $(seq 1 $MAX_RETRY); do
    if showmount -e "$NFS_SERVER" &>/dev/null; then
        echo "[nfs-shared-mount] NFS server reachable (attempt ${i})"
        break
    fi
    echo "[nfs-shared-mount] Not reachable, retry ${i}/${MAX_RETRY}..."
    sleep $RETRY_INTERVAL

    if [ "$i" -eq "$MAX_RETRY" ]; then
        echo "[nfs-shared-mount] ERROR: NFS server unreachable after ${MAX_RETRY} attempts. Aborting."
        exit 1
    fi
done

# ── 2. Stale 마운트 해제 ───────────────────────────────────────────────────────
# mountpoint -q 로 현재 마운트 여부 확인.
# 마운트가 걸려있으면 lazy unmount(-l) 로 강제 해제한다.
if mountpoint -q "$MOUNT_POINT"; then
    echo "[nfs-shared-mount] Stale mount detected. Lazy unmounting..."
    umount -l "$MOUNT_POINT"
    sleep 1
fi

# ── 3. 마운트 포인트 디렉터리 보장 ────────────────────────────────────────────
mkdir -p "$MOUNT_POINT"

# ── 4. NFS 마운트 ─────────────────────────────────────────────────────────────
echo "[nfs-shared-mount] Mounting ${NFS_SERVER}:${NFS_EXPORT} -> ${MOUNT_POINT}"
if mount -t nfs "${NFS_SERVER}:${NFS_EXPORT}" "$MOUNT_POINT"; then
    echo "[nfs-shared-mount] Mount successful."
    exit 0
else
    echo "[nfs-shared-mount] ERROR: mount failed."
    exit 1
fi
```

---

### 파일 2 — `/etc/systemd/system/remount-nfs-shared.service`

```ini
[Unit]
Description=Ensure NFS shared storage is mounted before pvestatd
# network-online.target: 단순 인터페이스 UP이 아니라 라우팅/DNS까지 준비된 상태
After=network-online.target
Wants=network-online.target

[Service]
# oneshot: 프로세스 종료 시 서비스 완료로 간주. 배치 작업에 적합.
# RemainAfterExit=yes: 프로세스 종료 후에도 active 상태 유지.
#   → 이 설정이 없으면 pvestatd 가 After= 의존성을 만족됐다고 판단하지 못해,
#     Drop-In 이 있어도 순서 보장이 안 된다.
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/nfs-shared-mount.sh

[Install]
# multi-user.target: 네트워크 포함, GUI 제외 일반 부팅 단계.
# systemctl enable 시 이 target 의 wants 디렉터리에 심링크(Symlink)를 생성한다.
WantedBy=multi-user.target
```

---

### 파일 3 — `/etc/systemd/system/pvestatd.service.d/nfs-shared.conf`

```ini
[Unit]
# pvestatd 의 원본 유닛 파일을 수정하지 않고 Drop-In 방식으로 의존성을 주입한다.
# Proxmox 업데이트가 pvestatd.service 를 덮어써도 이 파일은 유지된다.
After=remount-nfs-shared.service
Wants=remount-nfs-shared.service
```

> **`Wants=` vs `Requires=`:**
> `Requires=`를 사용하면 마운트 서비스 실패 시 `pvestatd`도 같이 종료된다.
> NFS 없이도 Proxmox 관리 기능은 유지되어야 하므로 `Wants=`가 적합하다.

---

### 배포 절차

`pve`(.115)와 `kcy0122`(.119) **두 노드 모두**에 적용한다.

```bash
# 1. 스크립트 배포
cat > /usr/local/bin/nfs-shared-mount.sh << 'EOF'
(파일 1 내용)
EOF
chmod 755 /usr/local/bin/nfs-shared-mount.sh

# 2. 서비스 유닛 파일 배포
# (파일 2 내용으로 /etc/systemd/system/remount-nfs-shared.service 생성)

# 3. Drop-In 파일 배포
mkdir -p /etc/systemd/system/pvestatd.service.d/
# (파일 3 내용으로 /etc/systemd/system/pvestatd.service.d/nfs-shared.conf 생성)

# 4. systemd 데몬 리로드 및 서비스 등록
systemctl daemon-reload
systemctl enable remount-nfs-shared.service

# 5. Drop-In 적용 확인
#    출력 하단에 nfs-shared.conf 섹션이 표시되어야 한다.
systemctl cat pvestatd.service
```

---

## 검증

### 즉시 실행 테스트

```bash
root@pve:~# systemctl start remount-nfs-shared.service
root@pve:~# systemctl status remount-nfs-shared.service

● remount-nfs-shared.service - Ensure NFS shared storage is mounted before pvestatd
     Active: active (exited) since Tue 2026-04-14 16:07:58 KST; 1s ago
    Process: 40371 ExecStart=/usr/local/bin/nfs-shared-mount.sh (code=exited, status=0/SUCCESS)

Apr 14 16:07:56 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] Waiting for NFS server 10.10.250.117...
Apr 14 16:07:56 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] NFS server reachable (attempt 1)
Apr 14 16:07:56 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] Stale mount detected. Lazy unmounting...
Apr 14 16:07:57 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] Mounting 10.10.250.117:/mnt/nfs_shared -> /mnt/pve/shared
Apr 14 16:07:58 pve nfs-shared-mount.sh[40371]: [nfs-shared-mount] Mount successful.
Apr 14 16:07:58 pve systemd[1]: Finished remount-nfs-shared.service - ...
```

### 재부팅 후 최종 검증

`pve-ksy` 재부팅 후 클라이언트 노드에서 자동 복구 확인.

```bash
pvesm status | grep shared
# shared   nfs   active   ...  가 출력되면 정상
```

---

## 요약

| 구분 | 내용 |
| --- | --- |
| **증상** | `unable to activate storage 'shared'` — 마운트 포인트 접근 불가 |
| **원인** | `pve-ksy` 재부팅 → 클라이언트 `pvestatd`의 NFS 마운트 타이밍 실패 → Stale NFS Handle |
| **즉시 조치** | `umount -l` → `mount -t nfs` 수동 재마운트 |
| **재발 방지** | `remount-nfs-shared.service` + `pvestatd` Drop-In으로 부팅 순서 강제 |
