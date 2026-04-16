---
title: "Cloud-Init 기반 VM 자동 프로비저닝"
date: 2026-04-10
lastmod: 2026-04-14
description: "Cloud Image 임포트부터 cicustom user-data 설계, Snippets 스토리지 연동, 부팅 후 자동화 패턴까지. Proxmox에서 Cloud-Init이 동작하는 전체 레이어를 다룬다."
slug: "proxmox-cloud-init"
section: "notes"
category: "proxmox"
tags: [proxmox, cloud-init, cloud-image, cicustom, user-data, snippets, qemu, provisioning, automation]
order: 1
series: "Proxmox VE 학습 시리즈"
series_order: 7
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
| 선행 문서     | `02-vm-lifecycle/01-vm-create.md`                         |
| 클러스터      | test (3노드: pve / pve-ksy / kcy0122)                     |
| 스토리지      | local-zfs (ZFS, 각 노드 로컬), shared (NFS, pve-ksy 제공) |
| 실습 대상 VM  | VM 301 `cld-api` (Ubuntu 24.04 Cloud Image 기반)          |
| 네트워크 대역 | 10.10.250.0/24, GW 10.10.250.1                            |

---

## 1. Cloud-Init이란

Cloud-Init은 클라우드 인스턴스의 **최초 부팅 시 자동 초기 설정을 수행하는 업계 표준 도구**다. AWS, GCP, Azure 모두 동일하게 Cloud-Init을 사용한다. Proxmox도 이것을 네이티브로 지원한다.

Cloud-Init이 처리하는 것들:

- 호스트명(Hostname) 설정
- 네트워크(IP, Gateway, DNS) 구성
- SSH 공개키 주입
- 사용자 계정 생성 및 패스워드 설정
- 패키지 설치
- 임의 스크립트 실행 (`runcmd`)
- 파일 사전 배치 (`write_files`)

이것들을 수작업으로 하려면 OS 설치 → 로그인 → 설정 → 패키지 설치 순서를 VM마다 반복해야 한다. Cloud-Init은 이 과정을 **선언적으로** 기술한 YAML 파일 하나로 대체한다.

---

## 2. Cloud Image vs 일반 설치 ISO

| 항목             | 일반 설치 ISO              | Cloud Image                                 |
| ---------------- | -------------------------- | ------------------------------------------- |
| 설치 과정        | 대화형 설치 마법사 필요    | 불필요 — 이미 설치된 최소 이미지            |
| 초기 이미지 크기 | 수 GB                      | 수백 MB                                     |
| cloud-init 포함  | 기본 없음 (별도 설치 필요) | 기본 탑재                                   |
| VM 자동화        | 어렵고 느림                | user-data 하나로 완전 자동화 가능           |
| 대량 프로비저닝  | 부적합                     | Template + Clone + Cloud-Init 조합으로 최적 |

Cloud Image는 OS가 이미 설치된 최소화된 디스크 이미지다. 부팅하면 `cloud-init` 데몬이 메타데이터 소스(Proxmox의 경우 NoCloud ISO 드라이브)에서 설정을 읽어 자동으로 초기화를 수행한다.

---

## 3. Proxmox에서 Cloud-Init이 동작하는 방식

### 3.1 NoCloud 드라이브

Proxmox가 `--ide2 <스토리지>:cloudinit`을 설정하면, 내부적으로 **NoCloud 형식의 ISO 이미지**를 생성하여 가상 CD-ROM 드라이브에 마운트한다. 이 ISO에는 두 개의 파일이 들어간다:

| 파일             | 내용                                        |
| ---------------- | ------------------------------------------- |
| `meta-data`      | 인스턴스 ID, 호스트명                       |
| `user-data`      | 계정, SSH 키, 네트워크, 패키지, 스크립트 등 |
| `network-config` | 네트워크 인터페이스 설정 (Netplan 형식)     |

VM이 부팅되면 cloud-init 데몬이 `/dev/sr0` (또는 vfat 레이블 `cidata`)을 찾아 이 파일들을 읽는다. Proxmox가 `qm set --ciuser`, `--ipconfig0`, `--sshkeys` 등으로 설정한 값들이 이 ISO에 반영된다.

### 3.2 `cicustom` — 사용자 정의 user-data 주입

Proxmox의 내장 Cloud-Init 옵션(`--ciuser`, `--ipconfig0` 등)만으로는 패키지 설치, 파일 배치, 임의 스크립트 실행을 제어할 수 없다. 이때 `--cicustom` 옵션으로 직접 작성한 `cloud-config` YAML을 주입한다.

```bash
qm set 301 --cicustom "user=shared:snippets/cld-api-user-data.yaml"
```

`cicustom`을 사용하면 Proxmox가 생성하는 자동 `user-data`를 **완전히 대체**한다. `--ciuser`, `--cipassword` 등의 설정은 여전히 `meta-data`에는 반영되지만, `user-data` 레이어는 사용자가 제공한 YAML이 독점한다.

**주의:** `cicustom` 설정 후 반드시 `qm cloudinit update <VMID>`를 실행해야 ISO가 재생성된다.

### 3.3 Cloud-Init 실행 단계

```markdown
[최초 부팅 전용 — 1회만 실행]
  └─ network-config 적용 (Netplan)
  └─ write_files 실행 (파일 배치)
  └─ package_update (apt update)
  └─ packages 설치
  └─ runcmd 실행 (임의 스크립트)

[이후 모든 부팅 — 스킵]
  └─ /var/lib/cloud/instance/ 완료 마크 확인 → Cloud-Init 전체 스킵
  └─ systemd 서비스(사용자가 등록한 것)만 실행
```

"이후 부팅마다" 실행할 작업(예: `apt update`, 인증서 갱신)은 Cloud-Init의 영역 밖이다. `runcmd`에서 systemd 서비스 유닛을 등록하는 방식으로 구현한다.

---

## 4. Cloud Image 기반 VM 생성

### 4.1 Cloud Image 다운로드

주요 배포판이 Cloud-Init 내장 이미지를 공식 제공한다:

```bash
# Ubuntu 24.04 LTS (Noble)
wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img -P /tmp/

# Debian 12 (Bookworm)
wget https://cloud.debian.org/images/cloud/bookworm/latest/debian-12-generic-amd64.qcow2 -P /tmp/
```

### 4.2 VM 생성 — 디스크 없이 먼저

Cloud Image를 사용할 때 `--scsi0`을 VM 생성 시점에 함께 선언하면 **문제가 발생한다.** `qm create`에서 디스크를 지정하면 지정한 크기의 빈 LV가 먼저 생성되고, `qm importdisk`로 Cloud Image를 가져오면 이것이 `unused0`으로 별도 붙는다. 결과적으로 `scsi0`에는 빈 LV, `unused0`에는 OS 이미지가 달린 꼬인 상태가 된다.

따라서 **디스크 없이 VM 먼저 생성하고, importdisk 후 scsi0에 수동 연결**하는 순서를 따라야 한다.

```bash
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
# --scsi0 없이 생성
```

`--serial0 socket`은 Cloud Image 기반 VM에서 필수다. 대부분의 Cloud Image는 시리얼 콘솔을 통해 noVNC 접속을 처리하도록 구성되어 있다. 이것이 없으면 Proxmox Web UI의 콘솔(noVNC)이 연결만 되고 화면이 뜨지 않는다.

### 4.3 Cloud Image 임포트 및 디스크 연결

```bash
# Cloud Image를 local-zfs 스토리지로 임포트
# → 완료 시 "unused0: successfully imported disk 'local-zfs:vm-301-disk-0'" 출력
qm importdisk 301 /tmp/noble-server-cloudimg-amd64.img local-zfs

# unused0을 scsi0으로 연결
qm set 301 --scsi0 local-zfs:vm-301-disk-0,discard=ignore,iothread=1,ssd=1

# 디스크 크기 확장 (Cloud Image 원본은 ~3.5GB)
qm resize 301 scsi0 30G

# Cloud-Init 드라이브 추가
qm set 301 --ide2 local-zfs:cloudinit

# 부팅 순서 설정
qm set 301 --boot order=scsi0
```

**`discard=ignore` vs `discard=on`:**

| 옵션             | 동작                                       | 적합 상황                     |
| ---------------- | ------------------------------------------ | ----------------------------- |
| `discard=on`     | VM 내부 TRIM 명령을 ZFS에 실시간 전달      | TRIM 즉시성이 중요한 경우     |
| `discard=ignore` | VM 내부 TRIM 무시, ZFS 레벨 배치 TRIM 사용 | 쓰기 TRIM 오버헤드 회피, 권장 |

`discard=ignore` 설정 시 VM 내 `fstrim` 명령이 ZFS까지 전달되지 않는다. 대신 Proxmox 노드에서 주기적으로 `zpool trim local-zfs`를 실행하여 공간을 회수한다 (`05-ha-and-automation/02-ha-with-storage.md`의 ZFS TRIM 자동화 참고).

> Proxmox 9.x에서 `discard=off` 값은 허용되지 않는다. 유효한 열거값은 `ignore`, `on`이다.

### 4.4 Cloud-Init 기본 설정 주입

```bash
# 계정 설정
qm set 301 --ciuser kcy0122
qm set 301 --cipassword <패스워드>

# 네트워크 설정
qm set 301 --ipconfig0 ip=10.10.250.120/24,gw=10.10.250.1
qm set 301 --nameserver 8.8.8.8

# SSH 공개키 주입 (패스워드 없이 키 인증 접속 가능)
qm set 301 --sshkeys ~/.ssh/id_rsa.pub

# 설정 확인
qm config 301
```

---

## 5. `cicustom` user-data 설계

### 5.1 Snippets 스토리지 확인

`--cicustom`으로 user-data를 주입하려면 해당 파일이 **`snippets` 콘텐츠 타입이 활성화된 스토리지**에 있어야 한다.

```bash
cat /etc/pve/storage.cfg

# nfs: shared
#     content images,vztmpl,iso,import,backup,snippets,rootdir  ← snippets 포함
#     ...
```

`shared` NFS 스토리지에 `snippets`가 선언되어 있으므로 여기에 YAML 파일을 배치한다:

```bash
cp ./cld-api-user-data.yaml /mnt/pve/shared/snippets/cld-api-user-data.yaml
```

`local` 스토리지의 기본 `content`는 `backup,vztmpl,iso,import`다. `snippets`가 없다면 `Datacenter → Storage → local → Edit → Content`에서 추가해야 한다.

### 5.2 `runcmd` 작성 시 핵심 규칙

`runcmd`의 각 항목은 **독립된 `sh -c`로 실행**된다. 이 사실에서 두 가지 중요한 제약이 생긴다.

**① 환경변수는 같은 줄에서만 유효하다:**

```yaml
# 잘못된 방법 — export는 다음 줄에 전달되지 않음
runcmd:
  - export DEBIAN_FRONTEND=noninteractive
  - apt install -y iperf3   # ← 위 export 적용 안 됨

# 올바른 방법 — 각 apt 명령에 인라인으로 명시
runcmd:
  - DEBIAN_FRONTEND=noninteractive apt install -y iperf3
```

**② `cd`나 변수 선언도 다음 줄에 전달되지 않는다:**

```yaml
# 잘못된 방법
runcmd:
  - cd /tmp/omping
  - make   # ← /tmp/omping이 아닌 다른 경로에서 실행됨

# 올바른 방법
runcmd:
  - make -C /tmp/omping
```

**③ 스크립트 환경에서는 `apt-get`을 사용한다:**

`apt`는 사람이 읽는 인터랙티브 터미널을 위해 설계되었다. 진행률 바(Progress Bar)를
퍼센트 단위로 쪼개어 출력하고, OS 버전에 따라 다른 UI를 가지며, `DEBIAN_FRONTEND=noninteractive`를
설정해도 일부 `[y/n]` 형태의 인터랙션 프롬프트를 남길 수 있다.
이 경우 `runcmd` 프로세스가 응답을 기다리며 무한 대기에 빠진다.

`apt-get`은 스크립트 환경을 위한 로우레벨 인터페이스다. 진행률 출력이 없고,
비인터랙티브 동작이 일관성 있게 보장된다. `cloud-init-output.log`의 가독성도 훨씬 좋다.

```yaml
# 잘못된 방법 — apt는 스크립트에 부적합
runcmd:
  - DEBIAN_FRONTEND=noninteractive apt full-upgrade -y

# 올바른 방법 — apt-get 사용
runcmd:
  - DEBIAN_FRONTEND=noninteractive apt-get full-upgrade -y -q
```

`-q` 옵션은 진행 출력을 억제한다. `-qq`는 에러 메시지 외 전부 억제한다.

`DEBIAN_FRONTEND=noninteractive`는 `apt`의 debconf(Debian 설정 프레임워크) 프롬프트를 자동으로 기본값 처리하게 한다. `-y` 옵션만으로는 debconf 프롬프트를 처리할 수 없으므로 함께 써야 한다.

### 5.3 dpkg 손상 방어 패턴

Cloud Image 최초 부팅 시 `/var/lib/dpkg/updates/`에 불완전한 파일이 남아있는 경우가 있다. 이 상태에서 `apt`를 실행하면:

```log
E: dpkg was interrupted, you must manually run 'sudo dpkg --configure -a'
```

이후 모든 패키지 설치가 실패한다. `runcmd` 첫 단계에서 선제적으로 처리하는 것이 안전하다:

```yaml
runcmd:
  - rm -f /var/lib/dpkg/updates/*
  - dpkg --configure -a
  - DEBIAN_FRONTEND=noninteractive apt update -qq
  # 이후 정상적인 패키지 설치 진행
```

### 5.4 `packages` 모듈 vs `runcmd` 직접 설치

| 방식               | 적합 패키지                              | 이유                               |
| ------------------ | ---------------------------------------- | ---------------------------------- |
| `packages` 모듈    | 일반 패키지 (vim, curl, git 등)          | 간결하고 병렬 처리 가능            |
| `runcmd` 직접 설치 | debconf 프롬프트 발생 패키지 (iperf3 등) | `DEBIAN_FRONTEND` 명시적 제어 필요 |
| `runcmd` 빌드 설치 | DEB 패키지 없는 소스 빌드 (omping 등)    | 빌드 순서 제어 필요                |

`packages` 모듈은 `DEBIAN_FRONTEND`를 내부적으로 처리하지 않는 경우가 있어, 인터랙티브 프롬프트가 발생하는 패키지는 `runcmd`에서 명시적으로 설치하는 것이 안전하다.

---

## 6. 완성된 user-data

```yaml
#cloud-config

# ============================================================
# cld-api — Cloud-Init User Data
# Ubuntu 24.04 LTS (Noble) / DEB 계열 전용
#
# 최초 부팅: dpkg 복구 → full-upgrade → 패키지 설치 → omping 빌드
# 이후 부팅: apt update (목록 갱신만, network-online.target 이후)
# ============================================================

hostname: cld-api
manage_etc_hosts: false

# ------------------------------------------------------------
# 파일 사전 배치 (write_files)
# runcmd보다 먼저 실행됨
# ------------------------------------------------------------
write_files:

  # 클러스터 노드 정보를 /etc/hosts에 추가
  - path: /etc/hosts
    append: true
    content: |

      # Proxmox Cluster Nodes (injected by cloud-init)
      10.10.250.115 pve.example.com pve
      10.10.250.117 pve-ksy.letech.local pve-ksy
      10.10.250.119 kcy0122.proxmox.letech.kr kcy0122

  # SSH 패스워드 인증 허용 오버라이드 (sshd_config.d 방식)
  - path: /etc/ssh/sshd_config.d/99-override.conf
    permissions: '0600'
    content: |
      PasswordAuthentication yes
      PermitRootLogin yes

  # 이후 모든 부팅마다 apt update를 실행하는 systemd 서비스
  - path: /etc/systemd/system/apt-update-on-boot.service
    permissions: '0644'
    content: |
      [Unit]
      Description=Run apt update on every boot
      After=network-online.target
      Wants=network-online.target

      [Service]
      Type=oneshot
      Environment="DEBIAN_FRONTEND=noninteractive"
      ExecStart=/usr/bin/apt update -qq
      StandardOutput=journal
      StandardError=journal

      [Install]
      WantedBy=multi-user.target

# ------------------------------------------------------------
# 패키지 설치 (packages 모듈)
# package_update: true → apt update 선행 실행
# ------------------------------------------------------------
package_update: true
package_upgrade: false

packages:
  # 기본 유틸리티
  - vim
  - htop
  - curl
  - wget
  - tmux
  - tree
  - unzip
  - zip
  - jq
  - rsync
  - bash-completion
  - psmisc

  # 개발 도구
  - git
  - build-essential
  - make

  # 네트워크 진단
  - net-tools
  - dnsutils
  - traceroute
  - tcpdump
  - nmap
  - netcat-openbsd
  - socat
  - lsof

  # 시스템 모니터링
  - sysstat
  - iotop
  - iftop
  - nethogs
  - strace

  # 스토리지 관리
  - smartmontools
  - lvm2
  - parted

  # QEMU Guest Agent
  - qemu-guest-agent

# ------------------------------------------------------------
# 최초 부팅 1회 실행 명령 (runcmd)
# 주의: 각 항목은 독립된 sh -c로 실행됨.
#       환경변수는 같은 줄에서만 유효.
# ------------------------------------------------------------
runcmd:
  # Step 1. dpkg 상태 선제 복구
  - rm -f /var/lib/dpkg/updates/*
  - dpkg --configure -a

  # Step 2. apt 캐시 재정리 (dpkg 복구 후 일관성 보장)
  - DEBIAN_FRONTEND=noninteractive apt update -qq

  # Step 3. debconf 프롬프트 발생 패키지 별도 설치
  - DEBIAN_FRONTEND=noninteractive apt install -y iperf3

  # Step 4. full-upgrade (최초 1회)
  - DEBIAN_FRONTEND=noninteractive apt full-upgrade -y

  # Step 5. omping 소스 빌드 및 설치
  # DEB 계열에 omping 패키지가 없으므로 소스에서 빌드
  - git clone https://github.com/jfriesse/omping.git /tmp/omping
  - make -C /tmp/omping
  - cp /tmp/omping/omping /usr/local/bin/omping
  - rm -rf /tmp/omping

  # Step 6. qemu-guest-agent 활성화
  - systemctl enable --now qemu-guest-agent

  # Step 7. sshd 재시작 (sshd_config.d 오버라이드 적용)
  - systemctl restart sshd

  # Step 8. apt-update-on-boot 서비스 등록
  - systemctl daemon-reload
  - systemctl enable apt-update-on-boot.service

  # Step 9. root 패스워드 설정 (실습 환경 전용 — 프로덕션 금지)
  # 패스워드가 snippets 파일에 평문으로 저장됨에 주의
  - echo 'root:<패스워드>' | chpasswd

  # Step 10. apt 캐시 정리
  - apt autoremove -y
  - apt clean
```

---

## 7. VM 기동 및 검증

### 7.1 user-data 배포 및 VM 시작

```bash
# Snippets 경로에 user-data 배포
cp ./cld-api-user-data.yaml /mnt/pve/shared/snippets/cld-api-user-data.yaml

# cicustom 설정 주입
qm set 301 --cicustom "user=shared:snippets/cld-api-user-data.yaml"

# Cloud-Init ISO 재생성 (설정 변경 후 반드시 실행)
qm cloudinit update 301

# VM 시작
qm start 301
```

### 7.2 Cloud-Init 실행 로그 확인

Cloud-Init의 `runcmd`는 **백그라운드에서 실행**된다. 부팅 후 로그인 프롬프트가 뜨더라도
`runcmd`의 작업이 한창 진행 중일 수 있다. 리소스(CPU, 메모리)를 활발하게 사용하는
작업이 `runcmd`에 있다면, 콘솔이 열린 상태에서도 시스템이 무거운 것이 정상이다.

```bash
# VM 내부에서 — cloud-init 완료까지 블로킹하며 상태 대기
cloud-init status --wait
# status: running  → 진행 중
# status: done     → 완료
# status: error    → 실패

# 실시간 전체 출력 로그 (runcmd의 stdout/stderr 포함)
tail -f /var/log/cloud-init-output.log

# cloud-init 데몬 자체의 상세 로그 (모듈 실행 순서, 에러 트레이스)
journalctl -u cloud-init -f

# cloud-init 단계별 로그 파일
# /var/log/cloud-init.log        ← 데몬 내부 동작 (모듈 로드, 설정 파싱)
# /var/log/cloud-init-output.log ← runcmd 등 실제 명령 출력
```

user-data에 오류가 있어 `runcmd`가 중간에 실패했을 때는
`/var/log/cloud-init-output.log`에서 어느 Step에서 멈췄는지 확인한다.

```bash
# 실패 지점 빠르게 찾기
grep -n "ERROR\|WARN\|failed\|Traceback" /var/log/cloud-init-output.log
```

### 7.3 Cloud-Init 실행 초기화 — runcmd 재실행

Cloud-Init은 최초 부팅 후 `/var/lib/cloud/` 하위에 완료 마크를 남기고,
이후 부팅에서는 이 마크를 확인하고 전체 실행을 스킵한다.
user-data를 수정한 뒤 `runcmd`를 다시 실행하고 싶을 때 이 기록을 초기화한다.

```bash
# VM 내부에서 실행
# cloud-init 자체 초기화 명령 (권장)
# 실행 기록, 시드 캐시, 네트워크 설정 초기화
# --logs 옵션을 추가하면 로그 파일도 함께 초기화
sudo cloud-init clean

# 또는 수동으로 완료 마크 디렉토리 삭제
sudo rm -rf /var/lib/cloud/instances/
sudo rm -rf /var/lib/cloud/instance   # 심볼릭 링크

# 초기화 후 재부팅
sudo reboot
```

재부팅 후 cloud-init이 다시 `/dev/sr0`(NoCloud ISO)에서 설정을 읽어
`write_files`, `packages`, `runcmd`를 처음부터 전부 재실행한다.

**주의사항:**

- `cloud-init clean`은 `/etc/hosts`, SSH 설정 등 `write_files`로 배치한 파일을 **삭제하지 않는다.**
  파일은 이미 존재하므로 `write_files`의 `append: false` 항목은 덮어쓰기, `append: true` 항목은 중복 추가된다.
  `/etc/hosts`처럼 `append: true`로 구성된 항목은 재실행 시 내용이 중복 삽입될 수 있으니 주의한다.
- `runcmd`의 패키지 설치는 `apt-get`의 멱등성으로 인해 이미 설치된 패키지는 스킵된다.
  부작용 없이 재실행 가능하다.
- Proxmox 호스트에서 `qm cloudinit update <VMID>`를 실행해 ISO를 재생성한 뒤
  VM을 재시작하는 방식은 **cloud-init 실행 기록을 초기화하지 않는다.**
  ISO 내용은 갱신되지만, VM이 "이미 실행했다"는 완료 마크가 남아있으면
  재부팅 후에도 cloud-init이 스킵된다. 반드시 VM 내부에서 `cloud-init clean`을 먼저 실행해야 한다.

---

## 8. 트러블슈팅

### 8.1 SSH 접속 시 publickey 인증 강제 문제

**증상:** `No supported authentication methods available (server sent: publickey)`

**원인:** Windows `~/.ssh/` 경로에 개인키가 있으면, MobaXterm 같은 SSH 클라이언트가 자동으로 publickey 인증만 시도한다. 해당 키가 VM의 `authorized_keys`에 없으면 연결이 거부된다.

**해결:**

```bash
# 방법 1: VM에 해당 공개키 추가
echo 'ssh-ed25519 AAAA...' >> ~/.ssh/authorized_keys

# 방법 2: SSH 클라이언트에서 개인키 명시적 지정
ssh -i ~/.ssh/id_ed25519 kcy0122@10.10.250.120

# 방법 3: user-data의 sshd_config.d 오버라이드 확인
cat /etc/ssh/sshd_config.d/99-override.conf
# PasswordAuthentication yes 확인
```

### 8.2 known_hosts 호스트 키 충돌

VM을 재생성하거나 같은 IP를 재사용하면 SSH 호스트 키가 변경된다. 기존 `known_hosts`의 이전 키와 충돌하면 연결이 거부된다.

```bash
# 충돌 키 제거
ssh-keygen -f '/root/.ssh/known_hosts' -R '10.10.250.120'

# 이후 재접속 시 새 키 자동 등록
ssh kcy0122@10.10.250.120
```

### 8.3 `cicustom` 설정 후 변경이 반영 안 될 때

```bash
# Cloud-Init ISO 재생성 누락 여부 확인
qm cloudinit dump 301 user   # 현재 ISO에 들어간 user-data 내용 출력

# 재생성
qm cloudinit update 301

# VM 재시작 후 확인
qm stop 301 && qm start 301
```

### 8.4 sshd 설정 적용 확인

설정 파일을 직접 읽는 것보다 sshd가 실제로 읽고 있는 값을 확인하는 것이 정확하다:

```bash
sshd -T | grep -E 'passwordauthentication|permitrootlogin'
# permitrootlogin yes
# passwordauthentication yes
```

### 8.5 dpkg 손상 발생 시 수동 복구

Cloud-Init이 `dpkg --configure -a` 처리 후에도 실패한 경우 수동 복구:

```bash
# VM 내부에서
sudo rm /var/lib/dpkg/updates/*
sudo dpkg --configure -a
sudo DEBIAN_FRONTEND=noninteractive apt install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent
```

---

## 부록: Cloud-Init과 IaC 관점

Cloud-Init + Template + Linked Clone 조합은 Proxmox에서 IaC(Infrastructure as Code)를 구현하는 가장 기본 패턴이다.

```markdown
[Template (8000번대)]
      ↓ qm clone (Linked Clone)
[VM 초기 상태]
      ↓ Cloud-Init (최초 부팅)
[설정 완료 VM]
      ↓ 애플리케이션 배포
[운영 VM]
```

여기에 Terraform의 `proxmox` 프로바이더를 결합하면 VM 인프라를 코드로 선언적 관리할 수 있다. CMP가 내부적으로 수행하는 작업의 본질이 바로 이것이다.

> - **Proxmox Cloud-Init 공식 문서:** https://pve.proxmox.com/wiki/Cloud-Init_Support
> - **Cloud-Init 모듈 레퍼런스:** https://cloudinit.readthedocs.io/en/latest/reference/modules.html
> - **Terraform Proxmox Provider:** https://registry.terraform.io/providers/Telmate/proxmox/latest
