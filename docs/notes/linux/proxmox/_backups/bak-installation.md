---
title: "Proxmox VE 9.1 초기 설정 가이드"
date: 2026-04-07
lastmod: 2026-04-07
author: "Davi"
description: "Proxmox VE ISO 부팅부터 초기 네트워크 설정까지 단계별 설치 과정을 정리한다."
slug: "proxmox-installation"
#section: "notes"
category: "etc."
tags: [proxmox, virtualization, linux, debian, 64x-bit, cmp, cloud, cluster, ssh, partitioning]
order: 10
series: "Proxmox VE VM 라이프사이클 & REST API 심화 학습"
series_order: 1
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
embed_only: true
---

## 환경 정보

| 항목          | 내용                               |
| ------------- | ---------------------------------- |
| Proxmox VE    | 9.1-1 (Debian Bookworm 기반)       |
| 가상화 플랫폼 | Oracle VirtualBox 7.1.14 (r170994) |
| 네트워크 모드 | NAT                                |
| 호스트 OS     | Windows                            |
| 디스크        | 64GB (단일)                        |
| RAM           | 약 8GB                             |
| 호스트명      | kcy0122.proxmox.letech.kr          |
| NIC           | enp0s3 (VirtualBox 가상 NIC)       |

---

## 0. Proxmox VE Installer

> 기본 설정값을 사용하여 설치를 진행한다.

| 항목                 | 내용                         |
| -------------------- | ---------------------------- |
| Management Interface | enp0s3 (VirtualBox 가상 NIC) |
| Hostname (FQDN)      | kcy0122.proxmox.letech.kr    |
| IP Address (CIDR)    | 10.0.2.15/24                 |
| Gateway              | 10.0.2.2                     |
| DNS Server           | 10.0.2.3                     |

---

## 1. OS 초기 기본작업

### 1.1 APT 저장소 변경

> Proxmox 기본 설치 시 Enterprise 구독 저장소가 활성화되어 있어,
> 구독이 없으면 `apt update` 시 인증 에러가 발생한다.
> No-Subscription 저장소로 전환해야 한다.

```bash
# Enterprise repo 비활성화
mv /etc/apt/sources.list.d/pve-enterprise.list /etc/apt/sources.list.d/pve-enterprise.list.bak

# No-Subscription repo 추가
echo "deb http://download.proxmox.com/debian/pve bookworm pve-no-subscription" > /etc/apt/sources.list.d/pve-no-subscription.list

# Ceph repo도 동일하게 처리
if [ -f /etc/apt/sources.list.d/ceph.list ]; then
  sed -i 's/enterprise/no-subscription/g' /etc/apt/sources.list.d/ceph.list
fi
```

### 1.2 기본 패키지 설치

```bash
apt update && apt full-upgrade -y
apt install -y vim htop curl wget net-tools dnsutils lsof tmux bash-completion
```

### 1.3 타임존 및 로케일

```bash
timedatectl set-timezone Asia/Seoul
dpkg-reconfigure locales  # en_US.UTF-8 선택
```

### 1.4 구독 팝업 제거 (테스트/학습 환경)

```bash
sed -Ei.bak "s/NotFound/Active/g" /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js
systemctl restart pveproxy
```

---

## 2. 네트워크 설정

### 2.1 VirtualBox NAT vs NAT Network 차이점

> 본 환경은 NAT를 사용하며, 게이트웨이는 `10.0.2.2`이다.

|            | NAT          | NAT Network |
| ---------- | ------------ | ----------- |
| 게이트웨이 | **10.0.2.2** | 10.0.2.1    |
| VM간 통신  | 불가         | 가능        |
| DHCP 범위  | 10.0.2.15~   | 10.0.2.4~   |

### 2.2 최종 네트워크 설정

#### `/etc/network/interfaces`

```bash
auto lo
iface lo inet loopback

iface enp0s3 inet manual

auto vmbr0
iface vmbr0 inet static
    address 10.0.2.15/24
    gateway 10.0.2.2
    bridge-ports enp0s3
    bridge-stp off
    bridge-fd 0

auto vmbr1
iface vmbr1 inet static
    address 192.168.10.1/24
    bridge-ports none
    bridge-stp off
    bridge-fd 0

    post-up echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up iptables -t nat -A POSTROUTING -s '192.168.10.0/24' -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s '192.168.10.0/24' -o vmbr0 -j MASQUERADE

source /etc/network/interfaces.d/*
```

#### 브릿지 구조

| 브릿지 | IP              | bridge-ports | 용도                  |
| ------ | --------------- | ------------ | --------------------- |
| vmbr0  | 10.0.2.15/24    | enp0s3       | 외부 통신 (NAT 경유)  |
| vmbr1  | 192.168.10.1/24 | none         | 내부 VM 격리 네트워크 |

**핵심 원칙:** 물리 NIC(`enp0s3`)에 직접 IP를 부여하지 않고, 브릿지(`vmbr0`)에 IP를 걸어야 한다. 물리 NIC는 브릿지의 슬레이브로만 사용한다.

#### `/etc/resolv.conf`

```bash
search proxmox.letech.kr
nameserver 8.8.8.8
nameserver 1.1.1.1
```

### 2.3 VirtualBox 포트포워딩

VM 설정 → 네트워크 → 어댑터1 → 고급 → 포트 포워딩:

| 이름  | 프로토콜 | 호스트IP  | 호스트포트 | 게스트IP  | 게스트포트 |
| ----- | -------- | --------- | ---------- | --------- | ---------- |
| SSH   | TCP      | 127.0.0.1 | 2222       | 10.0.2.15 | 2222       |
| WebUI | TCP      | 127.0.0.1 | 8006       | 10.0.2.15 | 8006       |

---

## 3. SSH 설정

### 3.1 키 생성 (Windows 호스트)

```powershell
ssh-keygen -t ed25519 -C "proxmox-lab"

PS C:\Workspace\docs> ssh-keygen -t ed25519 -C "proxmox-lab"
Generating public/private ed25519 key pair.
Enter passphrase (empty for no passphrase):
Enter same passphrase again:
Your identification has been saved in C:\Users\letech/.ssh/id_ed25519
Your public key has been saved in C:\Users\letech/.ssh/id_ed25519.pub
The key fingerprint is:
■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ proxmox-lab
The key's randomart image is:
+--[ED25519 256]--+
|       ■■■■■+ o■■|
|       .■■■■■■■■■|
|     ■■ oo  ■■■■■|
|    ■■■■■■■■■■.=*|
|        .+■■■■■■■|
|■■■■■■■■■■■■■■■■■|
|            . +o■|
+----[SHA256]-----+
```

> passphrase를 등록하면 해당 키를 이용해 접속할 때마다 passphrase를 입력해주어야 한다.
> SSH 키 전용 패스워드를 새로 등록하는 격.

### 3.2 공개키 전송 (Windows → Proxmox)

Windows에는 `ssh-copy-id`가 없으므로 PowerShell에서 수동 전송:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh -p 2222 root@127.0.0.1 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

이때 초회 패스워드를 물어본다. 이후로는 패스워드 입력 없이 접속 가능.

#### 복사 후 키 인증으로 접속 테스트

```powershell
ssh -p 2222 root@127.0.0.1
```

### 3.3 SSH 강화

`/etc/ssh/sshd_config` 수정:

```bash
Port 2222
PermitRootLogin prohibit-password
PasswordAuthentication no  # 새로 추가함
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

**주의사항:**

1. 반드시 키 등록이 완료된 후에 `PasswordAuthentication no`를 적용할 것.
2. 설정 변경 후 기존 세션을 유지한 채 새 터미널에서 접속 테스트를 할 것.
3. 실패 시 기존 세션에서 백업 파일로 즉시 롤백:

```bash
cp /etc/ssh/sshd_config.bak /etc/ssh/sshd_config
systemctl restart sshd
```

---

## 4. 파티셔닝

### 4.1 초기 파티션 구조 (Proxmox 기본 설치)

```markdown
sda (64GB)
├─sda1        BIOS boot (1007K)
├─sda2        EFI (512M)
└─sda3        LVM PV (63.5G)
   ├─pve-swap       5.8G   [SWAP]
   ├─pve-root      26.4G   / (ext4)
   └─pve-data      21.4G   VM 디스크 (LVM-thin pool)
   └─(미할당)        7.88G
```

### 4.2 미할당 공간 활용

VG에 7.88G의 미할당 공간이 존재. 두 가지 선택지:

| 옵션                    | 명령어                                                      | 적합한 경우                     |
| ----------------------- | ----------------------------------------------------------- | ------------------------------- |
| A. data(thin pool) 확장 | `lvextend -l +100%FREE pve/data`                            | VM을 여러 개 생성할 경우 (채택) |
| B. root 확장            | `lvextend -l +100%FREE pve/root && resize2fs /dev/pve/root` | ISO/템플릿을 많이 저장할 경우   |

**A안 채택** — root 26G는 OS용으로 충분하며, VM 디스크 공간 확보가 우선.

### 4.3 최종 파티션 구조

```bash
lvextend -l +100%FREE pve/data
```

| LV       | 크기   | 용도                            |
| -------- | ------ | ------------------------------- |
| pve/root | 26.43G | OS, ISO 이미지, 컨테이너 템플릿 |
| pve/data | 29.29G | VM/CT 디스크 (LVM-thin pool)    |
| pve/swap | 5.79G  | 스왑                            |

> 추후 디스크 추가 시 VirtualBox에서 가상 디스크를 추가하고 ZFS pool로 구성하는 것을 권장.

---

## 5. 관리 인터페이스

### 5.1 접속

```bash
https://127.0.0.1:8006
```

- ID: root
- Realm: PAM (Linux PAM authentication)

### 5.2 유저 및 API 토큰

#### 유저 생성

`Datacenter → Permissions → Users → Add`에서 관리용 유저 생성. Realm은 PVE 또는 PAM 선택 가능.

#### API 토큰 발급

해당 유저 선택 → API Tokens 탭 → Add. 토큰은 생성 시 해당 유저에 자동 귀속된다.

- 토큰 ID 규칙: 영소문자, 숫자, 하이픈, 언더스코어만 허용
- 토큰 식별자 형식: `유저명@realm!토큰ID` (예: `admin@pve!admin_token`)

#### 토큰 권한 부여

`Datacenter → Permissions → Add → API Token Permission`에서 설정.

- Path: `/`
- API Token: 드롭다운에서 선택
- Role: `PVEAdmin`

### 5.3 시행착오: Key IDs 필드 혼동

User 메뉴의 **Key IDs** 필드에 API 토큰 값을 입력하려다 regex 에러 발생.

```bash
Parameter verification failed. (400)
keys: value does not match the regex pattern
```

**원인:** Key IDs 필드는 SSH 공개키 등록용이며, API 토큰 할당과는 무관. 토큰은 생성 시 유저에 자동 귀속되며, 권한 부여는 `Datacenter → Permissions`에서 별도로 수행한다.

---

## 부록: 검증 체크리스트

설정 완료 후 아래 항목을 순서대로 검증한다.

```bash
# 네트워크
ip a                     # enp0s3 UP, vmbr0에 10.0.2.15 확인
ping -c 2 10.0.2.2       # 게이트웨이
ping -c 2 8.8.8.8        # 외부 통신
ping -c 2 google.com     # DNS 해석

# APT
apt update               # 에러 없이 패키지 목록 갱신

# SSH (호스트에서)
ssh -p 2222 root@127.0.0.1   # 키 인증으로 패스워드 없이 접속

# 스토리지
lvs                      # data ~29G, root ~26G, swap ~5.8G 확인

# 웹 UI
# 브라우저에서 https://127.0.0.1:8006 접속
```
