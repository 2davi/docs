


### 중첩 VM 내에 qemu-guest-agent 설치

```bash
pvedaemon[1066]: VM 999 qga command failed - VM 999 qga command 'guest-ping' failed - got timeout
```

VM 내에 QEMU-Guest-Agent 미설치 시 Proxmox가 해당 VM을 모니터링하고 제어할 수가 없다.
위 로그가 journalctl -f 시 주기적으로 호출될 것.

```bash
apt update
apt install qemu-guest-agent -y
systemctl enable --now qemu-guest-agent
```

### 클러스터 네트워크 진단

#### 1. 장애 개요

**발생 상황:** 타겟 노드('kcy0122')로 VM 301 마이그레이션 시도 중, 타겟 노드가 돌연 다운(강제 재부팅)되며 클러스터 전체의 정족수(Quorum)이 붕괴됨.

**표면적 에러 로그:** `VM is locked (migrate)`, `corosync token timed out`, `corosync KENT link down`

```bash
corosync[1003]:   [KNET  ] link: host: 1 link: 0 is down
# journalctl에서 확인된 KNET 
```

#### 2. 진단 도구 선택: omping

단순한 핑 유실이 아니라, '마이그레이션이라는 대규모 부하 상황'에서만 노드가 죽는 현상을 테스트하기 위해 `omping`을 채택함.

- **일반 ICMP(`ping`)의 한계:** 일반 Ping은 L3 레벨의 단순 연결성만 확인함.
- Proxmox의 Corosync 데몬은 상태 동기화를 위해 **UDP Multicast**와 유니캐스트를 혼용하는데, 일반 Ping으로는 멀티캐스트 라우팅 문제나 L2 스위치의 IGMP Snooping 오작동을 잡아낼 수 없음.
- **`omping`의 장점:** 실제 Corosync 클러스터 통신과 유사한 형태(UDP)로 초당 수천 개의 유니캐스트/멀티캐스트 패킷을 쏟아부어 부하 테스트를 진행함. 이를 통해 과부하 상황에서 발생하는 미세한 패킷 소실(loss)과 지연 시간(Latency) 폭증 현상을 확인할 수 있음.

#### 3. 결과 분석

양방향 `omping` 패킷 1만 개 테스트 결과, `10.10.250.115` 노드와의 통신 구간에서 네트워크 결함이 확인됨.

```bash
omping -c 10000 -i 0.001 -F -q 10.10.250.117 10.10.250.115
> 10.10.250.115 :   unicast, xmt/rcv/%loss = 10000/9849/1%, min/avg/max/std-dev = 0.631/41.487/200.302/47.886
> 10.10.250.115 : multicast, xmt/rcv/%loss = 10000/0/100%, min/avg/max/std-dev = 0.000/0.000/0.000/0.000
# .117 노드에서 .115 노드와 통신

omping -c 10000 -i 0.001 -F -q 10.10.250.119 10.10.250.115
> 10.10.250.115 :   unicast, xmt/rcv/%loss = 10000/9791/2%, min/avg/max/std-dev = 0.757/3.001/122.153/5.121
> 10.10.250.115 : multicast, xmt/rcv/%loss = 10000/0/100%, min/avg/max/std-dev = 0.000/0.000/0.000/0.000
# .119 노드에서 .115 노드와 통신

omping -c 10000 -i 0.001 -F -q 10.10.250.119 10.10.250.117
> 10.10.250.117 :   unicast, xmt/rcv/%loss = 9799/9790/0%, min/avg/max/std-dev = 0.612/1.616/19.344/0.638
> 10.10.250.117 : multicast, xmt/rcv/%loss = 9799/9790/0%, min/avg/max/std-dev = 0.612/1.622/19.344/0.637
# .119 노드에서 .117 노드와 통신
```

**멀티캐스트 트래픽 100% 유실:**

- **Log:** `multicast, xmt/rcv/%loss = 10000/0/100%`
- 115번 노드로 향하는 멀티캐스트 패킷이 전면 차단되고 있다.해당 노드의 방화벽이 멀티캐스트 대역(`239.0.0.1`)을 드랍하고 있거나, 혹은 물리적 스위치의 IGMP Snooping 오작동이 원인으로 추정.

**유니캐스트 트래픽 심층 지연 (Latency Spike) 및 손실:**

- **Log:** `unicast, ... %loss = 1%~2%, max = 122.153ms ~ 200.302ms`
- LAN 환경에서 최대 200ms 핑 튕김 현상과 1~2% 패킷 손실이 발생 중.

> 패킷 손실이 발생 중인 네트워크 위에서 대역폭을 극한으로 점유하는 **마이그레이션 트래픽**을 쏟아부을 때, 클러스터의 Heartbeat가 트래픽 잼에 갇혀 노드의 생존 신호를 읽지 못함 (Token Timeout 로그).
> `kcy0122` 타겟 노드가 네트워크에서 고립된 채 클러스터에서 떨어져나가고, HA-Fencing에 의해 강제 종료/재부팅 시도.

### VM 통계 그래프 데이터 박살남?

```bash
pmxcfs[866]: [status] notice: RRD update error ... /var/lib/rrdcached/db/pve-vm-9.0/301
```

Proxmox Web UI에서 VM의 Summary 데이터를 못 가져옴.
보통, 삭제된 

### 중첩 VM 내부에 QEMU-GUEST-AGENT 설치

안 하면:

```bash
# Proxmox
pvescheduler[32744]: VM 201 qga command failed - VM 201 qga command 'guest-ping' failed - got timeout
```

**설치 방법:**

```bash
# 중첩 VM 내부에서:
apt update
apt install qemu-guest-agent -y
systemctl enable --now qemu-guest-agent
```

### Datacenter Notification Mail로 받기

```bash
dig MX letech.kr +short
> 20 ALT.ASPMX.daum.net.
> 10 ASPMX.daum.net.
# 메일 서버는 [smtp.daum.net]

apt install -y ca-certificates
update-ca-certificates -f
ls -l /etc/ssl/certs/ca-certificates.crt
# .crt 파일 확인하면 끝
```

```bash
# /etc/postfix/main.cf
relayhost = [smtp.daum.net]:465
smtp_tls_wrappermode = yes
smtp_tls_security_level = encrypt
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
smtp_sasl_security_options = noanonymous
smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt
smtp_generic_maps = hash:/etc/postfix/generic
myorigin = letech.kr
```

```bash
# Daum 메일에서 앱 비밀번호 생성 후 복사

# /etc/postfix/sasl_passwd
[smtp.daum.net]:465 kcy0122@letech.kr:dpcpcuxwbegpbfed
```

```bash
# /etc/postfix/generic
@kcy0122.proxmos.letech.kr  kcy0122@letech.kr
root                        kcy0122@letech.kr
MAILER-DAEMON               kcy0122@letech.kr
```

```bash
postmap /etc/postfix/sasl_passwd
postmap /etc/postfix/generic

chmod 600 /etc/postfix/sasl_passwd
chmod 600 /etc/postfix/sasl_passwd.db
chmod 600 /etc/postfix/generic
chmod 600 /etc/postfix/generic.db

systemctl restart postfix
systemctl reload postfix
```

#### 막상 메일로 받아도 별 내용 없음
