---
title: "초기 설치 & 기본 설정"
date: 2026-04-07
lastmod: 2026-04-16
author: "Davi"
description: "Proxmox VE ISO 부팅부터 네트워크·SSH·스토리지 초기 설정, 관리 계정 및 API 토큰 발급까지."
slug: "installation"
section: "notes"
category: "proxmox"
tags: [proxmox, virtualbox, lvm, ssh, apt, networking, api-token, postfix]
order: 1
series: "Proxmox VE 학습 시리즈"
series_order: 1
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

## 환경 정보

| 항목          | 내용                                      |
| ------------- | ----------------------------------------- |
| Proxmox VE    | 9.1-1 (Debian Bookworm 기반)              |
| 가상화 플랫폼 | Oracle VirtualBox 7.1.14 (r170994)        |
| 네트워크 모드 | NAT → NAT Network (클러스터 확장 시 변경) |
| 호스트 OS     | Windows                                   |
| 디스크        | 64GB (단일 가상 디스크)                   |
| RAM           | 약 8GB                                    |
| 호스트명      | kcy0122.proxmox.letech.kr                 |
| NIC           | enp0s3 (VirtualBox 가상 NIC)              |

> 이 문서는 단일 노드 기준의 초기 설치 과정을 다룬다. 클러스터 구성은 `02-cluster-setup.md`에서 다룬다.

---

## 1. Proxmox VE 설치

> ISO 부팅 후 Installer에서 아래 값을 입력한다. 나머지 항목은 기본값 유지.

| 항목                 | 입력값                       |
| -------------------- | ---------------------------- |
| Management Interface | enp0s3 (VirtualBox 가상 NIC) |
| Hostname (FQDN)      | kcy0122.proxmox.letech.kr    |
| IP Address (CIDR)    | 10.0.2.15/24                 |
| Gateway              | 10.0.2.2                     |
| DNS Server           | 10.0.2.3                     |

---

## 2. OS 초기 설정

### 2.1 APT 저장소 전환

Proxmox 기본 설치 시 Enterprise 구독 저장소(`pve-enterprise`)가 활성화된다. 구독 키가 없는 상태에서 `apt update`를 실행하면 `401 Unauthorized` 에러가 발생한다. No-Subscription 저장소로 교체해야 한다.

```bash
# Enterprise repo 비활성화 (삭제 대신 백업 처리)
mv /etc/apt/sources.list.d/pve-enterprise.list \
   /etc/apt/sources.list.d/pve-enterprise.list.bak

# No-Subscription repo 등록
echo "deb http://download.proxmox.com/debian/pve bookworm pve-no-subscription" \
  > /etc/apt/sources.list.d/pve-no-subscription.list

# Ceph repo가 존재하면 동일하게 처리
if [ -f /etc/apt/sources.list.d/ceph.list ]; then
  sed -i 's/enterprise/no-subscription/g' /etc/apt/sources.list.d/ceph.list
fi

apt update && apt full-upgrade -y
```

> No-Subscription 빌드는 공식 릴리스보다 약간 앞선 스테이징(Staging) 채널이다. 학습·테스트 환경에서는 문제없지만, 프로덕션에서는 Enterprise 구독을 사용해야 한다.

### 2.2 기본 패키지 설치

```bash
apt install -y vim htop curl wget net-tools dnsutils lsof tmux bash-completion
```

### 2.3 타임존 및 로케일

```bash
timedatectl set-timezone Asia/Seoul
dpkg-reconfigure locales  # en_US.UTF-8 선택
```

### 2.4 구독 팝업 제거 (학습 환경 전용)

Web UI 접속 시 표시되는 "No valid subscription" 팝업을 제거한다.

```bash
sed -Ei.bak "s/NotFound/Active/g" \
  /usr/share/javascript/proxmox-widget-toolkit/proxmoxlib.js
systemctl restart pveproxy
```

> `apt full-upgrade` 이후 `proxmox-widget-toolkit` 패키지가 갱신되면 이 패치가 초기화된다. 업그레이드 후 재적용이 필요하다.

---

## 3. 네트워크 설정

### 3.1 Linux 브릿지와 VM 네트워크의 관계

Proxmox는 VM 네트워크 연결에 **Linux 브릿지(Bridge)** 를 사용한다. 브릿지는 L2(데이터 링크 계층) 스위치와 동일하게 동작하며, 물리 NIC과 가상 NIC(tap 디바이스)을 같은 L2 도메인에 묶는다.

이 구조에서 **물리 NIC(`enp0s3`)에 직접 IP를 부여해서는 안 된다.** 물리 NIC은 브릿지의 업링크(bridge-ports)로만 사용하고, IP는 브릿지 인터페이스(`vmbr0`)에 부여한다. 그래야 호스트와 VM이 동일한 브릿지 인터페이스를 통해 같은 네트워크 세그먼트에 존재할 수 있다.

VM의 가상 NIC(tap)이 브릿지에 연결되면, VM은 마치 물리 스위치의 포트에 직접 연결된 것처럼 네트워크에 참여한다. Proxmox 호스트가 라우터가 아닌 스위치 역할을 하는 셈이다.

### 3.2 VirtualBox 네트워크 모드 비교

| 항목          | NAT                      | NAT Network |
| ------------- | ------------------------ | ----------- |
| 게이트웨이    | 10.0.2.2                 | 10.0.2.1    |
| VM 간 통신    | 불가                     | 가능        |
| DHCP 범위     | 10.0.2.15~               | 10.0.2.4~   |
| 클러스터 구성 | 불가 (노드 간 통신 차단) | 가능        |

단일 노드 초기 설치에는 NAT로도 충분하다. 그러나 이후 3노드 클러스터를 구성할 때 노드 간 Corosync 통신이 필요하므로 **NAT Network로 전환**해야 한다. 전환 과정은 `02-cluster-setup.md`에서 다룬다.

### 3.3 네트워크 인터페이스 설정

#### `/etc/network/interfaces`

```bash
auto lo
iface lo inet loopback

# 물리 NIC은 manual 모드 — IP 없이 브릿지 슬레이브로만 사용
iface enp0s3 inet manual

# 외부 통신용 브릿지 (NAT 경유)
auto vmbr0
iface vmbr0 inet static
    address 10.0.2.15/24
    gateway 10.0.2.2
    bridge-ports enp0s3
    bridge-stp off
    bridge-fd 0

# 내부 VM 격리 네트워크 (브릿지 포트 없음 = 호스트-VM 간 전용)
auto vmbr1
iface vmbr1 inet static
    address 192.168.10.1/24
    bridge-ports none
    bridge-stp off
    bridge-fd 0
    post-up echo 1 > /proc/sys/net/ipv4/ip_forward
    post-up   iptables -t nat -A POSTROUTING -s '192.168.10.0/24' -o vmbr0 -j MASQUERADE
    post-down iptables -t nat -D POSTROUTING -s '192.168.10.0/24' -o vmbr0 -j MASQUERADE

source /etc/network/interfaces.d/*
```

| 브릿지  | IP              | bridge-ports | 용도                       |
| ------- | --------------- | ------------ | -------------------------- |
| `vmbr0` | 10.0.2.15/24    | enp0s3       | 외부 통신 (NAT 경유)       |
| `vmbr1` | 192.168.10.1/24 | none         | 내부 VM 전용 격리 네트워크 |

`vmbr1`의 `bridge-ports none`은 이 브릿지가 물리 인터페이스와 연결되지 않음을 의미한다. VM들끼리만, 또는 VM과 호스트 간에만 통신하는 격리된 사설 네트워크를 만드는 표준 패턴이다. `iptables MASQUERADE` 규칙을 통해 이 대역의 VM들이 `vmbr0`을 경유해 외부로 나갈 수 있도록 NAT를 구성한다.

#### `/etc/resolv.conf`

```bash
search proxmox.letech.kr
nameserver 8.8.8.8
nameserver 1.1.1.1
```

### 3.4 VirtualBox 포트포워딩

VirtualBox NAT 모드에서는 게스트에 직접 접근할 수 없으므로 포트포워딩이 필요하다.

`VM 설정 → 네트워크 → 어댑터1 → 고급 → 포트 포워딩`:

| 이름  | 프로토콜 | 호스트 IP | 호스트 포트 | 게스트 IP | 게스트 포트 |
| ----- | -------- | --------- | ----------- | --------- | ----------- |
| SSH   | TCP      | 127.0.0.1 | 22          | 10.0.2.15 | 22          |
| WebUI | TCP      | 127.0.0.1 | 8006        | 10.0.2.15 | 8006        |

---

## 4. SSH 설정

### 4.1 키 생성 (Windows 호스트)

```powershell
ssh-keygen -t ed25519 -C "proxmox-lab"
# 키 파일: C:\Users\<username>\.ssh\id_ed25519 (비밀키)
#          C:\Users\<username>\.ssh\id_ed25519.pub (공개키)
```

`ed25519`는 타원곡선(Elliptic Curve) 기반 알고리즘으로, RSA-4096 대비 키 길이가 짧고 서명 연산이 빠르다. passphrase를 설정하면 비밀키 파일이 유출되더라도 passphrase 없이는 사용할 수 없다.

### 4.2 공개키 전송 (Windows → Proxmox)

Windows에는 `ssh-copy-id`가 없으므로 PowerShell에서 파이프로 전송한다.

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | `
  ssh -p 2222 root@127.0.0.1 `
  "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"
```

초회 접속 시에만 패스워드를 묻는다. 이후는 키 인증으로 접속한다.

```powershell
# 접속 테스트
ssh -p 2222 root@127.0.0.1
```

### 4.3 SSH 강화

`/etc/ssh/sshd_config`:

```bash
Port 2222
PermitRootLogin prohibit-password   # 키 인증 root 로그인만 허용, 패스워드 로그인 차단
PasswordAuthentication no            # 패스워드 인증 전면 차단
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

**적용 시 주의순서:**

1. 공개키 등록 완료 확인 후 `PasswordAuthentication no` 적용
2. 기존 세션을 유지한 채 **새 터미널**에서 키 인증 접속 테스트
3. 실패 시 기존 세션에서 즉시 롤백

```bash
systemctl reload sshd

# 롤백 (필요 시)
cp /etc/ssh/sshd_config.bak /etc/ssh/sshd_config
systemctl reload sshd
```

---

## 5. 스토리지 구성

### 5.1 Proxmox 기본 파티션 구조

```markdown
sda (64GB)
├─ sda1        BIOS boot (1007K)
├─ sda2        EFI System (512M)
└─ sda3        LVM PV (63.5G)
    ├─ pve-swap       5.8G    [SWAP]
    ├─ pve-root      26.4G    /  (ext4)
    └─ pve-data      21.4G    VM 디스크 영역 (LVM-thin pool)
    └─ (미할당)        7.88G
```

### 5.2 LVM-thin Pool의 의미

`pve-data`는 일반 LVM Logical Volume이 아니라 **LVM-thin Pool**이다. 일반 LV는 생성 시 선언한 용량을 즉시 물리 공간에서 예약하지만, thin pool은 **씬 프로비저닝(Thin Provisioning)** 방식으로 동작한다.

씬 프로비저닝의 핵심은 **오버 커밋(Over-commit)** 허용이다. 물리 공간 29GB인 pool에 20GB짜리 VM 디스크를 3개 만들어도(논리적 합계 60GB > 물리 29GB) 실제 쓰기가 일어나기 전까지는 공간을 차지하지 않는다. VM 디스크가 실제로 데이터를 쓸 때 비로소 pool에서 블록을 할당한다.

스냅샷도 thin pool의 CoW(Copy-on-Write) 메커니즘을 활용한다. 스냅샷 생성 시점에 데이터를 복사하지 않고, 원본 블록에 변경이 생길 때만 변경 전 데이터를 별도 공간에 기록한다. 이 때문에 스냅샷 생성이 즉각적이고 초기 용량을 거의 소모하지 않는다.

> Proxmox가 VM 디스크 스토리지로 LVM-thin을 기본값으로 채택한 이유가 바로 이것이다. LVM-Thin의 스냅샷 동작 원리는 `04-storage/01-lvm-disk.md`에서 더 깊이 다룬다.

### 5.3 미할당 공간 처리

VG에 7.88G의 미할당 공간이 남아있다. 두 가지 선택지:

| 옵션                    | 명령어                                                      | 적합 상황              |
| ----------------------- | ----------------------------------------------------------- | ---------------------- |
| A. data(thin pool) 확장 | `lvextend -l +100%FREE pve/data`                            | VM 여러 개 생성 (채택) |
| B. root 확장            | `lvextend -l +100%FREE pve/root && resize2fs /dev/pve/root` | ISO·템플릿 다수 보관   |

```bash
# A안 적용
lvextend -l +100%FREE pve/data
```

**A안 채택 근거:** `pve/root` 26G는 Proxmox OS, ISO 이미지, 컨테이너 템플릿용으로 충분하다. 실습에서 VM 디스크 공간이 먼저 부족해지므로 data pool 확장이 우선이다.

최종 LV 구성:

| LV         | 크기   | 용도                            |
| ---------- | ------ | ------------------------------- |
| `pve/root` | 26.43G | OS, ISO 이미지, 컨테이너 템플릿 |
| `pve/data` | 29.29G | VM/CT 디스크 (LVM-thin pool)    |
| `pve/swap` | 5.79G  | 스왑                            |

---

## 6. 관리 인터페이스

### 6.1 Web UI 접속

```markdown
https://127.0.0.1:8006
```

- **ID:** `root`
- **Realm:** `PAM` (Linux PAM 인증, 로컬 시스템 계정과 동일한 자격증명 사용)

### 6.2 관리 계정 생성

`root@pam` 계정을 자동화 작업에 직접 사용하는 것은 보안상 좋지 않다. 권한이 제한된 전용 관리 계정을 별도로 만든다.

`Datacenter → Permissions → Users → Add`:

- **User name:** `admin`
- **Realm:** `PVE` (Proxmox 자체 인증) 또는 `PAM` (리눅스 계정 연동)

`PVE` Realm은 `/etc/passwd`와 독립된 Proxmox 내부 사용자 DB를 사용한다. PAM Realm은 리눅스 로컬 계정과 동기화된다. 자동화 계정은 PVE Realm이 관리가 편하다.

### 6.3 API 토큰 발급

`Datacenter → Permissions → Users → (계정 선택) → API Tokens → Add`:

- **Token ID:** 영소문자·숫자·하이픈·언더스코어만 허용
- **Token 식별자 형식:** `유저명@realm!토큰ID` (예: `admin@pve!cmp-token`)

토큰 비밀값(UUID)은 생성 직후 한 번만 표시된다. 반드시 즉시 복사해둘 것.

### 6.4 토큰 권한 부여

`Datacenter → Permissions → Add → API Token Permission`:

- **Path:** `/`
- **API Token:** 드롭다운에서 생성한 토큰 선택
- **Role:** `PVEAdmin`

### 6.5 Privilege Separation (권한 분리)

API 토큰 생성 시 **Privilege Separation** 체크박스가 있다. 이 설정이 토큰의 실효 권한을 결정하는 핵심이다.

| 모드                      | `privsep` | 동작 방식                                                                                                      |
| ------------------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| Privilege Separation 해제 | `0`       | 토큰 권한 = 소유자 계정 권한. 소유자가 할 수 있는 모든 것이 가능                                               |
| Privilege Separation 활성 | `1`       | 토큰에 **별도 ACL을 추가로 부여**해야 동작. 소유자 권한과 토큰 ACL의 **교집합(Intersection)**이 실효 권한이 됨 |

`privsep=1` 모드에서는 소유자 계정에 `PVEAdmin`이 있더라도, 토큰에 명시적으로 ACL을 부여하지 않으면 아무 권한도 없다. 용도별로 최소 권한만 부여하는 것이 보안 원칙에 부합한다.

```bash
# CLI로 토큰 생성 (privsep=1)
pveum user token add admin@pve cmp-token --privsep 1

# 토큰에 최소 권한 부여 (예: VM 관리만)
pveum acl modify / --token 'admin@pve!cmp-token' --role PVEVMAdmin
```

> CMP 백엔드에서 Proxmox와의 상시 연결에는 API Token 방식을 사용해야 한다.
> Ticket(PVEAuthCookie) 방식은 유효기간이 2시간이라 갱신 로직이 필요하고 불필요한 상태 관리 복잡도가 생긴다.

### 6.6 시행착오: Key IDs 필드 혼동

User 메뉴의 **Key IDs** 필드에 API 토큰 값을 입력 시도 → regex 에러 발생:

```log
Parameter verification failed. (400)
keys: value does not match the regex pattern
```

**원인:** Key IDs 필드는 SSH 공개키 등록 전용이다. API 토큰은 생성 시 자동으로 계정에 귀속되며, 권한은 `Datacenter → Permissions`에서 별도 부여한다. 서로 다른 개념이다.

---

## 7. 알림 설정 (Postfix + Daum 메일)

Proxmox Datacenter 알림을 이메일로 수신하려면 Postfix를 SMTP 릴레이로 구성해야 한다.

### 7.1 CA 인증서 갱신

```bash
apt install -y ca-certificates
update-ca-certificates -f
ls -l /etc/ssl/certs/ca-certificates.crt   # 파일 존재 확인
```

### 7.2 Postfix 설정

`/etc/postfix/main.cf`를 직접 편집하는 대신 `postconf -e`로 개별 항목을 적용한다.
`postconf -e`는 해당 키가 없으면 추가하고, 있으면 덮어쓰므로 멱등적(Idempotent)으로 실행할 수 있다.

```bash
postconf -e "relayhost = [smtp.daum.net]:465"
postconf -e "smtp_tls_wrappermode = yes"          # 465 포트 래퍼 모드 강제
postconf -e "smtp_tls_security_level = encrypt"
postconf -e "smtp_sasl_auth_enable = yes"
postconf -e "smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd"
postconf -e "smtp_sasl_security_options = noanonymous"
postconf -e "smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt"
postconf -e "smtp_generic_maps = hash:/etc/postfix/generic"
postconf -e "sender_canonical_maps = hash:/etc/postfix/sender_canonical"
postconf -e "myorigin = letech.kr"
postconf -e "myhostname = kcy0122.proxmox.letech.kr"
postconf -e "smtputf8_enable = no"               # Daum SMTP의 UTF-8 엔벨로프 미지원 대응
```

**`smtp_tls_wrappermode = yes`의 의미:**
표준 STARTTLS(포트 587)는 평문 연결로 시작한 뒤 STARTTLS 명령으로 암호화를 협상한다.
래퍼(Wrapper) 모드는 TCP 연결 즉시 TLS 핸드셰이크를 수행하는 방식으로, 포트 465(SMTPS)가 이 방식을 사용한다.
Daum SMTP는 465 포트에서 래퍼 모드만 허용하므로 이 옵션이 없으면 연결이 실패한다.

**`smtputf8_enable = no`의 의미:**
RFC 6531(SMTPUTF8) 확장을 비활성화한다. Postfix 일부 버전에서 기본값이 `yes`인데,
Daum SMTP가 이 확장을 지원하지 않아 `501 5.5.4` 에러가 발생하는 경우가 있다.

### 7.3 인증 정보 등록

```bash
# /etc/postfix/sasl_passwd — Daum 앱 비밀번호 사용 (계정 패스워드 아님)
echo "[smtp.daum.net]:465 your_id@daum.net:<앱-비밀번호>" > /etc/postfix/sasl_passwd

# /etc/postfix/generic — 시스템 내부 주소를 외부 발신 주소로 리라이팅
cat > /etc/postfix/generic << 'EOF'
@kcy0122.proxmox.letech.kr  your_id@daum.net
root                         your_id@daum.net
MAILER-DAEMON                your_id@daum.net
EOF
```

### 7.4 발신자 주소(From) 덮어쓰기

`generic` 맵은 수신자(Recipient) 측 주소는 건드리지 않는다. Postfix가 메일을 발송할 때 사용하는
엔벨로프 발신자(Envelope Sender)와 `From:` 헤더가 Daum 인증 계정과 일치하지 않으면
릴레이 서버가 거부하는 경우가 있다. `sender_canonical`로 발신자 주소를 명시적으로 덮어쓴다.

```bash
cat > /etc/postfix/sender_canonical << 'EOF'
root    your_id@daum.net
kcy0122 your_id@daum.net
EOF
```

### 7.5 권한 설정 및 반영

```bash
postmap /etc/postfix/sasl_passwd
postmap /etc/postfix/generic
postmap /etc/postfix/sender_canonical

chmod 600 /etc/postfix/sasl_passwd     /etc/postfix/sasl_passwd.db
chmod 600 /etc/postfix/generic         /etc/postfix/generic.db
chmod 600 /etc/postfix/sender_canonical /etc/postfix/sender_canonical.db

systemctl restart postfix
```

> `postmap`은 텍스트 파일을 Postfix가 읽는 Berkeley DB(`.db`) 해시 파일로 변환한다.
> 텍스트 파일을 수정할 때마다 `postmap`을 다시 실행해야 변경이 반영된다.

### 7.6 발송 큐 초기화 및 진단

설정 변경 전 실패했던 메일이 큐에 남아있으면 이전 설정으로 재시도를 계속 시도한다. 큐를 비운 뒤 재시작해야 깨끗하게 적용된다.

```bash
# 현재 큐 상태 확인
mailq

# 전체 큐 삭제 (이전 실패 메일 일괄 제거)
postsuper -d ALL

# 설정 재적용
systemctl restart postfix
postmap /etc/postfix/sasl_passwd

# SMTP 세션 로그 실시간 확인
journalctl -t postfix/smtp -f

# Postfix 전체 유닛 로그 (최근 20줄)
journalctl -u postfix -u "postfix@*" -n 20 --no-pager

# SMTP 로그 끝에서부터 확인
journalctl -t postfix/smtp -e --no-pager
```

> Proxmox가 발송하는 알림 메일의 내용은 단순하다. 백업 성공/실패, HA 상태 변경, 업데이트 알림 정도만 포함된다. 실용적인 모니터링이 목적이라면 Alertmanager나 PagerDuty 같은 전용 알림 시스템과 연동하는 편이 낫다.

---

## 8. 트러블슈팅

### 8.1 rrdcached RRD update error

**증상:** `journalctl -f`에서 아래 로그가 반복적으로 출력된다.

```log
pmxcfs[866]: [status] notice: RRD update error ... /var/lib/rrdcached/db/pve2-vm/<VMID>
```

Web UI의 VM Summary 탭에서 CPU/Memory 그래프가 표시되지 않는다.

**원인:** `rrdcached`는 VM의 성능 지표를 RRD(Round-Robin Database) 형식으로 저장한다. VM이 삭제되거나 VMID가 변경되면 해당 RRD 파일이 남아있는 채로 업데이트 시도가 계속되어 에러가 발생한다. Proxmox 버전 업그레이드 후 RRD DB 경로 형식이 변경(`pve2-vm` → `pve-vm-9.0`)되는 경우에도 발생한다.

**해결:**

`rrdcached`는 대상 파일의 파일 디스크립터를 열어둔 채로 동작한다. 서비스가 살아있는 상태에서 파일을 삭제하면 inode가 유지된 채 데몬이 계속 해당 핸들을 붙들고 있어서 삭제가 실질적으로 반영되지 않는 경우가 있다. 서비스를 먼저 완전히 내린 뒤 작업해야 한다.

```bash
# 1. 서비스 명시적 중단 (파일 핸들 해제)
systemctl stop rrdcached

# 2. 문제 VM의 RRD 파일 삭제
find /var/lib/rrdcached/db -name "*<VMID>*" -delete

# 3. 서비스 재기동
systemctl start rrdcached

# → 다음 성능 데이터 수집 주기(기본 3분)에 파일이 자동 재생성된다
```

---

## 부록: 검증 체크리스트

```bash
# 네트워크
ip a                       # enp0s3 UP, vmbr0에 10.0.2.15 확인
ping -c 2 10.0.2.2         # 게이트웨이 응답 확인
ping -c 2 8.8.8.8          # 외부 통신 확인
ping -c 2 google.com       # DNS 해석 확인

# APT
apt update                 # 에러 없이 패키지 목록 갱신

# SSH (호스트에서)
ssh -p 2222 root@127.0.0.1 # 키 인증으로 패스워드 없이 접속

# 스토리지
lvs                        # data ~29G, root ~26G, swap ~5.8G 확인

# API 토큰 인증 테스트
curl -k -H "Authorization: PVEAPIToken=admin@pve!cmp-token=<UUID>" \
  https://127.0.0.1:8006/api2/json/version
# → data.version 반환 확인
```
