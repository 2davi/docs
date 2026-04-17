---
title: "Proxmox VE 실습 - HA · ZFS Replication · Cloud-Init 심화"
date: 2026-04-14
lastmod: 2026-04-14
author: "Davi"
description: "HA 에러 복구, ZFS Replication 기반 HA 구성, Cloud Image VM 생성, Cloud-Init user-data 설계, SSH 트러블슈팅, ZFS TRIM 자동화를 다룬다."
slug: "proxmox-ha-zfs-replication-cloudinit"
#section: "notes"
category: "proxmox"
tags: [proxmox, ha, zfs, replication, cloud-init, cloud-image, ssh, systemd, trim, pvesr, qemu]
order: 130
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 13
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목          | 내용                                                      |
| ------------- | --------------------------------------------------------- |
| Proxmox VE    | 9.1-1 (Debian Bookworm 기반)                              |
| 선행 문서     | `03-backup/02-backup-deep-dive.md`                        |
| 클러스터      | test (3노드: pve / pve-ksy / kcy0122)                     |
| 스토리지      | local-zfs (ZFS, 각 노드 로컬), shared (NFS, pve-ksy 제공) |
| 실습 대상 VM  | VM 101 (HA 복구), VM 301 cld-api (신규 생성)              |
| 네트워크 대역 | 10.10.250.0/24, GW 10.10.250.1                            |

> 이 문서는 HA 리소스 에러 복구부터 ZFS Replication 기반 HA 구성, Cloud Image VM 생성, Cloud-Init user-data 설계, ZFS TRIM 자동화까지 하루 실습의 전 과정을 다룬다.

---

## 1. HA(High Availability) 에러 복구

### 1.1 HA 상태 구조

Proxmox HA는 두 개의 데몬(Daemon)으로 구성된다.

| 데몬                               | 역할                                                                |
| ---------------------------------- | ------------------------------------------------------------------- |
| **CRM** (Cluster Resource Manager) | 클러스터 전체 HA 정책 조율. 어느 노드에서 어떤 VM을 실행할지 결정.  |
| **LRM** (Local Resource Manager)   | 각 노드에서 실제로 VM을 기동/정지하는 역할. CRM의 지시를 받아 실행. |

VM 기동 시도가 반복 실패하면 CRM은 해당 리소스를 `error` 상태로 마킹하고 자동 개입을 멈춘다. 이 에러 플래그는 관리자가 수동으로 해소해야 한다.

### 1.2 HA 상태 확인

```bash
ha-manager status

# 출력 예시
# quorum OK
# master pve (active, Mon Apr 13 17:35:48 2026)
# lrm kcy0122 (active, Mon Apr 13 17:35:48 2026)
# lrm pve (active, Mon Apr 13 17:35:47 2026)
# lrm pve-ksy (wait_for_agent_lock, Mon Apr 13 17:35:46 2026)
# service vm:100 (pve, migrate)
# service vm:101 (kcy0122, error)       ← 에러 상태
```

LRM의 `wait_for_agent_lock` 상태는 노드 부팅 후 락(Lock) 경쟁 중인 상태로, 시간이 지나면 자연 해소된다. 별도 조치 불필요.

### 1.3 에러 상태 복구 절차 (Proxmox 9.x)

Proxmox 9.x에서는 `clear-error` 명령이 제거되었다. `disabled` 상태로 전환하여 에러 플래그를 해소한 뒤, `started`로 올리는 2단계 방식을 사용한다.

```bash
# Step 1. error 플래그 해소: disabled로 전환
ha-manager set vm:101 --state disabled

# Step 2. 기동 요청
ha-manager set vm:101 --state started

# Step 3. 상태 전이 모니터링
watch ha-manager status
# disabled → stopped → started → running 순서로 전환되는지 확인
```

> Proxmox 8 이하에서는 `ha-manager crm-command clear-error vm:101` 명령이 존재했으나, 9.x부터 제거되었다. `ha-manager help`로 버전별 사용 가능한 명령을 먼저 확인하는 습관이 중요하다.

### 1.4 노드 장애 시 자동 페일오버(Failover) 확인

`pve` 노드가 오프라인 상태가 되었을 때, CRM이 node-affinity 룰의 우선순위(Priority)를 참조하여 VM 101을 `kcy0122`로 자동 이전하는 과정을 확인했다.

```bash
ha-manager status

# 출력 예시
# lrm pve (old timestamp - dead?, Mon Apr 13 17:39:50 2026)   ← 노드 사망 감지
# service vm:101 (kcy0122, starting)                          ← 자동 페일오버
```

---

## 2. ZFS Replication 기반 HA 구성

### 2.1 로컬 ZFS와 HA의 관계

일반적으로 HA는 **공유 스토리지(Shared Storage)** 가 필요하다. NFS, iSCSI, Ceph 등 모든 노드가 동일한 스토리지에 접근할 수 있어야 VM 디스크 이미지를 페일오버 대상 노드에서 바로 기동할 수 있기 때문이다.

로컬 ZFS는 해당 노드에만 존재하므로 기본적으로 HA가 불가능하다. 이를 해결하는 방법이 **Proxmox Storage Replication**이다.

| 방식                     | 특징                                                    | RPO       |
| ------------------------ | ------------------------------------------------------- | --------- |
| 공유 스토리지 (NFS/Ceph) | 데이터 유실 없음. 즉시 페일오버.                        | 0         |
| ZFS Replication + HA     | 복제 주기마다 스냅샷 전송. 복제 주기 내 쓰기 유실 가능. | 복제 주기 |

RPO(Recovery Point Objective, 복구 목표 시점)란 장애 발생 시 최대 허용 데이터 유실 구간이다. 프로덕션 환경에서 RPO 0이 필요하다면 Ceph RBD 같은 동기식(Synchronous) 복제로 가야 한다.

### 2.2 ZFS 풀(Pool) 이름 일치 확인

Proxmox Replication은 `zfs send | zfs receive`를 자동화한 것이다. 대상 노드에 **동일한 이름의 ZFS 풀**이 존재해야 복제가 가능하다.

```bash
# kcy0122 노드
zpool list
# NAME        SIZE  ALLOC   FREE  HEALTH
# local-zfs  99.5G  3.11G  96.4G  ONLINE

# pve-ksy 노드
ssh root@pve-ksy "zpool list"
# NAME        SIZE  ALLOC   FREE  HEALTH
# local-zfs  99.5G  3.12G  96.4G  ONLINE
```

세 노드 모두 풀 이름이 `local-zfs`로 동일하고, `storage.cfg`의 `nodes` 항목에도 세 노드가 등록되어 있음을 확인했다.

```bash
cat /etc/pve/storage.cfg | grep -A5 local-zfs

# zfspool: local-zfs
#     pool local-zfs
#     content rootdir,images
#     mountpoint /local-zfs
#     nodes pve,kcy0122,pve-ksy    ← 세 노드 모두 등록
#     sparse 1
```

### 2.3 /etc/hosts — hostname resolution 필수

Proxmox Replication은 내부적으로 SSH를 통해 `zfs send`를 전송한다. 이때 IP가 아닌 **호스트네임(Hostname)** 으로 연결을 시도한다. `/etc/hosts`에 각 노드가 등록되어 있지 않으면 `SYNCING` 상태에서 무한 대기하게 된다.

```bash
# /etc/hosts — 세 노드 전부에 동일하게 설정
cat /etc/hosts

# 127.0.0.1 localhost.localdomain localhost
#
# # Cluster Nodes
# 10.10.250.115 pve.example.com pve
# 10.10.250.117 pve-ksy.letech.local pve-ksy
# 10.10.250.119 kcy0122.proxmox.letech.kr kcy0122
```

> `/etc/hosts` 미등록 시 증상: `pvesr status`에서 `SYNCING` 상태가 20분 이상 지속되고, `journalctl -t pvesr`에 아무 로그도 찍히지 않는다. `ssh root@pve-ksy "zpool list"` 명령으로 hostname resolution 가능 여부를 먼저 확인해야 한다.

### 2.4 복제 작업(Job) 등록 (Proxmox 9.x)

```bash
# Proxmox 9.x에서의 올바른 명령어 (pvesr create-local-job)
# 구버전의 pvesh create /nodes/.../replication 는 9.x에서 동작하지 않음

# kcy0122 → pve-ksy 복제 (5분 주기)
pvesr create-local-job 301-0 pve-ksy --schedule "*/5"

# kcy0122 → pve 복제 (5분 주기)
pvesr create-local-job 301-1 pve --schedule "*/5"
```

스케줄 문법은 systemd Calendar Event 형식을 따른다. `*/5`는 "매 5분마다"를 의미한다. 최소 주기는 `*/1` (1분)이다.

```bash
# 복제 즉시 실행 (전체)
pvesr run

# 특정 Job만 즉시 실행
pvesr run --id 301-0

# 복제 상태 확인
pvesr status

# JobID    Enabled  Target          LastSync              NextSync              Duration  FailCount  State
# 301-0    Yes      local/pve-ksy   2026-04-14_10:36:56   2026-04-14_10:40:00   2.875168  0          OK
# 301-1    Yes      local/pve       2026-04-14_10:36:07   2026-04-14_10:40:00   3.991381  0          OK
```

> `pvesr run --id`는 포어그라운드(Foreground)에서 직접 실행하며, QEMU Guest Agent가 설치되어 있지 않으면 `fs-freeze` 시도 중 타임아웃(Timeout) 에러가 출력된다. `pvesr schedule-now <id>`는 systemd 타이머 큐에 작업을 등록하는 방식으로, Guest Agent 없을 때 에러를 조용히 스킵하고 진행한다. **동작 방식이 다른 두 명령**이므로 구분해서 사용해야 한다.

### 2.5 페일오버 시 Replication 방향 자동 전환

VM이 `kcy0122 → pve-ksy`로 페일오버되면, Proxmox CRM이 복제 작업의 소스 노드를 자동으로 `pve-ksy`로 전환한다. `pve-ksy`가 새 마스터(Master)가 되어 나머지 노드로 복제를 이어간다. 수동 개입 불필요.

페일백(Failback) 시에도 동일하게 복제 방향이 자동으로 원래대로 되돌아온다.

---

## 3. Cloud Image 기반 VM 생성

### 3.1 Cloud Image vs 일반 설치 ISO

| 항목             | 일반 설치 ISO                     | Cloud Image                             |
| ---------------- | --------------------------------- | --------------------------------------- |
| 설치 과정        | 대화형 설치 마법사 필요           | 불필요 — 이미 설치된 이미지             |
| cloud-init 지원  | 기본 없음 (패키지 별도 설치 필요) | 기본 탑재                               |
| VM 자동화        | 어려움                            | Cloud-Init user-data로 완전 자동화 가능 |
| 초기 이미지 크기 | 수 GB (ISO 크기)                  | 수백 MB (최소 이미지)                   |

Cloud Image는 이미 OS가 설치된 상태의 최소화된 디스크 이미지로, `cloud-init` 패키지가 내장되어 있어 최초 부팅 시 자동으로 초기 설정을 수행한다.

### 3.2 Cloud Image 다운로드 및 VM 생성

```bash
# Ubuntu 24.04 LTS Noble Cloud Image 다운로드
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img -P /tmp/

# VM 생성 (디스크 없이 먼저 생성)
qm create 301 \
  --name cld-api \
  --cores 1 \
  --cpu host \
  --memory 1024 \
  --balloon 0 \
  --ostype l26 \
  --agent enabled=1,fstrim_cloned_disks=1 \
  --scsihw virtio-scsi-single \
  --net0 virtio,bridge=vmbr0,firewall=1 \
  --serial0 socket

# 주의: --scsi0 옵션을 여기서 주지 않는 이유 —
# Cloud Image를 importdisk로 가져오면 unused0으로 붙으므로
# 빈 디스크와 충돌이 발생한다. 디스크는 import 후 별도로 연결한다.
```

### 3.3 Cloud Image 임포트(Import) 및 디스크 연결

```bash
# Cloud Image를 local-zfs 스토리지로 임포트
qm importdisk 301 /tmp/noble-server-cloudimg-amd64.img local-zfs
# 완료 시 "unused0: successfully imported disk 'local-zfs:vm-301-disk-0'" 출력

# unused0을 scsi0으로 연결
# discard=ignore: TRIM 명령을 ZFS에 전달하지 않음 (배치 TRIM 방식 사용)
# iothread=1: 디스크별 독립 I/O 스레드 (virtio-scsi-single에서 활성화 가능)
# ssd=1: SSD 에뮬레이션 활성화
qm set 301 --scsi0 local-zfs:vm-301-disk-0,discard=ignore,iothread=1,ssd=1

# 디스크 크기 확장 (Cloud Image 원본은 ~3.5GB)
qm resize 301 scsi0 30G

# Cloud-Init 드라이브 추가 (ide2)
qm set 301 --ide2 local-zfs:cloudinit

# 부트 오더(Boot Order) 수정
qm set 301 --boot order=scsi0
```

> `discard=ignore`와 `discard=on`의 차이: `discard=on`은 VM 내부의 TRIM 명령을 실시간으로 ZFS에 전달한다. 실무에서는 쓰기 발생마다 TRIM 오버헤드가 누적되어 I/O 성능에 영향을 줄 수 있으므로, `discard=ignore`로 설정하고 `zpool trim`을 배치(Batch)로 주기 실행하는 방식을 선호한다.
&lt;br>
> Proxmox 9.x에서 `discard=off` 값은 허용되지 않는다. 유효한 열거값은 `ignore`, `on`이다.

### 3.4 Cloud-Init 기본 설정

```bash
# 사용자 계정 및 접속 설정
qm set 301 --ciuser kcy0122
qm set 301 --cipassword <password>
qm set 301 --ipconfig0 ip=10.10.250.120/24,gw=10.10.250.1

# SSH 공개키(Public Key) 주입 — 패스워드 없이 키 인증으로 접속 가능
qm set 301 --sshkeys ~/.ssh/id_rsa.pub

# 설정 확인
qm config 301
# cicustom, ciuser, cipassword, ipconfig0, sshkeys 항목 확인
```

---

## 4. Cloud-Init user-data 설계

### 4.1 Cloud-Init 모듈 실행 순서

Cloud-Init은 최초 부팅 시 **1회만** 실행된다. 이후 부팅에서는 `/var/lib/cloud/instance/` 디렉토리의 완료 마크를 확인하고 스킵한다.

```markdown
[최초 부팅]
package_update → packages → write_files → runcmd

[이후 부팅]
Cloud-Init 스킵 → systemd 서비스(apt-update-on-boot) 실행
```

"이후 부팅마다" 실행할 작업은 Cloud-Init의 영역 밖이다. `runcmd`에서 systemd 서비스 유닛(Unit)을 등록하는 방식으로 구현한다.

### 4.2 runcmd 작성 시 주의사항

```yaml
# 잘못된 방법 — export는 다음 줄에 전달되지 않는다
runcmd:
  - export DEBIAN_FRONTEND=noninteractive
  - apt install -y iperf3    # ← 위의 export가 적용되지 않음

# 올바른 방법 — 각 apt 명령에 인라인으로 명시
runcmd:
  - DEBIAN_FRONTEND=noninteractive apt install -y iperf3
```

runcmd의 각 항목은 독립된 `sh -c`로 실행된다. 환경변수(Environment Variable)는 같은 줄에서만 유효하다.

`DEBIAN_FRONTEND=noninteractive`는 debconf(Debian 설정 프레임워크)의 대화형 프롬프트를 기본값으로 자동 처리하게 한다. `-y` 옵션만으로는 debconf 프롬프트를 처리할 수 없으므로 함께 사용해야 한다.

### 4.3 dpkg 손상 방어 로직

Cloud Image 최초 부팅 시 `/var/lib/dpkg/updates/` 디렉토리에 불완전한 파일이 남아있는 경우가 있다. 이 상태에서 apt를 실행하면 `dpkg was interrupted` 에러가 발생하여 이후 모든 패키지 설치가 실패한다.

```yaml
runcmd:
  # Step 1. dpkg 손상 방어 — 불완전한 파일 선제 제거 후 복구
  - rm -f /var/lib/dpkg/updates/*
  - dpkg --configure -a

  # Step 2. apt 캐시 재정리 (dpkg 복구 이후 일관성 보장)
  - DEBIAN_FRONTEND=noninteractive apt update -qq

  # 이후 패키지 설치 진행 ...
```

### 4.4 완성된 user-data 구조

```markdown
write_files
  ├── /etc/hosts                                  # 클러스터 노드 정적 임베드
  ├── /etc/ssh/sshd_config.d/99-override.conf     # SSH 패스워드 인증 허용
  ├── /etc/profile.d/aliases.sh                   # 전역 alias 등록
  └── /etc/systemd/system/apt-update-on-boot.service

runcmd
  ├── Step 1. dpkg 복구
  ├── Step 2. apt update
  ├── Step 3. iperf3 별도 설치 (debconf 프롬프트 처리)
  ├── Step 4. apt full-upgrade
  ├── Step 5. omping 소스 빌드 및 설치
  ├── Step 6. qemu-guest-agent 활성화
  ├── Step 7. sshd 재시작 (sshd_config.d 오버라이드 적용)
  ├── Step 8. apt-update-on-boot.service 등록
  ├── Step 9. root 패스워드 초기화 (실습 전용)
  └── Step 10. apt 캐시 정리
```

### 4.5 snippets 스토리지에 배포

```bash
# user-data 파일을 shared 스토리지 snippets 경로에 복사
cp ./cld-api-user-data.yaml /mnt/pve/shared/snippets/cld-api-user-data.yaml

# VM에 cicustom으로 주입
qm set 301 --cicustom "user=shared:snippets/cld-api-user-data.yaml"

# Cloud-Init 이미지 재생성 (설정 변경 후 반드시 실행)
qm cloudinit update 301

# 부팅 후 실행 결과 확인
cat /var/log/cloud-init-output.log | tail -50
```

> `shared` 스토리지의 `storage.cfg` `content` 항목에 `snippets`가 포함되어 있어야 한다. 누락 시 `qm set` 명령이 실패한다.

---

## 5. HA 룰(Rules) 등록

### 5.1 Proxmox 9.x HA 룰 시스템

Proxmox 9.x에서 기존의 HA 그룹(Group) 개념이 **룰(Rules)** 시스템으로 마이그레이션되었다. `ha-manager groupadd` 등의 명령은 deprecated 상태이며, `ha-manager rules` 명령을 사용한다.

| 룰 타입             | 설명                                              |
| ------------------- | ------------------------------------------------- |
| `node-affinity`     | VM이 선호하는 노드와 우선순위(Priority)를 정의    |
| `resource-affinity` | VM 간의 배치 관계 정의 (같은 노드 유지 또는 분리) |

### 5.2 HA 리소스 등록 및 룰 설정

```bash
# HA 리소스 등록
ha-manager add vm:301 --state started

# node-affinity 룰 생성
# kcy0122: 우선순위 5 (가장 높음), pve/pve-ksy: 우선순위 1 (폴백)
ha-manager rules add node-affinity vm301-ha-rule \
  --resources vm:301 \
  --nodes kcy0122:5,pve:1,pve-ksy:1

# strict 옵션 설정 (--nodes도 함께 줘야 동작)
# strict=0: 우선 노드 없을 때 다른 노드로 폴백 허용
ha-manager rules set node-affinity vm301-ha-rule \
  --nodes kcy0122:5,pve:1,pve-ksy:1 \
  --strict 0

# 룰 목록 확인
ha-manager rules config

# HA 상태 확인
ha-manager status
```

> Proxmox 9.x에서 `ha-manager rules set`은 `--nodes` 옵션 없이 `--strict`만 단독으로 전달하면 오류가 발생한다. 두 옵션을 함께 명시해야 한다.

### 5.3 HA 설정 파일 구조

```bash
cat /etc/pve/ha/rules.cfg

# node-affinity: vm301-ha-rule
#     nodes kcy0122:5,pve:1,pve-ksy:1
#     resources vm:301
#     strict 0
```

---

## 6. SSH 트러블슈팅

### 6.1 publickey 인증 강제 적용 문제

Cloud-Init으로 `sshkeys`를 설정하면, SSH 서버는 기본적으로 publickey 인증을 우선 시도한다. 클라이언트에 개인키(Private Key)가 있는 경우, 클라이언트가 publickey 인증만 시도하고 패스워드 인증을 건너뛸 수 있다.

**증상:** `No supported authentication methods available (server sent: publickey)`

**원인 분석:**

| 상황                                  | 원인                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| MobaXterm에서 발생                    | Windows `~/.ssh/id_ed25519` 키를 자동 감지하여 publickey만 시도 |
| 해당 키가 VM `authorized_keys`에 없음 | 서버가 publickey 인증 거부                                      |

**해결:**

```bash
# 1. VM에 Windows 공개키 등록
echo 'ssh-ed25519 AAAA...' >> ~/.ssh/authorized_keys

# MobaXterm 세션 설정에서 해당 개인키 명시적 지정
# Session → SSH → Advanced SSH settings → Use private key → id_ed25519 경로 지정

# 2. root 계정도 동일하게 처리
sudo mkdir -p /root/.ssh
sudo cp /home/kcy0122/.ssh/authorized_keys /root/.ssh/authorized_keys
sudo chmod 700 /root/.ssh
sudo chmod 600 /root/.ssh/authorized_keys
```

### 6.2 known_hosts 호스트 키 충돌

VM을 재생성하면 SSH 호스트 키(Host Key)가 변경된다. 기존 `known_hosts`에 이전 키가 남아있으면 연결이 거부된다.

```bash
# 충돌 키 제거
ssh-keygen -f '/root/.ssh/known_hosts' -R '10.10.250.120'

# 이후 재접속 시 새 키 등록
ssh kcy0122@10.10.250.120
```

### 6.3 sshd 설정 확인

변경 사항이 실제로 적용되었는지 확인하는 방법:

```bash
# sshd가 현재 읽고 있는 실제 설정값 출력
# 설정 파일을 직접 읽는 것보다 정확하다
sshd -T | grep -E 'passwordauthentication|permitrootlogin'

# 출력 예시
# permitrootlogin yes
# passwordauthentication yes
```

---

## 7. ZFS TRIM 자동화

### 7.1 discard=ignore와 배치 TRIM 전략

`discard=ignore` 설정 시 VM 내부의 TRIM 명령이 ZFS에 전달되지 않는다. 삭제된 블록이 즉시 반환되지 않으므로, 주기적으로 `zpool trim`을 실행하여 공간을 회수해야 한다.

| 명령                   | 실행 위치    | 동작                                                                             |
| ---------------------- | ------------ | -------------------------------------------------------------------------------- |
| `fstrim`               | VM 내부      | VM 파일시스템 → 하이퍼바이저로 TRIM 전달. `discard=ignore` 시 ZFS까지 전달 안 됨 |
| `zpool trim local-zfs` | Proxmox 노드 | ZFS 풀 전체를 직접 처리. `discard` 설정과 무관하게 동작                          |

`discard=ignore` 환경에서는 반드시 **Proxmox 노드에서 `zpool trim`을 실행**해야 한다.

### 7.2 systemd Timer로 자동화

cron 대비 systemd timer의 장점:

| 항목           | cron                          | systemd timer                                         |
| -------------- | ----------------------------- | ----------------------------------------------------- |
| 실행 로그      | `/var/log/syslog`에 단순 기록 | `journalctl`로 상세 추적 가능                         |
| 누락 실행 처리 | 누락 시 그냥 스킵             | `Persistent=true` 설정 시 부팅 후 밀린 작업 즉시 실행 |
| 의존성 설정    | 불가                          | `After=`, `Wants=` 등 유닛 의존성 설정 가능           |

```bash
# /etc/systemd/system/zpool-trim.service
[Unit]
Description=ZFS Pool TRIM - local-zfs
After=zfs.target

[Service]
Type=oneshot
ExecStart=/sbin/zpool trim local-zfs
StandardOutput=journal
StandardError=journal
```

```bash
# /etc/systemd/system/zpool-trim.timer
[Unit]
Description=ZFS Pool TRIM Timer - daily at 09:30

[Timer]
OnCalendar=*-*-* 09:30:00
Persistent=true     # 노드가 09:30에 꺼져있었어도 부팅 후 즉시 실행

[Install]
WantedBy=timers.target
```

```bash
# 세 노드 전부에서 실행
systemctl daemon-reload
systemctl enable --now zpool-trim.timer

# 등록 확인
systemctl list-timers | grep zpool
```

---

## 8. 실습 기록

### 8.1 VM 101 HA 에러 복구 전체 흐름

```bash
# 1. 현재 상태 확인
ha-manager status
# service vm:101 (kcy0122, error)

# 2. error 플래그 해소
ha-manager set vm:101 --state disabled
# trying to acquire cfs lock 'domain-ha' ...
#  OK

# 3. 상태 확인
ha-manager status
# service vm:101 (kcy0122, disabled)    ← error에서 disabled로 전환 확인

# 4. 기동 요청
ha-manager set vm:101 --state started

# 5. 모니터링
watch ha-manager status
# service vm:101 (kcy0122, started)     ← 정상 복구
```

### 8.2 VM 301 생성 전체 흐름

```bash
# Cloud Image 다운로드
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img -P /tmp/

# VM 생성
qm create 301 --name cld-api --cores 1 --cpu host --memory 1024 \
  --balloon 0 --ostype l26 --agent enabled=1,fstrim_cloned_disks=1 \
  --scsihw virtio-scsi-single --net0 virtio,bridge=vmbr0,firewall=1 \
  --serial0 socket

# 디스크 임포트 및 연결
qm importdisk 301 /tmp/noble-server-cloudimg-amd64.img local-zfs
qm set 301 --scsi0 local-zfs:vm-301-disk-0,discard=ignore,iothread=1,ssd=1
qm resize 301 scsi0 30G

# Cloud-Init 구성
qm set 301 --ide2 local-zfs:cloudinit
qm set 301 --boot order=scsi0
qm set 301 --ciuser kcy0122 --cipassword <password>
qm set 301 --ipconfig0 ip=10.10.250.120/24,gw=10.10.250.1
qm set 301 --sshkeys ~/.ssh/id_rsa.pub
qm set 301 --cicustom "user=shared:snippets/cld-api-user-data.yaml"

# Cloud-Init 이미지 재생성
qm cloudinit update 301

# 기동
qm start 301
```

### 8.3 ZFS Replication 설정 전체 흐름

```bash
# 복제 Job 등록
pvesr create-local-job 301-0 pve-ksy --schedule "*/5"
pvesr create-local-job 301-1 pve --schedule "*/5"

# hosts 파일 수정 후 즉시 동기화 테스트
pvesr run

# 결과 확인
pvesr status
# 301-0    Yes    local/pve-ksy    2026-04-14_10:36:56    OK
# 301-1    Yes    local/pve        2026-04-14_10:36:07    OK
```

### 8.4 dpkg 손상 복구

```bash
# Cloud-Init 실행 로그에서 오류 확인
cat /var/log/cloud-init-output.log | tail -50
# E: dpkg was interrupted, you must manually run 'sudo dpkg --configure -a'

# 복구
sudo rm /var/lib/dpkg/updates/*
sudo dpkg --configure -a

# 패키지 재설치
sudo DEBIAN_FRONTEND=noninteractive apt install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent
```

---

> **공식 문서 — HA Manager:** https://pve.proxmox.com/wiki/High_Availability
> **공식 문서 — HA Manager CLI:** https://pve.proxmox.com/pve-docs/ha-manager.1.html
> **공식 문서 — Storage Replication:** https://pve.proxmox.com/wiki/Storage_Replication
> **공식 문서 — Cloud-Init:** https://pve.proxmox.com/wiki/Cloud-Init_Support
> **공식 문서 — Cloud-Init user-data:** https://cloudinit.readthedocs.io/en/latest/reference/modules.html
