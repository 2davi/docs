---
title: "Proxmox 중첩 가상화 환경 트러블슈팅"
date: 2026-04-17
lastmod: 2026-04-17
author: "Davi"
description: "Proxmox VE 중첩 가상화 환경에서 발생한 트러블슈팅 사례 모음. 각 항목은 원본 문서에서 DocEmbed로 불러온다."
slug: "troubleshooting"
section: "notes"
category: "proxmox/ref."
tags: [proxmox, troubleshooting, virtualbox, nested-virtualization, corosync, nfs, zfs, cloud-init, ha]
order: 7
series: "Proxmox VE 학습 시리즈"
#series_order: 0
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

> 이 문서는 각 학습 문서에 흩어져 있는 트러블슈팅 섹션을 한곳에서 탐색하기 위한 인덱스다.
> 내용은 원본 문서에서 DocEmbed로 불러오며, 수정은 각 원본 문서에서 진행한다.

---

## 01-setup

### 초기 설치 & 기본 설정

#### 8.1 rrdcached RRD update error

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

### 클러스터 구성

#### 8.1 부팅 로그에서 "정상 노이즈" 구분하기

Proxmox를 재부팅하면 `journalctl -p err..emerg`에 공포스러운 에러 메시지가 여럿 뜬다.
이것들 대부분은 **구조적으로 발생하는 정상 노이즈**다. 진짜 이상 징후와 구분하는
눈을 먼저 키워야 한다.

| 로그 메시지                                                               | 발생 원인                                                                                                 | 실제 위험도 |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------- |
| `pmxcfs: [quorum] crit: quorum_initialize failed: CS_ERR_LIBRARY`         | 부팅 시 pmxcfs가 corosync보다 먼저 시작되어 연결 시도 → 실패 → 재시도로 정상화. **모든 부팅에서 발생**.   | 무해        |
| `vmwgfx: *ERROR* vmwgfx seems to be running on an unsupported hypervisor` | VMware용 GPU 드라이버가 VirtualBox를 인식 못하고 경고. 디스플레이 기능에만 영향, 운영에 무관.             | 무해        |
| `kernel: RETBleed: WARNING: Spectre v2 mitigation leaves CPU vulnerable`  | Spectre/Meltdown 완화 패치 한계 경고. 중첩 가상화 환경에서 완전한 마이크로코드 패치 불가. 학습 환경 무관. | 무해        |
| `blkmapd: open pipe file /run/rpc_pipefs/nfs/blocklayout failed`          | pNFS 블록 레이아웃 데몬. 일반 NFS 마운트에는 사용되지 않는 컴포넌트.                                      | 무해        |

**pmxcfs 부팅 경쟁 조건의 실제 흐름:**

```markdown
systemd 부팅 순서:
  corosync.service 시작 중... (시간 소요)
  pmxcfs.service 시작 → corosync 연결 시도 → CS_ERR_LIBRARY (아직 준비 안 됨)
  ...수 초 후...
  corosync 초기화 완료
  pmxcfs 재연결 성공 → /etc/pve/ 마운트
```

이 에러가 **부팅 직후에만** 나타나고 이후 사라진다면 무시한다.
부팅 이후에도 계속 발생한다면 corosync 자체에 문제가 있다는 신호다.

---

#### 8.2 Corosync TOTEM 링과 노드 Down/Out 상태 머신

##### 토큰 링(Token Ring) 메커니즘

Corosync는 클러스터 노드 간 합의에 **TOTEM 프로토콜**을 사용한다.
TOTEM은 논리적인 링(Ring) 구조로 노드를 연결하고, **토큰(Token)이라는 메시지 전송권**을
순서대로 돌린다. 토큰을 쥔 노드만 메시지를 브로드캐스트할 수 있고, 전송 후 다음
노드에게 토큰을 넘긴다.

```markdown
정상 상태:
  [pve] → token → [pve-ksy] → token → [kcy0122] → token → [pve] ...
           1ms 이내              1ms 이내              1ms 이내

CPU 기아 발생:
  [pve] → token → [kcy0122]  ← token 처리 불능 (CPU 없음)
                      ↑
              3650ms 경과 → token timed out
```

토큰이 `token_timeout`(기본 3000ms, 여기서는 3650ms) 안에 돌아오지 않으면,
Corosync는 해당 노드가 죽은 것으로 판단하고 **새로운 멤버십 구성(New Configuration)**을
시작한다.

```bash
# 로그에서 확인된 패턴 — 하루에만 5회 발생
# Apr 16 09:19:52 corosync[1321]: [TOTEM] A processor failed,
#   forming new configuration: token timed out (3650ms), waiting 4380ms for consensus.
# Apr 16 09:44:05 corosync[1321]: [TOTEM] A processor failed, ...
# Apr 16 13:46:20 corosync[1321]: [TOTEM] A processor failed, ...
# Apr 16 14:21:56 corosync[1321]: [TOTEM] A processor failed, ...
# Apr 16 15:21:41 corosync[1304]: [TOTEM] A processor failed, ...
```

##### 노드 Down/Out 상태 머신

Ceph는 OSD(Object Storage Daemon)가 응답하지 않을 때 두 단계를 거친다.

| 단계     | Ceph OSD                                                 | 의미                                         | Proxmox Corosync 대응 개념                             |
| -------- | -------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| **Down** | OSD가 응답 없음                                          | 일시적 장애 의심. 데이터 이동 보류           | 토큰 타임아웃 감지. 새 구성 형성 대기                  |
| **Out**  | Down 상태가 `mon_osd_down_out_interval`(기본 600초) 지속 | 클러스터에서 완전 제거. 데이터 리밸런싱 시작 | 노드가 쿼럼에서 이탈. Fencing 트리거. HA 페일오버 실행 |

Proxmox/Corosync에서의 동등한 흐름:

```markdown
[정상 멤버] → 토큰 타임아웃 감지 (Down에 해당)
    │
    ↓ 4380ms 동안 consensus 대기
    │
    ├─ 노드가 다시 응답 → 기존 멤버십 유지 (일시적 지연, 로그만 남음)
    │
    └─ 응답 없음 → 새 멤버십 구성 완료 (Out에 해당)
            │
            ├─ 쿼럼 유지 (남은 노드 ≥ 과반수) → 운영 계속, pmxcfs 정상 유지
            └─ 쿼럼 붕괴 (남은 노드 < 과반수) → pmxcfs 읽기 전용 전환
```

**이번 사례의 "촌극":** 노드는 VirtualBox 안에서 `VMState="running"`으로 살아있었다.
커널도 죽지 않았다. 단순히 **VirtualBox가 백그라운드로 밀리면서 CPU를 못 받아**
Corosync 데몬이 토큰을 처리하지 못했을 뿐이다. 클러스터 입장에서는 노드가 죽은 것과
구별이 안 된다.

##### VirtualBox CPU 기아 → 연쇄 장애 타임라인

```markdown
호스트 PC에서 VirtualBox 창이 백그라운드로 전환됨
    │
    ↓ Windows 스케줄러가 VirtualBox 프로세스의 CPU 우선순위 하락
    │
    ↓ Proxmox VM이 CPU 사이클을 충분히 받지 못함
    │
    ↓ Corosync 데몬이 토큰을 제때 처리하지 못함
    │
    ↓ 3650ms 토큰 타임아웃 → [TOTEM] A processor failed
    │
    ├─ 쿼럼 유지된 경우: 로그만 남고 운영 계속
    │
    └─ 쿼럼 붕괴된 경우:
           │
           ↓ pmxcfs → 읽기 전용 전환 (/etc/pve/ 쓰기 불가)
           │
           ↓ 스케줄러(pvescheduler)가 /etc/pve/jobs.cfg 접근 시도
           │
           ↓ 14:44:24 cfs-lock 'file-jobs_cfg' error: got lock request timeout
                       ↑ 토큰 타임아웃의 후유증
```

```bash
# 연쇄의 증거 로그 — 시간 순서로 읽기
# 14:21:56 corosync[1321]: [TOTEM] A processor failed, ... token timed out
# 14:44:24 pvescheduler[145146]: jobs: cfs-lock 'file-jobs_cfg' error: got lock request timeout
# 14:44:24 pvescheduler[145144]: replication: cfs-lock 'file-replication_cfg' error: ...
#           ↑ 23분 후 cfs-lock 타임아웃 — 토큰 타임아웃의 직접 후유증
```

Corosync 토큰 타임아웃 관련 파라미터 확인:

```bash
cat /etc/corosync/corosync.conf | grep -E "token|consensus|join"
# token:          3000    ← 토큰 타임아웃 (ms). 기본 3000ms, 여기서는 3650ms
# token_retransmits_before_loss_const: 10
# join:           60
# consensus:      4380    ← 새 구성 합의 대기 시간 (ms)

# VirtualBox 환경에서는 token 값을 높여서 타임아웃 빈도를 줄일 수 있음
# 단, 실제 장애 감지 시간도 늘어나는 트레이드오프가 있음
```

---

#### 8.3 커널 패닉 — 중첩 가상화의 메모리 맵핑 붕괴

이번 로그에서 커널 패닉이 두 번 발생했다.

##### 09:00:35 — NULL Pointer Dereference

```log
kernel: BUG: kernel NULL pointer dereference, address: 0000000000000000
kernel: #PF: supervisor write access in kernel mode
kernel: #PF: error_code(0x0002) - not-present page
```

커널이 `0x0000000000000000` 주소에 쓰기를 시도했다. 이 주소는 항상 매핑되지 않은
(not-present) 영역이다. 정상 코드라면 이 주소를 쓸 이유가 없으므로, **초기화되지 않은
포인터를 역참조(dereference)했다는 뜻**이다.

중첩 가상화 환경에서 이것이 발생하는 경로:

```markdown
QEMU가 EPT(Extended Page Table) 엔트리 설정 요청
    │
    ↓ KVM 커널 모듈이 처리 → VirtualBox Nested VT-x에 전달
    │
    ↓ VirtualBox가 GPA→HPA 주소 변환 중 경쟁 조건(Race Condition) 발생
    │
    ↓ 잘못된 물리 주소가 KVM 내부 자료구조의 포인터 필드에 기록됨
    │
    ↓ 커널이 그 포인터를 사용할 때 NULL 또는 쓰레기 값으로 역참조
    │
    ↓ Page Fault → Kernel BUG → 패닉
```

##### 15:13:13 — NX-Protected Page Execution

```log
kernel: kernel tried to execute NX-protected page - exploit attempt? (uid: 0)
kernel: BUG: unable to handle page fault for address: ffff8cf6c69c4780
kernel: #PF: supervisor instruction fetch in kernel mode
kernel: #PF: error_code(0x0011) - permissions violation
```

`ffff8cf6c69c4780`는 커널 가상 주소 공간의 데이터 영역이다. 커널이 이 주소를
**코드로서 실행(instruction fetch)**하려 했다는 것이 핵심이다. NX(No-Execute) 비트가
설정된 페이지이므로 CPU가 실행을 차단하고 fault를 발생시켰다.

이것은 NULL dereference보다 더 심각한 패턴이다. 함수 포인터가 잘못된 데이터 주소로
덮어써졌다는 것을 의미한다. 중첩 가상화에서 VirtualBox의 메모리 맵핑이 깨지면서
커널 내부 자료구조의 함수 포인터 필드가 엉뚱한 값으로 오염된 것이다.

```markdown
               정상 흐름           |        오염된 흐름
                                   |
커널 함수 포인터 → 코드 영역       | 커널 함수 포인터 → 데이터 영역
                  (RX 권한)        |                  (RW 권한, NX 설정)
                  실행 OK           |                  NX 위반 → 패닉
```

**로그의 `exploit attempt?` 문구에 대하여:** 커널이 NX 위반을 감지했을 때 출력하는
표준 경고 메시지다. 실제 공격이 아니라 메모리 오염에 의한 것임을 확인했다.

두 패닉 모두 **중첩 가상화(VirtualBox → KVM → QEMU) 스택에서의 메모리 맵핑 불일치**가
근본 원인이다. `02-vm-lifecycle/01-vm-create.md §9`에서 다룬 VirtIO NIC Hang과
동일한 레이어의 문제지만, NIC 초기화가 아닌 메모리 관리 경로에서 터진 것이다.

---

#### 8.4 그 외 로그 항목 해석

```bash
# zpool-trim.service 실패
# Apr 16 09:30:01 systemd[1]: Failed to start zpool-trim.service - ZFS Pool TRIM - local-zfs.

# 원인: 부팅 직후 09:30에 타이머가 발동했는데, 이 시점에 ZFS 풀이
# 아직 완전히 마운트되지 않았거나 이전 부팅의 커널 패닉 직후라
# ZFS 서브시스템이 정상화되지 않은 상태였을 가능성이 높다.
# Persistent=true 설정이 있으므로 다음 부팅 시 자동 재시도된다.
# 수동 확인:
systemctl status zpool-trim.service
journalctl -u zpool-trim.service -n 20

# ----------------------------------------------------------

# authentication failure
# Apr 16 14:28:56 pvedaemon[1386]: authentication failure; rhost=::ffff:10.10.250.119 user=root@pam

# 10.10.250.119는 kcy0122 자기 자신의 IP다. 자기 자신에게 로그인을 시도했다가
# 실패한 것이다. pmxcfs 쿼럼 붕괴 후 복구 과정에서 pvedaemon이 자동 재인증을
# 시도하는 과정에서 발생하는 경우가 있다. 1회성이면 무시.

# ----------------------------------------------------------

# Backup of VM 201 failed - unable to find VM '201'
# Apr 16 16:39:21 pvescheduler[1552]: ERROR: Backup of VM 201 failed - unable to find VM '201'

# VM 201이 이 시점에 kcy0122 노드에 없었다. 클러스터 환경에서 VM은
# 어느 노드에도 있을 수 있는데, 백업 스케줄러가 VM 201을 kcy0122에서
# 찾으려 했지만 실제로는 다른 노드에 있거나 HA 페일오버로 이전된 상태.
# 백업 Job 설정에서 노드를 고정하지 말고 VM ID 기준으로만 설정했는지 확인.
```

#### 8.5 KNET 반복 단절 — Corosync 토큰 타임아웃 튜닝

**증상:**

특별한 작업 없이 대기 중이던 상태에서 아래 패턴의 로그가 주기적으로 반복된다.

```log
corosync[1321]: [KNET  ] link: host: 2 link: 0 is down
corosync[1321]: [TOTEM ] Token has not been received in 2781 ms
corosync[1321]: [TOTEM ] A processor failed, forming new configuration: token timed out (3650ms)
...
corosync[1321]: [KNET  ] rx: host: 2 link: 0 is up
corosync[1321]: [TOTEM ] A new membership (1.4bc) was formed. Members joined: 2
```

약 30초 만에 자동 복구되지만, 해소와 재발이 반복된다. `8.2`에서 다룬 단발성 타임아웃과 달리, 여기서는 노드 간 연결이 **초 단위로 끊겼다 연결되는 발작 증상**이 지속된다.

**원인:**

VirtualBox 중첩 가상화의 두 가지 구조적 지연이 Corosync 기본 토큰 타임아웃(3000ms)을 간헐적으로 초과한다.

- **CPU 스케줄링 딜레이 (Steal Time):** L0(Windows 호스트)이 L1(Proxmox VM)에 CPU 사이클을 할당하는 과정에서 찰나의 병목이 발생한다. VM 내부 시간 기준으로는 Corosync 데몬이 아무것도 안 하고 있었어도, 실제로는 호스트 스케줄러에 의해 선점당한 것이다.
- **가상 네트워크 스택 오버헤드:** 물리 NIC → VirtualBox 가상 스위치 → 가상 NIC → Linux 브릿지(vmbr0)로 이어지는 다단계 I/O 처리에서 미세한 패킷 지연이 누적된다.

이 두 요인이 겹치면 토큰이 3초를 넘기는 False Positive(실제 장애가 없는데 장애로 판정)가 빈번하게 발생한다.

**해결 ─ Corosync 토큰 타임아웃 상향 조정:**

`/etc/pve/corosync.conf`의 `totem` 블록에 `token` 파라미터를 추가하여 타임아웃 허용치를 10초로 늘린다.

> **주의:** `/etc/pve/corosync.conf`는 pmxcfs의 관리 대상이다. `vi`로 직접 편집하면 pmxcfs와의 동기화가 깨질 수 있다. **반드시 복사본을 수정한 뒤 `mv`로 덮어씌우는 방식**으로 작업한다.

```bash
# 1. 작업 복사본 생성
cp /etc/pve/corosync.conf /etc/pve/corosync.conf.new

# 2. 복사본 수정
vi /etc/pve/corosync.conf.new
```

`totem` 블록에 `token: 10000` 추가 및 `config_version`을 증가시킨다:

```ini
totem {
  cluster_name: test
  config_version: 4        # ← 3에서 4로 증가 (반드시 올려야 함)
  token: 10000             # ← 추가: 10초 (기본값 3000ms → 10000ms)
  interface { linknumber: 0 }
  ip_version: ipv4-6
  link_mode: passive
  secauth: on
  version: 2
}
```

```bash
# 3. 원본 덮어쓰기 (mv = atomic rename, 동기화 트리거)
mv /etc/pve/corosync.conf.new /etc/pve/corosync.conf
```

`mv`로 파일을 교체하는 순간 pmxcfs가 변경을 감지하고 **재시작 없이 클러스터 전체에 Hot Reload**를 수행한다.

**Hot Reload 확인 로그:**

```log
corosync[1316]: [CFG    ] Config reload requested by node 3
corosync[1316]: [TOTEM ] Configuring link 0
pmxcfs[1090]: [status] notice: update cluster info (cluster name test, version = 4)
```

**`config_version`을 올려야 하는 이유:**

Corosync는 클러스터에 합류할 때 각 노드의 `config_version`을 비교한다. 버전이 낮은 노드가 있으면 해당 노드의 설정을 최신 버전으로 자동 갱신한다. `config_version`을 올리지 않으면 다른 노드들이 변경 사실을 인지하지 못한다.

---

#### 8.6 오프라인 노드 재합류 시 config_version 불일치 — 강제 수동 동기화

**증상:**

`8.5`에서 설정을 변경한 후, 당시 오프라인 상태였던 노드(pve, 1번)가 구버전 설정(`config_version: 3`)을 들고 클러스터에 재합류를 시도했다. 해당 노드의 corosync 데몬이 버전 불일치를 감지하고 스스로 종료했다.

```log
# pve 노드 로그 (문제 발생 시)
corosync[...]: Received config version (4) is different than my config version (3)!
corosync[...]: Exiting.
```

이 상태에서 pmxcfs가 쿼럼을 잃고 `/etc/pve/`가 Read-Only로 잠겼다. pve 노드에서 어떤 설정 변경도 불가능한 상태가 된다.

**원인:**

`/etc/pve/corosync.conf`는 pmxcfs가 실시간으로 모든 노드에 동기화하지만, pmxcfs 자체가 Corosync에 의존하므로 **노드가 오프라인 상태일 때는 동기화가 전달되지 않는다.** 노드가 복귀했을 때 `/etc/corosync/corosync.conf`(로컬 경로)가 구버전으로 남아있는 상태에서 corosync 데몬을 기동하면 불일치가 발생한다.

**해결 ─ 정상 노드에서 설정 파일 강제 복사 후 데몬 재시작:**

pve 노드에서 `/etc/pve/`가 Read-Only이므로, 정상 노드(kcy0122)에서 직접 **로컬 경로**(`/etc/corosync/`)로 최신 설정 파일을 복사한다.

```bash
# 1. 정상 노드(kcy0122)에서 장애 노드(pve)로 최신 설정 파일 강제 복사
#    /etc/pve/가 아닌 /etc/corosync/ 로컬 경로를 직접 덮어씀
scp root@10.10.250.119:/etc/corosync/corosync.conf \
    root@10.10.250.115:/etc/corosync/corosync.conf

# 2. 장애 노드(pve)에서 실행 — Corosync 데몬 재시작
systemctl restart corosync

# 3. pmxcfs 재시작으로 쿼럼 복구 트리거
systemctl restart pve-cluster
```

**복구 확인 로그:**

```log
pve pmxcfs[4626]: [status] notice: update cluster info (cluster name test, version = 4)
pve pmxcfs[4626]: [status] notice: node has quorum
pve corosync[4643]: [QUORUM] Sync members[3]: 1 2 3
pve corosync[4643]: [TOTEM ] A new membership (1.537) was formed. Members joined: 2 3
pve pvesh[1605]: got quorum
```

**이 사례가 주는 교훈:**

1. `corosync.conf`를 변경할 때 **모든 노드가 온라인 상태인지** 먼저 확인한다.
2. 오프라인 노드가 있다면, 해당 노드가 복귀하기 전에 `/etc/corosync/corosync.conf`를 수동으로 최신 버전으로 교체해두거나, 복귀 직후 바로 위 복구 절차를 수행한다.
3. `config_version`은 단순 버전 관리 용도가 아니라 **클러스터 재합류 시 불일치 감지의 핵심 키**다. 설정을 변경할 때마다 반드시 올린다.

---

## 02-vm-lifecycle

### VirtIO NIC — VirtualBox 중첩 환경 Hang

#### 9.1 문제 개요

VirtualBox 위의 Proxmox 환경에서 VirtIO NIC(`--net0 virtio,...`)가 설정된 VM을 `qm start`하면 **Proxmox 호스트 전체가 Hang(무응답)** 된다. SSH 끊김, Web UI 접속 불가 상태가 된다. 그러나 VirtualBox의 VMState는 `"running"`이며 콘솔 화면은 정상 표시된다.

가상화 스택의 구조:

```markdown
Layer 4: 게스트 OS (Debian/Ubuntu)        ← VM 내부
Layer 3: QEMU 프로세스                    ← Proxmox 안에서 실행
Layer 2: Proxmox (Debian + KVM 모듈)      ← VirtualBox 게스트
Layer 1: VirtualBox + Nested VT-x         ← Windows 호스트
Layer 0: Windows + 물리 CPU (VT-x)        ← 실제 하드웨어
```

#### 9.2 근본 원인 — VirtQueue 메모리 매핑

VirtIO NIC는 게스트와 QEMU 사이에 **공유 메모리(VirtQueue)**를 설정한다. 정상 베어메탈 환경에서 이 메모리 매핑은 2단계다:

```markdown
GPA → HPA  (Guest Physical Address → Host Physical Address)
      EPT(Extended Page Table)로 하드웨어 처리
```

VirtualBox 중첩 환경에서는 이것이 **3단계**로 뻥튀기된다:

```markdown
L2 GPA → L1 GPA → L0 HPA
(게스트)  (Proxmox)  (Windows 물리)
```

각 단계의 주소 변환을 VirtualBox가 소프트웨어로 에뮬레이션하는 과정에서, `ioeventfd` 처리 경로가 Nested 환경에서 교착(Deadlock) 또는 무한 루프에 빠진다. 결과적으로 Proxmox의 모든 vCPU가 VirtualBox 내부 메모리 관리 코드에 갇혀 다른 작업을 스케줄링하지 못한다.

**왜 콘솔은 정상으로 보였나:** VirtualBox 콘솔 렌더링은 VirtualBox 프로세스 자체의 스레드에서 처리되므로 Proxmox 내부 CPU 상태와 무관하게 마지막 렌더링된 화면을 계속 표시한다.

#### 9.3 해결: `e1000`으로 NIC 모델 교체

`e1000` 에뮬레이션은 전통적인 MMIO + 인터럽트 경로를 사용한다. 이 경로는 VirtualBox의 Nested VT-x 구현에서 가장 잘 테스트된 코드 경로이며, VirtQueue 같은 복잡한 공유 메모리 매핑이 없다.

```bash
qm set <VMID> --net0 e1000,bridge=vmbr0,firewall=1
```

#### 9.4 VirtualBox Nested 환경 제약 요약

| 항목                 | 사용 가능 | 비고                                          |
| -------------------- | --------- | --------------------------------------------- |
| KVM 하드웨어 가속    | ✅        | `--nested-hw-virt on` 활성화 필요             |
| `--cpu host`         | ✅        | 물리 CPU 기능 패스스루 동작                   |
| VirtIO 디스크 (SCSI) | ✅        | `virtio-scsi-single` + `iothread=1` 정상 동작 |
| VirtIO NIC           | ❌        | **Hang 유발. `e1000`으로 대체 필수**          |

> 이 제약은 VirtualBox 중첩 환경의 한계이지, VirtIO NIC 자체의 문제가 아니다. 물리 서버 Proxmox에서는 VirtIO NIC가 최선이다.

VirtIO NIC 아키텍처와 디버깅 과정의 전체 분석은 `06-references/02-nic-architecture-postmortem.md`에서 다룬다.

---

## 04-storage

### NFS Shared Storage 마운트 실패

#### 3.1 NFS 서버 상태 먼저 확인

```bash
# NFS 서버 노드(pve-ksy)에서
systemctl status nfs-server
# Active: active (exited) → 정상

# Export 목록 확인
exportfs -v
# /mnt/nfs_shared  10.10.250.0/24(sync,wdelay,hide,no_subtree_check,
#                                  sec=sys,rw,secure,no_root_squash,no_all_squash)

# 클라이언트에서 NFS 서버 Export 목록 조회 가능 여부 확인
showmount -e 10.10.250.117
# Export list for 10.10.250.117:
# /mnt/nfs_shared 10.10.250.0/24
```

`showmount`가 정상 응답하면 네트워크 레이어 문제가 아니고, 클라이언트 쪽 Stale 마운트 상태임이 확인된다.

#### 3.2 Stale 마운트 해제 및 재마운트

일반 `umount`는 Stale 상태에서 응답하지 않는다. `-l`(lazy) 옵션을 사용한다.

```bash
# 1. pvestatd 재시작 (Proxmox 스토리지 활성화 재시도 — 실패해도 무방)
systemctl restart pvestatd

# 2. Stale 마운트 강제 해제
#    -l (lazy): 파일시스템 네임스페이스에서 즉시 분리.
#    실제 해제는 참조가 모두 사라질 때까지 지연됨.
#    일반 umount는 Stale 상태에서 동작 안 함.
umount -l /mnt/pve/shared

# 3. 마운트 포인트 디렉터리 보장
mkdir -p /mnt/pve/shared

# 4. 수동 재마운트
mount -t nfs 10.10.250.117:/mnt/nfs_shared /mnt/pve/shared

# 5. 복구 확인
pvesm status | grep shared
# shared  nfs  active  151720960  84142080  61022208  55.46%   ← active 확인
```

### NFS 마운트 재발 방지 — systemd Drop-In 구성

#### 4.1 설계 목표

문제의 본질은 **부팅 순서**: `pvestatd`가 NFS 서버 준비를 확인하지 않고 마운트를 시도한다는 것이다.

```markdown
[현재]
network-online.target → pvestatd 시작 → NFS 마운트 시도
                                              ↑
                                     (서버 미준비 시 실패)

[목표]
network-online.target → NFS 서버 응답 확인 → pvestatd 시작
                              ↑                    ↑
                      서버 준비 보장 후        마운트 성공 보장
```

`/etc/fstab` 직접 수정은 Proxmox에서 권장하지 않는다. Proxmox는 `pvestatd`가 스토리지를 관리하므로 fstab과 pvestatd가 충돌할 수 있기 때문이다.

대신 `pvestatd.service`에 **Drop-In(`.d/` 디렉터리의 보조 설정 파일)** 방식으로 의존성을 주입한다. Proxmox가 업데이트되어 `pvestatd.service` 원본이 덮어씌워져도, Drop-In 파일은 유지된다.

#### 4.2 파일 1: NFS 마운트 보장 스크립트

`/usr/local/bin/nfs-shared-mount.sh`를 생성한다:

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

# 1. NFS 서버 응답 대기
# showmount는 단순 ping이 아니라 rpcbind(111) + mountd까지 확인한다.
# NFS 서버가 실제로 Export를 제공할 준비가 됐는지 검증하는 것이 핵심.
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

# 2. Stale 마운트 해제
# mountpoint -q로 현재 마운트 여부 확인.
# 마운트가 걸려있으면 lazy unmount(-l)로 강제 해제.
if mountpoint -q "$MOUNT_POINT"; then
    echo "[nfs-shared-mount] Stale mount detected. Lazy unmounting..."
    umount -l "$MOUNT_POINT"
    sleep 1
fi

# 3. 마운트 포인트 디렉터리 보장
mkdir -p "$MOUNT_POINT"

# 4. NFS 마운트
echo "[nfs-shared-mount] Mounting ${NFS_SERVER}:${NFS_EXPORT} -> ${MOUNT_POINT}"
if mount -t nfs "${NFS_SERVER}:${NFS_EXPORT}" "$MOUNT_POINT"; then
    echo "[nfs-shared-mount] Mount successful."
    exit 0
else
    echo "[nfs-shared-mount] ERROR: mount failed."
    exit 1
fi
```

#### 4.3 파일 2: systemd 서비스 유닛

`/etc/systemd/system/remount-nfs-shared.service`:

```ini
[Unit]
Description=Ensure NFS shared storage is mounted before pvestatd
# network-online.target: 단순 인터페이스 UP이 아니라
# 라우팅/DNS까지 준비된 상태를 의미한다.
After=network-online.target
Wants=network-online.target

[Service]
# oneshot: 프로세스 종료 시 서비스 완료로 간주. 배치 작업에 적합.
# RemainAfterExit=yes: 프로세스 종료 후에도 active 상태 유지.
#   이 설정이 없으면 pvestatd가 After= 의존성이 만족됐다고
#   판단하지 못해 Drop-In이 있어도 순서 보장이 안 된다.
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/local/bin/nfs-shared-mount.sh

[Install]
# multi-user.target: 네트워크 포함, GUI 제외 일반 부팅 단계.
# systemctl enable 시 이 target의 wants 디렉터리에 심링크를 생성한다.
WantedBy=multi-user.target
```

#### 4.4 파일 3: pvestatd Drop-In

`/etc/systemd/system/pvestatd.service.d/nfs-shared.conf`:

```ini
[Unit]
# pvestatd의 원본 유닛 파일을 수정하지 않고 Drop-In 방식으로 의존성 주입.
# Proxmox 업데이트가 pvestatd.service를 덮어써도 이 파일은 유지된다.
After=remount-nfs-shared.service
Wants=remount-nfs-shared.service
```

**`Wants=` vs `Requires=` 선택 이유:**
`Requires=`를 사용하면 마운트 서비스가 실패할 경우 `pvestatd`도 함께 종료된다. NFS 없이도 Proxmox 관리 기능(로컬 스토리지, VM 관리)은 유지되어야 하므로 `Wants=`가 적합하다.

#### 4.5 배포 절차

`pve`(.115)와 `kcy0122`(.119) **두 클라이언트 노드 모두**에 적용한다.

```bash
# 1. 스크립트 배포 및 실행 권한 부여
chmod 755 /usr/local/bin/nfs-shared-mount.sh

# 2. Drop-In 디렉터리 생성
mkdir -p /etc/systemd/system/pvestatd.service.d/

# 3. systemd 데몬 리로드 및 서비스 등록
systemctl daemon-reload
systemctl enable remount-nfs-shared.service

# 4. Drop-In 적용 확인
# 출력 하단에 nfs-shared.conf 섹션이 표시되어야 한다.
systemctl cat pvestatd.service
```

---

### ZFS TRIM 실패 (HDD 에뮬레이션)

#### 7.1 zpool trim 실패 — VirtualBox 가상 디스크의 HDD 에뮬레이션

**증상:**

```log
systemd[1]: Failed to start zpool-trim.service - ZFS Pool TRIM - local-zfs.
```

**원인:**

ZFS는 `zpool trim`을 실행하기 전에 대상 블록 디바이스가 **SSD(rotational=0)**인지 확인한다. HDD(rotational=1)로 인식된 디스크에는 TRIM 명령 자체를 거부한다. 플래터 기반 물리 디스크는 TRIM의 수혜 대상이 아니기 때문이다.

VirtualBox는 가상 디스크(VDI)를 게스트 OS에 기본적으로 **HDD(rotational=1)**로 에뮬레이션하여 노출한다. 호스트의 물리 디스크가 SSD여도, 게스트 OS는 이를 알지 못한다.

```bash
# Proxmox 내부에서 ROTA 값 확인
lsblk -d -o name,rota

# NAME  ROTA
# sda      1   ← OS 디스크
# sdb      1   ← ZFS 디스크 (HDD로 인식됨) ← 문제
```

**해결 1 — VirtualBox 디스크 속성 변경:**

Proxmox VM을 **완전히 종료**한 상태에서 Windows 호스트의 PowerShell에서 실행한다.

```powershell
# 포트 번호는 VirtualBox VM 설정 → Storage에서 해당 VDI가 연결된 포트 확인
VBoxManage storageattach "Proxmos-9.1-1" `
  --storagectl "SATA" `
  --port 3 `
  --device 0 `
  --type hdd `
  --medium "C:\Users\letech\VirtualBox VMs\Proxmos-9.1-1\Proxmos-9.1-1_3.vdi" `
  --nonrotational on `
  --discard on
```

`--nonrotational on`: 게스트 OS가 이 디스크를 SSD로 인식하도록 설정한다.
`--discard on`: 게스트에서 발생한 TRIM 명령이 호스트 물리 디스크까지 패스스루되도록 한다.

Proxmox 재시작 후 ROTA 값 변경 확인:

```bash
lsblk -d -o name,rota

# NAME  ROTA
# sda      1
# sdb      0   ← SSD로 인식됨 (정상)
```

**해결 2 — systemd 서비스에 재시도 로직 추가:**

일시적 오류(부팅 직후 ZFS 풀 미준비 등)로 TRIM이 실패했을 때 무한 재시도하는 안티 패턴을 방지하고, 유한한 재시도 후 관리자 개입을 유도하도록 서비스 유닛을 수정한다.

`/etc/systemd/system/zpool-trim.service`:

```ini
[Unit]
Description=ZFS Pool TRIM - local-zfs
After=zfs.target
# 1시간 내에 3번 실패하면 더 이상 재시도하지 않음 (무한 루프 방지)
StartLimitIntervalSec=1h
StartLimitBurst=3

[Service]
Type=oneshot
ExecStart=/sbin/zpool trim local-zfs
StandardOutput=journal
StandardError=journal
# 실패했을 때만 재시작
Restart=on-failure
# 실패 후 10분 뒤에 재시도
RestartSec=10m
```

`StartLimitIntervalSec` + `StartLimitBurst` 조합: 1시간 슬라이딩 윈도우 안에서 최대 3번 시작을 허용한다. 3번을 모두 소진하면 서비스가 `failed` 상태로 전환되어 더 이상 자동 재시도하지 않는다. 이 상태는 `journalctl -u zpool-trim.service`에서 확인하고 관리자가 수동으로 `systemctl reset-failed zpool-trim.service` 후 재시도해야 한다.

```bash
# 변경사항 적용
systemctl daemon-reload

# 수동 즉시 실행 (테스트)
systemctl start zpool-trim.service
systemctl status zpool-trim.service
```

**정상 완료 시 상태:**

```log
○ zpool-trim.service - ZFS Pool TRIM - local-zfs
     Loaded: loaded (/etc/systemd/system/zpool-trim.service; static)
     Active: inactive (dead) since Fri 2026-04-17 10:14:45 KST; 1min 12s ago
    Process: 1797 ExecStart=/sbin/zpool trim local-zfs (code=exited, status=0/SUCCESS)

Apr 17 10:14:45 kcy0122 systemd[1]: Finished zpool-trim.service - ZFS Pool TRIM - local-zfs.
```

`Type=oneshot` 서비스는 명령이 성공적으로 종료되면 `inactive (dead)` 상태가 된다. 이것은 에러 상태가 아니라 **정상적인 완료 상태**다.

**Timer의 `active (waiting)` 상태도 마찬가지로 정상이다:**

```log
● zpool-trim.timer - ZFS Pool TRIM Timer - daily at 09:30
     Active: active (waiting) since Fri 2026-04-17 09:58:38 KST; 5min ago
    Trigger: Sat 2026-04-18 09:30:00 KST; 23h left
```

다음 스케줄까지 대기 중임을 의미한다.

---

## 05-ha-and-automation

### SSH publickey 강제

#### 8.1 SSH 접속 시 publickey 인증 강제 문제

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

### known_hosts 충돌

#### 8.2 known_hosts 호스트 키 충돌

VM을 재생성하거나 같은 IP를 재사용하면 SSH 호스트 키가 변경된다. 기존 `known_hosts`의 이전 키와 충돌하면 연결이 거부된다.

```bash
# 충돌 키 제거
ssh-keygen -f '/root/.ssh/known_hosts' -R '10.10.250.120'

# 이후 재접속 시 새 키 자동 등록
ssh kcy0122@10.10.250.120
```

### cicustom 미반영

#### 8.3 `cicustom` 설정 후 변경이 반영 안 될 때

```bash
# Cloud-Init ISO 재생성 누락 여부 확인
qm cloudinit dump 301 user   # 현재 ISO에 들어간 user-data 내용 출력

# 재생성
qm cloudinit update 301

# VM 재시작 후 확인
qm stop 301 && qm start 301
```

### sshd 설정 확인

#### 8.4 sshd 설정 적용 확인

설정 파일을 직접 읽는 것보다 sshd가 실제로 읽고 있는 값을 확인하는 것이 정확하다:

```bash
sshd -T | grep -E 'passwordauthentication|permitrootlogin'
# permitrootlogin yes
# passwordauthentication yes
```

#### 8.5 dpkg 손상 발생 시 수동 복구

Cloud-Init이 `dpkg --configure -a` 처리 후에도 실패한 경우 수동 복구:

```bash
# VM 내부에서
sudo rm /var/lib/dpkg/updates/*
sudo dpkg --configure -a
sudo DEBIAN_FRONTEND=noninteractive apt install -y qemu-guest-agent
sudo systemctl enable --now qemu-guest-agent
```

---

### HA 에러 복구 & Corosync 연쇄 장애

#### HA 에러 복구 시퀀스

##### 5.1 error 상태 발생 원인

VM 기동 시도가 반복 실패하면 CRM은 해당 리소스를 `error` 상태로 마킹하고 자동 개입을 멈춘다. 원인 없이 무한 재시도하면 페일오버 폭풍(Failover Storm)이 발생할 수 있으므로, CRM이 스스로 개입을 중단하는 것이다.

```bash
ha-manager status
# service vm:101 (kcy0122, error)   ← error 상태
```

##### 5.2 Proxmox 9.x 에러 복구 절차

Proxmox 9.x에서 `clear-error` 명령이 제거되었다. `disabled`로 전환하여 에러 플래그를 해소한 뒤 `started`로 올리는 2단계 방식을 사용한다.

```bash
# Step 1. error 플래그 해소: disabled로 전환
ha-manager set vm:101 --state disabled
# trying to acquire cfs lock 'domain-ha' ...
#  OK

# 전환 확인
ha-manager status
# service vm:101 (kcy0122, disabled)

# Step 2. 기동 요청
ha-manager set vm:101 --state started

# Step 3. 상태 전이 모니터링
watch ha-manager status
# disabled → stopped → started → running 순서로 전환 확인
```

> Proxmox 8 이하에서는 `ha-manager crm-command clear-error vm:101` 명령이 존재했으나, 9.x부터 제거되었다. 버전 확인 없이 명령을 사용하면 혼란스러울 수 있으므로 `ha-manager help`로 사용 가능한 명령을 먼저 파악하는 습관이 중요하다.

##### 5.3 노드 장애 시 자동 페일오버 확인

노드 다운이 감지되면 CRM이 node-affinity 우선순위를 참조하여 다른 노드로 자동 이전한다:

```bash
ha-manager status
# lrm pve (old timestamp - dead?, Mon Apr 13 17:39:50 2026)   ← 노드 사망 감지
# service vm:101 (kcy0122, starting)                          ← 자동 페일오버 진행
```

ZFS Replication이 정상적으로 동작하고 있었다면, 마지막 복제 스냅샷을 기준으로 VM이 페일오버 노드에서 기동된다.

#### Corosync 토큰 타임아웃 → HA error 연쇄

##### 5.4 Corosync 토큰 타임아웃이 HA error를 유발하는 경로

Corosync 토큰 타임아웃이 발생하면 직접적으로 VM이 `error` 상태로 빠지지는 않는다.
그러나 다음 경로로 HA `error` 상태가 **간접 유발**될 수 있다.

```markdown
Corosync 토큰 타임아웃
    │
    ↓ 쿼럼 붕괴 시 — pmxcfs 읽기 전용 전환
    │
    ↓ pve-ha-lrm이 /etc/pve/ha/ 하위 파일에 상태 기록 불가
    │
    ↓ CRM과 LRM 간 상태 동기화 실패
    │
    ↓ CRM이 LRM의 응답을 받지 못하면 해당 노드의 VM을 기동 시도
    │
    ↓ 이미 실행 중인 VM을 다시 기동하려다 실패 → error 상태 마킹
```

실제 로그에서 확인된 패턴:

```bash
# 토큰 타임아웃 → cfs-lock 타임아웃 → HA 오작동 연쇄
# 토큰 타임아웃: 14:21:56
# cfs-lock 타임아웃: 14:44:24
# HA error 상태: 위 두 이벤트 이후 ha-manager status 확인 필요

# 상태 확인
ha-manager status
journalctl -u pve-ha-crm -n 50
journalctl -u pve-ha-lrm -n 50

# 쿼럼 회복 후에도 HA error가 남아있다면 §5.2 절차로 수동 복구
ha-manager set vm:<VMID> --state disabled
ha-manager set vm:<VMID> --state started
```

토큰 타임아웃이 반복된다면, Corosync 토큰 파라미터를 높여 VirtualBox 환경의
CPU 지연에 대한 허용 범위를 넓히는 것을 검토할 수 있다. (`01-setup/02-cluster-setup.md §8.2` 참고)

---

## 06-references

### 가상 NIC 아키텍처 & VirtualBox Nested 환경 장애 분석 (포스트모템)

#### 5.1 시간순 가설 목록

| #   | 가설                            | 조치                                         | 결과                                    | 원인이었나?                                                             |
| --- | ------------------------------- | -------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Hyper-V와 VirtualBox의 충돌     | Hyper-V 비활성화, `hypervisorlaunchtype off` | Nested VT-x 활성화 가능해짐             | **아니오.** Hyper-V는 VirtualBox 실행 자체를 방해했을 뿐, Hang과는 무관 |
| 2   | Nested VT-x 미활성화            | `--nested-hw-virt on`                        | KVM 사용 가능해짐                       | **아니오.** 전제 조건이었을 뿐, 활성화해도 Hang 발생                    |
| 3   | 메모리 부족 (OOM)               | VM RAM 2048→1024, 호스트 RAM 6G→8G           | Hang 계속 발생, `dmesg`에 OOM 기록 없음 | **아니오.** `free -h`에서 6.2GB 여유 확인                               |
| 4   | CPU 과다 할당                   | VirtualBox CPU 4→2                           | Hang 계속 발생                          | **아니오.**                                                             |
| 5   | KVM 하드웨어 가속 자체의 문제   | `kvm: 0` (소프트웨어 에뮬레이션)             | Hang 계속 발생                          | **아니오.** KVM 꺼도 뻗음                                               |
| 6   | `cpu: host` 옵션                | `cpu: kvm64`로 변경                          | Hang 계속 발생                          | **아니오.**                                                             |
| 7   | Nested VT-x 활성 상태 자체      | `--nested-hw-virt off`                       | Hang 계속 발생                          | **아니오.**                                                             |
| 8   | QEMU 프로세스 기동 자체         | 디스크 없는 깡통 VM(999) 생성/시작           | 정상 동작                               | — (QEMU 자체는 무죄)                                                    |
| 9   | LVM-thin 디스크                 | 999에 디스크 추가 후 시작                    | 정상 동작                               | **아니오.**                                                             |
| 10  | 디스크 크기 (32GB)              | 102 디스크 32G→4G                            | Hang 발생                               | **아니오.**                                                             |
| 11  | 디스크 옵션 (discard, iothread) | 102에서 옵션 제거                            | Hang 발생                               | **아니오.**                                                             |
| 12  | **VirtIO NIC (net0: virtio)**   | **102에서 net0 삭제**                        | **정상 동작**                           | **예!!! 유일한 원인**                                                   |

#### 5.2 확정 검증

| 테스트         | net0             | 결과     |
| -------------- | ---------------- | -------- |
| net0 삭제      | 없음             | 정상     |
| `net0: e1000`  | e1000 에뮬레이션 | 정상     |
| `net0: virtio` | VirtIO 준가상화  | **Hang** |

#### 5.3 왜 다른 가설들은 원인이 아니었나

**가설 1~2 (Hyper-V, Nested VT-x):** 이것들은 **환경을 구성하기 위한 전제 조건**이었다. Hyper-V를 끄는 것은 VirtualBox가 VT-x를 직접 사용할 수 있게 하기 위함이고, Nested VT-x를 켜는 것은 KVM이 동작할 수 있게 하기 위함이다. 이것들은 "QEMU를 실행할 수 있는 환경을 만드는" 단계이지, Hang의 원인과는 무관했다.

**가설 3 (메모리 부족):** 첫 번째 Hang은 실제로 메모리 부족이었을 수 있다 (6GB 호스트에 2GB VM). 하지만 호스트를 8GB로 올린 후에도 Hang이 발생했고, `free -h`에서 6.2GB 여유가 확인되었으며, `dmesg`에 OOM 기록이 없었다. 메모리는 첫 번째 사건의 **동시 발생 요인(Contributing Factor)**이었을 뿐, 근본 원인(Root Cause)은 아니었다.

**가설 4 (CPU 과다 할당):** 2코어/4논리 프로세서 호스트에 VirtualBox 4 vCPU를 할당하면 Windows가 느려질 수 있지만, VirtualBox VM 내부의 Proxmox가 Hang되는 원인이 되지는 않는다. CPU 기아(Starvation)가 발생하면 느려지지 SSH가 끊기는 게 아니다.

**가설 5~7 (KVM, cpu type, Nested VT-x):** 이것들은 QEMU의 **CPU 가상화 경로**에 영향을 준다. 하지만 원인은 CPU 가상화가 아니라 **NIC 가상화**였다. KVM을 끄고 소프트웨어 에뮬레이션(TCG)으로 돌려도 VirtIO NIC의 VirtQueue 메모리 매핑은 동일하게 수행되므로 Hang이 발생했다. 이 사실은 "CPU 가상화 방식과 무관하게, VirtIO NIC 초기화 자체가 문제다"는 것을 강하게 시사한다.

**가설 8~11 (QEMU, 디스크):** 깡통 VM(999)이 정상 동작한 것은 "QEMU 프로세스의 기동과 디스크 I/O는 문제없다"는 것을 증명했다. 디스크 크기와 옵션을 바꿔도 Hang이 발생한 것은 디스크 쪽이 무관하다는 것을 증명했다.

#### 5.4 디버깅 방법론에 대한 반성

돌이켜보면, **변수 격리(Variable Isolation)**를 더 일찍 했어야 했다. 첫 Hang 발생 시 "QEMU가 뻗었다"는 증상에서 곧바로 KVM, CPU, 메모리 등 "무거운" 변수들을 의심했지만, 실제로는 `.conf` 파일의 각 옵션을 하나씩 제거하면서 **최소 재현 조건(Minimum Reproducible Case)**을 찾는 것이 더 효율적이었다.

998(깡통 VM)과 102의 차이를 줄여나가는 방식은 교과서적인 **이진 탐색(Binary Search) 디버깅**이었고, 이 방법이 결국 답을 줬다.

---

> **DocEmbed 앵커 검증 방법:** 앵커가 일치하지 않으면 DocEmbed가 에러 메시지와 함께
> 해당 파일의 전체 slug 목록을 출력한다. 그 목록에서 올바른 앵커를 확인하여 수정하면 된다.
