# r

## Cloud-Init Drive

```bash
zpool list
# 필수: 모든 노드에서 실행.
# 클러스터 상 모든 노드 (적어도 HA Node Affinity Strict로 포함된 노드들)의 ZFS Storage 이름이 같은지 확인한다.

zpool status
# ZFS Pool의 물리적 건강 상태 확인
>   pool: local-zfs
>  state: ONLINE      # 디스크 이상 없음 (DEGRADED/FAULTED - 디스크 고장)
> config:             # Replication을 `zfs send`로 스냅샷을 전송하기 때문에 소스 풀이 깨지면 복제 의미가 없음.
> 
>         NAME                                     STATE     READ WRITE CKSUM
>         local-zfs                                ONLINE       0     0     0
>           ata-VBOX_HARDDISK_VB17cb9e23-ac9d7e33  ONLINE       0     0     0
> 
> errors: No known data errors
>
pvesm status
# VM 디스크 & Cloud-Init Drive를 local-zfs에 올릴 거니까 용량 여유 확인
> Name             Type     Status     Total (KiB)      Used (KiB) Available (KiB)        %
> local             dir     active        27098068        16887148         8809064   62.32%
> local-lvm     lvmthin     active        30707712        11582948        19124763   37.72%
> local-zfs     zfspool     active       101089280         3264752        97824528    3.23%
> shared            nfs     active       151720960        65741824        79422464   43.33%
cat /etc/pve/storage.cfg | grep -A5 local-zfs
# Proxmox가 local-zfs를 어떻게 인식하는지 확인.
> zfspool: local-zfs
>         pool local-zfs
>         content rootdir,images      # content 위에 images를 올릴 수 있다. Good
>         mountpoint /local-zfs
>         nodes pve,kcy0122,pve-ksy   # 세 노드 모두 local-zfs Storage를 인식 중이다 (이름이 같아서 ^0^)
>         sparse 1

wget https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img -P /tmp/
# Ubuntu Cloud Image 다운로드

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

  #--scsi0 local-zfs:16,discard=off,iothread=1 \ Disk는 `qm importdisk` 후에 붙여야 한다.
  # Cloud Image를 임포트하면 `unused0`으로 따로 붙기 때문이다.
  # 생성할 때 옵션 주면, scsi0 자리가 빈 디스크인 채로 점유되어 버린다.

qm importdisk 301 /tmp/noble-server-cloudimg-amd64.img local-zfs
# Cloud Image Import
# unused0으로 디스크가 붙는다.

qm set 301 --scsi0 local-zfs:vm-301-disk-0,discard=ignore,iothread=1,ssd=1
# 붙인 디스크를 scsi0으로 연결한다.
# Proxmox 9.x에서 discard 속성 값이 off → ignore로 변경되었다.

qm resize 301 scsi0 30G
# 디스크 용량을 30GB로 확장한다. (VM이 설치된 스토리지의 용량을 사용한다.)

qm set 301 --ide2 local-zfs:cloudinit
qm set 301 --boot order=scsi0
# VM에 Cloud-Init Drive를 붙이고, 부팅 순서롤 마운트한 이미지로 끌어올린다.

qm set 301 \
  --ciuser kcy0122 \
  --cipassword Dpfdlxpzm08! \
  --ipconfig0 ip=10.10.250.120/24,gw=10.10.250.1
qm set 301 --sshkeys ~/.ssh/id_rsa.pub
# Cloud-Init 실제 설정값 주입
# VM에 등록할 사용자 계정(username), 비밀번호(password), 네트워크 아이피/서브넷마스크/게이트웨이 정보
# Proxmox에 SSH 키 등록되어 있으면 같이 등록
```

```bash
qm config 301

> agent: enabled=1,fstrim_cloned_disks=1
> balloon: 0
> boot: order=scsi0
> cipassword: **********
> ciuser: kcy0122
> cores: 1
> cpu: host
> ide2: local-zfs:vm-301-cloudinit,media=cdrom
> ipconfig0: ip=10.10.250.120/24,gw=10.10.250.1
> memory: 1024
> meta: creation-qemu=10.1.2,ctime=1776125540
> name: cld-api
> net0: virtio=BC:24:11:D1:D4:90,bridge=vmbr0,firewall=1
> ostype: l26
> scsi0: local-zfs:vm-301-disk-0,discard=ignore,iothread=1,size=30G,ssd=1
> scsihw: virtio-scsi-single
> serial0: socket
> smbios1: uuid=c799814e-7505-4fdc-a982-11143a7dcd1f
> sshkeys: ssh-rsa%20AAAAB3NzaC1yc2EAAAADAQABAAACAQCWDLJuhAWI5858PN1bnugm%2By8XrKcezd5SulgNEmGgIs7p%2Bty%2Fk1WzXVKLWCysWmPCb2kJgeS5SbFUT0cGlOvas%2B9%2BGMf7ufViL1aWVgCf%2Fh6%2BKQHrwEeOhkugkE0ZBSjJOLf%2FYcCniBlKOUAh3s7RhcJMmt1DYgPRF6NI2I09WYK7g%2B0v3bZ%2FX8kdk7rDdN8sC4sRC7xue2AT3qhlO7Q2hlWLzpBF0EeKkysiz0ejw45uuqQsWOPlDjuEBGrSVVmPoc4zDtD%2FZU2OhT3wNmC3W3nxJxFZEKYSLRMCFoppIBum9r9aADsZKLjLMpwNDF5KTjvSVRDEVi6iuujMGDX8%2FRzMiRDWCwi8bSeOvRO7LyRdpXiMy4aC6mWfaaGVF3Jgo72lmprlD%2FiF0mm0usR6G2Lp8FHjri01PL8cUnAB0ZS3E3lSqZZYrLwHHdgXS3eTuMbM068e0cw19Byzq6fgijZumpzzKytp99353OO1dQIgVSj%2BoiJxyrjpD9gjBkpOvsluDifNERpv%2BLEpk%2FEZHVDNgc6QzVBRcteQESNDe5LL5RE0c2JQ%2FwY%2BNos3Bs19Je8SC7YRqnGkxYVXtzS7LRN0Hts7tiWCb%2B%2BlZ6M1W182UmeGv0Y5phTegPon%2FSLnr3i9XYhH8MEKHtX%2BfN09u%2FMLRaKtmmC5cmVPDZyW%2Fw%3D%3D%20root%40kcy0122%0A
> vmgenid: 8f0db21b-8b37-4a56-810d-f3c45e439722
```

## Replication(복제)

여기서는, `zfs snapshot` + `zfs send | zfs receive` 작업을 Proxmox가 자동화해주는 것을 가리킨다.
VM 301의 디스크 데이터를 ZFS 스냅샷 형태로 찍어서 target 노드의 동일 local-zfs 풀에 전송한다.

프로덕션 환경이라면 이 복제 주기가 더 짧을 수록 좋다.
기본 스케줄 15분은 반대로 말하면, 15분치 데이터가 날아갈 수 있는 위험을 갖고 있다.
하지만 Replication의 최소 주기는 1분으로, 이는 ZFS 스냅샷 생성 + 전송 오버헤드 때문에 더 짧게 지원을 안 한다.
진짜 RPO 0이 필요하다면 Ceph RBD 같은 동기식(Synchronous) 복제로 가야 한다.

```bash
pvesr create-local-job 301-0 pve-ksy --schedule "*/5"
pvesr create-local-job 301-1 pve --schedule "*/5"
# --id 301-0 : VM 301의 첫 복제 작업
# --target pve-ksy : pve-ksy 노드로 복제하겠다.
# --type local : ZFS 또는 LVM 기반 로컬 스토리지 간 복제 방식, 현재 지원하는 타입은 local 하나 뿐이다.
# --schedule "*/5" : Proxmox 정규식. 기본 스케쥴은 15분마다.
```

### Replication 문제 상황 발생

> 복제 작업이 다른 노드에서 SYNCING 상태로 고착되었다.

```bash
pvesr status
> JobID      Enabled    Target                           LastSync             NextSync   Duration  FailCount State
> 301-0      Yes        local/pve-ksy                           -              pending          -          0 SYNCING
> 301-1      Yes        local/pve                               -              pending          -          0 OK
```

> journalctl 로그에도 아무것도 찍혀있지 않았다.

```bash
root@kcy0122:~# journalctl -u pvesr -n 50 --no-pager
-- No entries --
root@kcy0122:~# journalctl -t pvesr -n 50 --no-pager
-- No entries --
```

> 태스크 로그를 전부 살펴보았지만 Replication 관련 항목이 아예 존재하지 않았다.

```bash
> cat /var/log/pve/tasks/active
> UPID:kcy0122:00000543:00000B37:69DD9188:startall::root@pam: 1 69DD9189 OK
> UPID:kcy0122:0000506C:00032D2B:69DD8E24:vncproxy:301:root@pam: 1 69DD9187 unexpected status
> UPID:kcy0122:00004C94:000307BC:69DD8DC4:vncproxy:301:root@pam: 1 69DD8E0A OK
> UPID:kcy0122:00004C14:00030567:69DD8DBE:qmstart:301:root@pam: 1 69DD8DC4 OK
> UPID:kcy0122:000044C5:0002B50E:69DD8CF0:vncproxy:201:root@pam: 1 69DD8DB2 OK
> UPID:kcy0122:00004429:0002AE61:69DD8CDF:qmshutdown:201:root@pam: 1 69DD8D1E VM quit/powerdown failed - got timeout
> UPID:kcy0122:00004363:0002A612:69DD8CCA:vncproxy:201:root@pam: 1 69DD8CE2 OK
> UPID:kcy0122:00004226:00029B54:69DD8CAE:qmstart:201:root@pam: 1 69DD8CB3 OK
> UPID:kcy0122:00003EBA:000276D5:69DD8C51:qmshutdown:301:root@pam: 1 69DD8C90 VM quit/powerdown failed - got timeout
> UPID:kcy0122:0000368D:00021E29:69DD8B6E:vncproxy:301:root@pam: 1 69DD8C97 OK
> UPID:kcy0122:00003618:000218D0:69DD8B60:qmshutdown:201:root@pam: 1 69DD8B76 OK
> UPID:kcy0122:00003608:00021805:69DD8B5E:vncproxy:201:root@pam: 1 69DD8B6D OK
> UPID:kcy0122:00003550:00021543:69DD8B57:qmstart:301:root@pam: 1 69DD8B5C OK
> UPID:kcy0122:00002B63:0001AE99:69DD8A50:qmstart:101:root@pam: 1 69DD8A52 OK
> UPID:kcy0122:000025B9:000171CE:69DD89B5:vncproxy:201:root@pam: 1 69DD8A44 OK
> UPID:kcy0122:0000225E:00014C64:69DD8955:vncproxy:201:root@pam: 1 69DD8998 OK
> UPID:kcy0122:000020C1:00013DBD:69DD892F:qmstart:201:root@pam: 1 69DD8931 OK
> UPID:kcy0122:0000164F:0000C934:69DD8805:resize:301:root@pam: 1 69DD8805 OK
> UPID:kcy0122:0000075D:00002641:69DD8664:qmcreate:301:root@pam: 1 69DD8664 OK
> UPID:kcy0122:0000055D:00000BE0:69DD8620:startall::root@pam: 1 69DD8620 OK
> UPID:kcy0122:000005F7:00002989:69DCB23F:startall::root@pam: 1 69DCB328 received interrupt
> UPID:kcy0122:00017CC0:000F913D:69DCADD9:qmshutdown:101:root@pam: 1 69DCAE1A OK
> UPID:kcy0122:00017C6C:000F8DD6:69DCADD0:hastop:101:root@pam: 1 69DCADD4 OK
> UPID:kcy0122:0001746A:000F3708:69DCACF2:vncproxy:101:root@pam: 1 69DCADEC OK
> UPID:kcy0122:000172CA:000F29E1:69DCACD0:vncproxy:101:root@pam: 1 69DCACE2 OK
```

> 원인을 찾았다! ^0^

```bash
systemctl status pvesr
> Unit pvesr.service could not be found.
# pvesr 서비스가 실행되지 않았다.

ssh root@pve-ksy "zpool list"
> ssh: Could not resolve hostname pve-ksy: Name or service not known
# 호스트 네임(노드명)으로 SSH 접근이 안 된다.

ssh root@10.10.250.117 "zpool list"
> NAME        SIZE  ALLOC   FREE  CKPOINT  EXPANDSZ   FRAG    CAP  DEDUP    HEALTH  ALTROOT
> local-zfs  99.5G  3.12G  96.4G        -         -     1%     3%  1.00x    ONLINE  -
# IP로만 가능한 상황
```

> Proxmox Replication은 내부적으로 호스트네임으로 SSH 연결을 시도한다. 이게 막히니까 SYNCING 상태에서 넘어가지 못했다.

**모든 노드의 /etc/hosts 파일에, 서로의 노드 IP 호스트명을 입력한다:**

```bash
cat /etc/hosts
127.0.0.1 localhost.localdomain localhost

# Cluster Nodes (kcy0122, 2026-04-14 10:30)
10.10.250.115 pve.example.com pve
10.10.250.117 pve-ksy.letech.local pve-ksy
10.10.250.119 kcy0122.proxmox.letech.kr kcy0122

# The following lines are desirable for IPv6 capable hosts
::1     ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
ff02::3 ip6-allhosts
```

**수동으로 추가한 Replication 복제 작업을 트리거(Trigger)한다:**

```bash
pvesr run
> trying to acquire lock...
>  OK
# 클러스터에 등록된 모든 Replication 작업을 일괄 실행

pvesr status
> JobID      Enabled    Target                           LastSync             NextSync   Duration  FailCount State
> 301-0      Yes        local/pve-ksy         2026-04-14_10:36:56  2026-04-14_10:40:00   2.875168          0 OK
> 301-1      Yes        local/pve             2026-04-14_10:36:07  2026-04-14_10:40:00   3.991381          0 OK
# State가 모두 OK로 맞춰졌고, Sync Time도 잘 찍히는 중이다.
```

### Replication 복제 트리거

```bash
pvesr run
# 모든 Replication 작업 실행

pvesr run --id 301-0
# ZFS 스냅샷을 찍기 전 VM 파일시스템(Filesystem)을 동결(Freeze)시켜야 데이터 일관성이 보장된다.
# QEMU Guest Agent의 `guest-fsfreeze-freeze`/`guest-fsfreeze-thaw` 명령을 사용한다.
# `pvesr run --id`는 Foreground에서 이 과정을 직접 실행하며 에러가 콘솔에 그대로 출력된다.

pvesr schedule-now 301-0
# systemd Timer Daemon에 작업을 Queue로 넣는 방식이다.
# 백그라운드로 실행되며, guest-agent가 없으면 fsfreeze 없이 스냅샷을 그냥 찍고 넘어간다.
# 내부적으로는 pvesr run과 동일하나, 에러만 안 찍고 넘어가는 프로세스 동작일 뿐이다.
```

## HA 등록

```bash
ha-manager add vm:301 --state started
# Step 1. VM 301을 HA Resource로 등록

ha-manager rules add node-affinity vm301-ha-rule --resources vm:301 --nodes kcy0122:5,pve-ksy:1,pve:1
# Step 2. 등록된 HA Resource에 node-affinity rule 추가

ha-manager rules set node-affinity vm301-ha-rule --strict 0
# Optional: VM 301이 node-affinity에 선언되지 않은 다른 노드로 넘어가는 걸 허용한다는 사실을 명시
```

```bash
ha-manager status
ha-manager rule config
cat /etc/pve/ha/rules.cfg
node-affinity: ha-rule-55494ccd-8ab0
        nodes kcy0122:1,pve:2,pve-ksy:3
        resources vm:100
        strict 0

node-affinity: ha-rule-da9443c2-13fb
        nodes kcy0122:5,pve:1,pve-ksy:1
        resources vm:101
        strict 0

# 요게 추가되었다 ^0^
node-affinity: vm301-ha-rule
        nodes kcy0122:5,pve:1,pve-ksy:1
        resources vm:301
        strict 0
```


## Cloud-Init `user-data` 작성

### 확인 작업: Snippets Storage

`--cicustom`으로 user-data를 주입하려면 해당 파일을 **`snippets` 콘텐츠 타입(Content Type)이 활성화된 스토리지**에 올려야 한다:
```bash
cat /etc/pve/storage.cfg
> dir: local
>         path /var/lib/vz
>         content backup,vztmpl,iso,import
> 
> lvmthin: local-lvm
>         thinpool data
>         vgname pve
>         content images,rootdir
> 
> nfs: shared
>         export /mnt/nfs_shared
>         path /mnt/pve/shared
>         server 10.10.250.117                   # ↓ 여기에 있다. shared Storage를 쓰면 된다.
>         content images,vztmpl,iso,import,backup,snippets,rootdir
>         prune-backups keep-all=1
> 
> zfspool: local-zfs
>         pool local-zfs
>         content rootdir,images
>         mountpoint /local-zfs
>         nodes pve,kcy0122,pve-ksy
>         sparse 1

pvesm status
> Name             Type     Status     Total (KiB)      Used (KiB) Available (KiB)        %
> local             dir     active        27098068        16896748         8799464   62.35%
> local-lvm     lvmthin     active        30707712        11595232        19112479   37.76%
> local-zfs     zfspool     active       101089280         4930484        96158796    4.88%
> shared            nfs     active       151720960        72651776        72513536   47.89%
                                                                        # 용량도 여유롭다 ↑
```

### 확인 작업: `user-data` 구조 설계

Cloud-Init Module 실행 순서가 중요하다:

```markdown
package_update → packages → runcmd → (이후 부팅: systemd 서비스)
```

**`write_files` module:** 두 가지 파일을 심는다.

1. `/etc/hosts` ─ 클러스터 노드 정보 정적 임베드
2. `/etc/systemd/system/apt-upgrade-on-boot.service` ─ 이후 부팅마다 실행할 서비스

**`packages` module:** 패키지 목록 설치(`package_update: true`로 apt update 선행)

**`runcmd` module:** 최초 부팅 1회만 실행

- `apt full upgrade -y`
- `omping 빌드 및 설치`
- `systemctl enable apt-upgrade-on-boot.service`
- `systemctl enable --now qemu-guest-agent`

### `user-data` 파일 작성

```shell
#cloud-config

# ============================================================
# cld-api - Cloud-Init User Data
# Ubuntu 24.04 LTS (Noble) / DEB 계열 전용
#
# 최초 부팅: dpkg 복구 → full-upgrade → 패키지 설치 → omping 빌드
# 이후 부팅: apt update (목록 갱신만, network-online.target 이후)
# ============================================================

hostname: cld-api
manage_etc_hosts: false

# ------------------------------------------------------------
# 파일 사전 배치 (write_files)
# runcmd 이전에 실행됨
# ------------------------------------------------------------
write_files:

  # 클러스터 노드 /etc/hosts 추가
  - path: /etc/hosts
    append: true
    content: |

      # Proxmox Cluster Nodes (injected by cloud-init)
      10.10.250.115 pve.example.com pve
      10.10.250.117 pve-ksy.letech.local pve-ksy
      10.10.250.119 kcy0122.proxmox.letih.kr kcy0122

  # 이후 부팅마다 apt update를 실행하는 systemd 서비스 유닛
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
# packages 모듈은 DEBIAN_FRONTEND를 내부적으로 처리하지 않으므로
# 인터랙티브(interactive) 프롬프트가 발생할 수 있는 패키지는
# runcmd에서 직접 설치함 (iperf3 등)
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

  # 네트워크 진단/분석
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

  # 스토리지/디스크 관리
  - smartmontools
  - nvme-cli
  - lvm2
  - parted
  - gdisk

  # QEMU Guest Agent
  - qemu-guest-agent

# ------------------------------------------------------------
# 최초 부팅 1회 실행 명령 (runcmd)
#
# 주의: runcmd의 각 항목은 별도 sh -c로 실행됨.
#       export 한 환경변수는 다음 줄에 전달되지 않으므로
#       apt 명령마다 DEBIAN_FRONTEND를 인라인으로 명시.
# ------------------------------------------------------------
runcmd:
  # ----------------------------------------------------------
  # Step 1. dpkg 상태 복구
  # Cloud Image 최초 부팅 시 dpkg updates/ 디렉토리에
  # 불완전한 파일이 남아있을 수 있음. 선제적으로 제거 후 복구.
  # ----------------------------------------------------------
  - rm -f /var/lib/dpkg/updates/*
  - dpkg --configure -a

  # ----------------------------------------------------------
  # Step 2. apt 캐시 재정리
  # package_update 모듈이 이미 실행됐더라도 dpkg 복구 이후
  # 캐시를 다시 갱신해서 일관성 보장.
  # ----------------------------------------------------------
  - DEBIAN_FRONTEND=noninteractive apt update -qq

  # ----------------------------------------------------------
  # Step 3. iperf3 별도 설치
  # debconf 프롬프트를 띄우므로 packages 모듈 대신
  # DEBIAN_FRONTEND=noninteractive 로 직접 설치.
  # ----------------------------------------------------------
  - DEBIAN_FRONTEND=noninteractive apt install -y iperf3

  # ----------------------------------------------------------
  # Step 4. full-upgrade (최초 부팅 1회)
  # ----------------------------------------------------------
  - DEBIAN_FRONTEND=noninteractive apt full-upgrade -y

  # ----------------------------------------------------------
  # Step 5. omping 빌드 및 설치
  # DEB 계열에는 omping 패키지가 없으므로 소스 빌드.
  # ----------------------------------------------------------
  - git clone https://github.com/jfriesse/omping.git /tmp/omping
  - make -C /tmp/omping
  - cp /tmp/omping/omping /usr/local/bin/omping
  - rm -rf /tmp/omping

  # ----------------------------------------------------------
  # Step 6. qemu-guest-agent 활성화 및 즉시 기동
  # ----------------------------------------------------------
  - systemctl enable --now qemu-guest-agent

  # ----------------------------------------------------------
  # Step 7. apt-update-on-boot 서비스 등록
  # write_files로 유닛 파일을 심어뒀으므로 enable만 수행.
  # ----------------------------------------------------------
  - systemctl daemon-reload
  - systemctl enable apt-update-on-boot.service

  # ----------------------------------------------------------
  # Step 8. root 계정 비밀번호 초기화
  # 주의: 실습 전용. 프로덕션 환경에서는 절대 사용 금지.
  # 패스워드가 snippets 파일에 평문으로 저장됨.
  # ----------------------------------------------------------
  - echo 'root:Dpfdlxpzm08!' | chpasswd

  # ----------------------------------------------------------
  # Step 9. apt 캐시 정리
  # ----------------------------------------------------------
  - apt autoremove -y
  - apt clean
```

### VM에 `user-data` 주입

```bash
cp ./cld-api-user-data.yaml /mnt/pve/shared/snippets/cld-api-user-data.yaml
# 작성한 cld-api-user-data.yaml 파일을 NFS Storage Snippets 위치에 보사

qm set 301 --cicustom "user=shared:snippets/cld-api-user-data.yaml"
# --cicustom 옵션을 통해 VM .conf 파일에 주입
```
