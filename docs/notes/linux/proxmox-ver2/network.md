
# Proxmox VE Network

## 1. Proxmox VE Network Interface configurations

/etc/network/interfaces 설정 전문은 아래와 같다.
현재 Proxmox VE 노드의 IP는 192.168.10.101로 설정하였고,
외부 인터넷을 끌어오기 위한 NAT 어댑터는 10.0.2.15로 지정하였다.
그리고 중첩 VM들도 외부 인터넷에 접근할 수 있도록 vmbr2를 새로 만들어주었다.

- Proxmox Node

```ini
auto lo
iface lo inet loopback

# host-only adapter NIC
iface nic0 inet manual

# NAT adapter NIC
iface enp0s8 inet manual

# host-only bridge
auto vmbr0
iface vmbr0 inet static
        address 192.168.10.101/24
        # gateway 192.168.10.1
        bridge-ports nic0
        bridge-stp off
        bridge-fd 0

# NAT bridge
auto vmbr1
iface vmbr1 inet static
        address 10.0.2.15/24
        gateway 10.0.2.2
        bridge-ports enp0s8
        bridge-stp off
        bridge-fd 0

# Internal NAT Bridge for VMs
auto vmbr2
iface vmbr2 inet static
        address 10.10.3.15/24
        bridge-ports none
        bridge-stp off
        bridge-fd 0
        post-up   echo 1 > /proc/sys/net/ipv4/ip_forward
        post-up   iptables -t nat -A POSTROUTING -s '10.10.3.0/24' -o vmbr1 -j MASQUERADE
        post-down iptables -t nat -D POSTROUTING -s '10.10.3.0/24' -o vmbr1 -j MASQUERADE

source /etc/network/interfaces.d/*
```

- Nested VM

```markdown
1. Hardware:
  - network device: net0(vmbr2)
2. Installation GUI
  - IP address: 10.10.3.102/24
  - Netmask: 255.255.255.0
  - Gateway: 10.10.3.15
  - Nameserver: 8.8.8.8
```

> noVNC 실행 중 Network Configuration 설정 적용이 끝난 다음 STEP 화면에서, `Ctrl + Alt _ F3`을 입력, tty2 Shell로 진입하여 ip를 확인한다.
> 여기서 packet loss가 발생하면 `Go Back` 버튼을 클릭해 Network를 다시 설정하거나, VM 종료 후 Hardware를 다시 확인한다.

```bash
ip a
ping -c 4 8.8.8.8
ping -c 4 google.com
```
- 호스트 Windows에 정적 라우팅(Static Routing) 추가

CMD를 관리자 권한으로 실행하여, Proxmox VE의 IP Forwarding을 타서 VM에 SSH 접근할 수 있도록 정적 라우팅을 추가한다.

```cmd
route add 10.10.3.0 mask 255.255.255.0 192.168.10.102 -p
```

### 1-01. Debian 설치 중 'Bad archive mirror' 에러

- **원인:** 여러가지 원인이 발단이 될 수 있으며, 결과적으로 deb.debian.org mirror에 접근하지 못함. (내 경우에는 Network Configuration 오류.)
- **해결:** L2 연결 복구, 방화벽 해제, 네트워크 manual 설정 등 여러 원인에 따른 여러 방법이 있으나, 내 경우에는 에러가 난 VM을 폐기하고 새로 만듦.

### 1-02. 설치 완료 후 재부팅 시 SeaBIOS 멈춤 (GRUB 누락)

- **원인:** OS 설치 과정 중 부트로더(GRUB)를 메인 디스크가 아닌 파티션에 설치했다거나, 모종의 이유로 누락 혹은 건너뜀.
- **해결:** Rescue Mode로 복구
  1. VM 종료 후 다시 부팅하여, Proxmox VE 화면이 뜰 때 Esc 버튼 연타 → Installaion ISO 이미지를 실행
  2. Advanced options → Rescue Mode 진입
  3. GRUB 설정 단계까지 똑같이 진행
  4. Reinstall GRUB boot loader 메뉴를 선택하고, 타겟 입력 화면에서 직접 "/dev/sda"라고 명확히 지정하여 MBR 영역에 설치

## 2. L3 Core Router (pfSense / OPNsense) 도입

호스트 Windows에 정적 라우팅을 추가하는 방법은, 장기적으로 봤을 때 부적절한 선택이다. Proxmox 노드가 늘어나 클러스터를 구성할 경우, 노드마다 정적 라우팅을 추가해줄 것도 아니다. 그리고 지금은 홈랩 환경이지만, 접근 가능한 내부망을 확장할 경우, 모든 호스트 Windows마다 정적 라우팅을 추가해주는 불상사가 필연적으로 발생한다. 네트워크 대역을 명확히 구분하여 Proxmox 클러스터의 동작과 접근 방식을 간단하게 고치기 위해, 라우터 VM을 만들어 VLAN을 통해 네트워크를 쪼개고 관리할 수 있도록 아키텍처를 수정한다. 그리하여 윈도우 호스트에서는 이 라우터 VM 하나만 정적 라우팅으로 한 줄 추가하게 고치면, 모든 VM의 IP로 SSH 접속이 가능해진다.

### 2-01. Netgate Installer(pfSense) ISO 다운로드

`https://shop.netgate.com/products/netgate-installer` URL에서 0.00$ 결제하고, 이메일로 파일 다운로드 받아서, 압축 풀고, Proxmox VE local Storage에 ISO 이미지파일 업로드 진행.

### 2-03. VM 생성

- VM Create
  - VMID: 100
  - VMNM: router-pfsense
  - ISO: netgate-installer-v1.2-RELEASE-amd64.iso
  - QEMU Guest: disable
  - Disk: (scsi0) VirtIO Block / local-lvm
  - 2 Core, 2048 MiB Mem.
  - (net0) vmbr0로 임시 진행
- VM > Hardware
  - (net0) vmbr1(VirtualBox NAT 대역) / VirtIO (paravirtualized) / Firewall disabled
  - (net1) vmbr2(VM Bridge) / VirtIO / Firewall disabled
  - _네트워크 어플라이언스 앞단에는 하이퍼바이저 방화벽을 두지 않는다._

> QEMU Guest는 Proxmox ↔ nested VM과 통신할 채널을 열어두라고 명령할 뿐, 실제 에이전트 프로그램을 깔고 실행시키는 것이 아니다.
> 앞서 Proxmox에서 vmbr2를 깡통 브릿지로 변경했기 때문에, 우선 pfSense 설치 시 QEMU Guest를 비활성화 해준다.

### 2-04. pfSense OS 설치

- Copyright and Distribution Notice: Accept
- Welcome: Install - Install pfSense → OK
- Network Installation: OK
- WAN Interface Assignment and Configuration: vtnet0 → OK
- WAN (vtnet0) Network Mode Setup: >>> Continue - Proceed with the installation → OK
- LAN Interface Assignment and Configuration: vtnet1 → OK
- LAN (vtnet1) Network Node Setup: >>> Continue - Proceed with the installation → OK
- Interface Assignment and Configuration: vtnet1 → Continue
  - Connectivity Check (Verifying the Internet connection... Trying to reach the Netgate Servers, please wait (this can take a while)...)
  - Warning! (Cannot reach the Netgate Servers, please verify your network settings!)
  - 다시 Interface Assignment and Configuration: 화면으로 돌아옴.
  - //VirtualBox NAT Network Adapter(#2)에서 '무작위 모드'를 `거부`에서 `모두 허용`으로 변경하고 Proxmox, nested VM 재실행.
- Active Subscription Validation: Install CE
- Installation Options: >>> Continue - Proceed with the installation
- ZFS Virtual Device Type Configuration: Stripe - No Redundancy → OK
- Disk Selection: [X] vtbd0 32G \<vtbd0\> → Ok
- Confirmation: Yes
- Software Version to install: Current Stable Version (2.8.1) → OK
- Installation Details: (logging...)
- → OK → Reboot

### 2-05. LAN IP 대역 변경

VM > Hardware> CD/DVD Drive (ide2): none,media=cdrom 으로 변경 후, pfSense VM 재부팅.

- Enter an option: **2** (Set interface(s) IP address)
- Enter the number of the interface you wish to configure: **2** (LAN (vtnet1 - static))
- Configure IPv4 address LAN interface via DHCP? (y/n): **n**
  - Enter the new LAN IPv4 address. Press \<ENTER> for none: **10.10.3.15**
  - Enter the new LAN IPv4 subnet bit count (1 to 32): **24**
  - For a WAN, enter the new LAN IPv4 upstream gateway address.
    For a LAN, press \<ENTER> for none: **\<ENTER>**
- Configure IPv6 address LAN interface via DHCP? (y/n): **n**
  - Enter the new LAN IPv6 address. Press \<ENTER> for none: **\<ENTER>**
- Do you wnat to enable the DHCP server on LAN?: **y**
  - Enter the start address of the IPv4 client address range: **10.10.3.100**
  - Enter the end address of the IPv4 client address range: **10.10.3.254**
- _Do you want to revert to HTTP as the webConfigurator protocol? (y/n): y_
- Please wait while the changes are saved to LAN...
  ...
  Press \<ENTER> to continue.: **\<ENTER>**
  QEMU Guest - Netgate Device ID: \<NETGATE_DEVICE_ID>
  \*\* Welcome to pfSense 2.8.1-RELEASE (amd64) on pfSense \*\*
  WAN (wan) -> vtnet0 -> v4/DHCP4: 10.0.2.5/24
  LAN (lan) -> vtnet1 -> v4: 10.10.3.15/24

### 2-06. 최종 통신 테스트

Debian 13 VM을 실행시켜서 ping 테스트를 진행한다.
packet loss 없으면 성공이다.

```bash
# pfSense 뒷문까지 패킷이 살아서 나가는지 확인한다.
ping -c 4 10.10.3.15

# pfSense가 앞문 열고 NAT 변환해서 외부 인터넷 Nameserver까지 뚫어주는지 확인한다.
ping -c 4 google.com
```

### 2-07. pfSense Web GUI로 MGMT 대역 고속도로 뚫기

**Proxmox VE의 vmbr2에 스위치 역할을 할 IP를 하나 부여한다.**

현재 pfSense의 LAN(10.10.3.15)과 Debian 13 VM은 외부망과 철저히 격리된 '밀실'이다. 호스트 Windows에서는 저 IP 대역이 존재하는지조차 모르기 때문에, pfSense Web GUI도 nested VM의 SSH 접속도 불가능하다.

```ini
auto vmbr2
iface vmbr2 inet static
        address 10.10.3.254/24
        bridge-ports none
        bridge-stp off
        bridge-fd 0
```

```bash
nano /etc/network/interfaces
systemctl restart networking
```

**pfSense에 3번째 랜선(MGMT)을 추가한다.**

현재 pfSense는 앞문(vmbr1(vtnet0) - 인터넷)과 뒷문(vmbr2(vtnet1) - 내부망)밖에 없다. 여기에 호스트 Windows와 직접 연결된 Proxmox VE의 관리용 스위치 vmbr0을 꽂아준다.

1. Proxmox Web GUI에서 pfSense를 Shutdown
2. pfSense VM > Hardware > Add... > Network Device: **(net2)vmbr0**
3. pfSense VM Start
4. Proxmox VE에서 아래 명령을 쳐서 packet loss가 발생하지 않는지 확인한다. (연결이 안 될 경우 VM 재부팅)

```bash
ping -c 4 10.10.3.15
```

**pfSense Web GUI에 접속한다.**

일시적으로 Web GUI에 접속하기 위해, cmd 창에서 SSH -L 명령으로 8080 포트와 vmbr2 스위치 IP를 연결해준다.

```cmd
ssh -L 18080:10.10.3.15:80 root@192.168.10.101
```

- http://localhost:18080 접속
- username: admin / password: pfsense
- Wizard/ pfSense Setup 진행

**pfSense 대시보드 설정(Wizard/ pfSense Setup)을 진행한다.**

- General Information:
  - Hostname: router-pfsense (VMNM)
  - Domain: router-pfsense.lab.the2davi.dev
  - Primary DNS Server: 8.8.8.8
  - Secondary DNS Server: 8.8.4.4
  - Override DNS: enabled
- Time Server Information
  - Time server hostname: 2.pfsense.pool.ntp.org (기본값)
  - Timezone: Asiz/Seoul
- Configure WAN Interface
  - Configuration Type: DHCP
  - (쭉쭉 하단까지 무시하며 내려감.)
  - **RFC1918 Networks Block** RFC1918 Private Networks: disabled
  - **Block bogon networks** Block bogon networks: disabled
- Configure LAN Interface
  - (pfSense Reboot 후 2 → 2 옵션에서 설정해주었던 값 그대로인지 확인만 하고 Next)
- Change admin Account Password
  - NI.
- Reload Configuration.
  
**아까 추가한 vmbr0(vtnet2) MGMT 네트워크 인터페이스로 새 랜선(OPT1)을 설정한다.**

- [상단 헤더] > Interfaces > Assignments 클릭
- Available network ports - vtnet2 > "+ Add" 클릭 > 신규 등록된 OPT1 클릭
- Interfaces/ OPT1 (vtnet2):
  - General Configuration:
    - Enable(enabled interface): enabled
    - IPv4 Configuration Type: Static IPv4
  - Static IPv4 Configuration:
    - IPv4 Address: 192.168.10.254 / 24
- ...> 하단의 "Save" 클릭 > 상단 노란박스 안의 "Apply Changes" 클릭
  _꽤 오랜 로딩 시간이 필요하다. 기다리면 해결됨.

**방화벽 프리패스 규칙을 추가한다.**

- [상단 헤더] > Firewall > Rules 클릭
- [중간 헤더] > [탭 OPT1] > **아래 화살표 모양의 "Add"** 클릭
  - Edit Firewall Rule:
    - Action: Pass
    - Interface: OPT1
    - Protocol: Any (MGMT 관리망이니까 시원하게 뚫어버리자.)
  - ...> 하단의 "Save" 클릭 > 상단 노란박스 안의 "Apply Changes" 클릭

**CMD: 10.10.3.X 내부망으로 들어갈 일이 있으면 router-pfsense VM의 OPT1으로 패킷을 던지도록 Static Routing을 추가한다.**

```cmd
route add 10.10.3.0 mask 255.255.255.0 192.168.10.254 -p
```

---

**그래도 안 된다..?**

- router-pfsense VM > Hardware > net2 > Firewall: disabled
- router-pfsense VM > Console > 11 → \<ENTER> > 5 → \<ENTER>
- router-pfsense VM > 7 → \<ENTER> >  ping 192.168.10.1 (이게 윈도우 호스트로 ping 테스트 보내는 거랜다.)
- VirtualBox GUI에서 Host-only Adapter의 무작위 모드를 "모두 허용"으로 고친다.
  - → 여전히 안 되고, 설상가상 Proxmox VE로 SSH 접속 또한 끊겼다.
    - **롤백:** 무작위 모드를 "거부"로 고친 뒤, Windows 시작 > ncpa.cpl 검색 > VirtualBox Host-Only Ethernet Adapter(PVE가 사용중인)를 우클릭으로 "사용 안함"으로 껐다가, "사용"으로 다시 실행함.

## 3. VirtualBox Network Driver(NDIS)가 Windows 환경에서 발생시키는 고질적인 버그

외부 인터넷용 NAT Network 어댑터의 브리지는 무작위 모드가 잘 먹혔지만, Host-Only 어댑터에서 무작위 모드를 "모두 허용"으로 풀어주는 순간, VirtualBox 스위치가 패킷 루프(Broadcast Storm)를 돌리거나 네트워크 드라이버 자체가 뻗어버리는 경우가 왕왕 있다고 한다. (gemini 曰)

## 4. Proxmox VE를 Windows 망과 내부망을 연결하는 순수 공유기(Router)로 사용

**MGMT 대역으로 사용하려던 vmbr2를 재구성:**

- router-pfsense VM에서 net2(vmbr0) 네트워크 디바이스를 제거한다.
- router-pfsense VM을 실행한 뒤, 바뀐 랜카드를 다시 설정해준다.
  - Enter the WAN interface name or 'a' for auto-detection: **vtnet0**
  - Enter the LAN interface name or 'a' for auto-detection: **vtnet1**
  - Do you want to proceed [y|n]?: **y**
  - (if) Enter the Optional 1 interface name: **\<ENTER>**
  - (이후 `...done.` 과정들에 시간이 좀 걸린다.)
  - 인터페이스 재할당을 마쳤는데도 WAN이나 LAN IP를 못 잡고 있을 경우, 5번 옵션으로 재부팅이 필요하다.

- /etc/network/interfaces에서 vmbr2에 포워딩만 활성화시켜 Proxmox가 패킷을 넘겨줄 수 있도록 해준다.
  - 순수 라우팅만 시켜주기 위해 iptables MASQUERADE는 입력하지 않는다.

```ini
auto vmbr2
iface vmbr2 inet static
        address 10.10.3.254/24
        bridge-ports none
        bridge-stp off
        bridge-fd 0
        post-up echo 1 > /proc/sys/net/ipv4/ip_forward
```

```bash
systemctl restart networking
```

**호스트 Windows의 라우팅 규칙 재설정:**

- Windows CMD를 관리자 권한으로 실행,
  - 아까 생성한 라우팅을 지우고, Proxmox를 향하도록 추가

```cmd
route delete 10.10.3.0
route add 10.10.3.0 mask 255.255.255.0 192.168.10.101 -p
```

**pfSense가 호스트 Windows로부터 받은 요청에 응답할 때, Proxmox에게 패킷을 보내도록 설정:**

- pfSense Web GUI에 진입하기 위해 CMD로 임시 터널링

```cmd
ssh -L 18080:10.10.3.15:80 root@192.168.10.101
```

- pfSense Web GUI(localhost:18080)으로 접속
- [상단 헤더] > System > Routing > Gateways > "+ Add" 클릭
  - Interface: **LAN**
  - Name: **PROXMOX_ROUTE**
  - Gateway IPv4: **10.10.3.254** (PVE vmbr2의 IP)
- "Save" 클릭 → "Apply Changes" 클릭
- [상단 헤더] > System > Routing > Static Routes > "+ Add" 클릭
  - Destination network: **192.168.10.0 / 24**
  - Gateway: **PROXMOX_ROUTE**
- "Save" 클릭 → "Apply Changes" 클릭
- [상단 헤더] > Firewall > Rules > [탭 LAN] > "(위쪽을 향하는 화살표) Add" 클릭
  - Action: **Pass**
  - Interface: **LAN**
  - Protocol: **Any**
  - Source: **Network / 192.168.10.0 / 24**
- "Save" 클릭 → "Apply Changes" 클릭

- 이제, http://10.10.3.15로 접속하면 바로 pfSense Web GUI가 나온다. CMD 터널링 종료.
- SSH로 VM IP 접속이 원활하게 이루어진다.
