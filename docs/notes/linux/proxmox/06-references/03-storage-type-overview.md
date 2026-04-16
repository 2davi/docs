---
title: "Proxmox 스토리지 타입 완전 정리(Temp.)"
date: 2026-04-14
lastmod: 2026-04-16
section: "notes"
category: "proxmox/references"
order: 3
series: "Proxmox VE 학습 시리즈"
---

## 1. 전체 구조를 먼저 그려라

스토리지를 이해하는 가장 빠른 방법은 "레이어(layer)"로 나눠 보는 것이다. Proxmox가 스토리지를 사용하는 흐름은 아래처럼 쌓인다.

```markdown
[물리 디스크 / VirtualBox 디스크 이미지]
         ↓
[파티션 / 블록 디바이스 (/dev/sda, /dev/vda 등)]
         ↓
[볼륨 관리 계층 (LVM) 또는 파일시스템 직접 마운트]
         ↓
[Proxmox 스토리지 플러그인이 그 위에서 관리]
         ↓
[VM 디스크 이미지 / 백업 / ISO / CT 볼륨]
```

중요한 포인트는, Proxmox 스토리지 타입이란 결국 "맨 위 레이어에서 어떤 방식으로 VM 디스크를 할당하고 관리하느냐"를 결정하는 플러그인이라는 것이다. 그 아래에 LVM이 있든, ZFS가 있든, NFS로 마운트된 경로가 있든 상관없이, Proxmox는 그 위에 적절한 플러그인을 올려서 쓴다.[^1]

***
## 2. Linux 디스크 레이어: 물리 디스크 → LVM
### 2-1. 물리 디스크와 블록 디바이스
모든 스토리지의 출발점은 물리 디스크(또는 VirtualBox 이미지처럼 OS가 블록 디바이스로 바라보는 것)다. Linux는 이것을 `/dev/sda`, `/dev/vda` 같은 블록 디바이스(block device) 경로로 노출한다. 블록 디바이스는 "임의의 위치를 블록 단위로 읽고 쓸 수 있는 장치"를 의미한다.
### 2-2. LVM 계층: PV → VG → LV
LVM(Logical Volume Manager)은 하나 이상의 블록 디바이스를 추상화해서 유연하게 논리적 볼륨을 만들어주는 커널 서브시스템이다. 계층 구조는 다음과 같다.[^2][^3]

| 계층 | 이름 | 역할 |
|---|---|---|
| 1단계 | **PV** (Physical Volume) | 블록 디바이스(`/dev/sda1` 등)를 LVM이 인식하는 단위로 초기화한 것[^4] |
| 2단계 | **VG** (Volume Group) | 하나 이상의 PV를 묶어서 하나의 "가상 디스크 풀"을 만든 것. 이 풀 안에서 LV를 잘라서 쓴다[^4][^5] |
| 3단계 | **LV** (Logical Volume) | VG를 잘라서 만든 "가상 파티션". 실제로 파일시스템을 올리거나 Proxmox가 VM 디스크로 직접 사용한다[^6][^3] |

쉽게 말하면: 물리 디스크 여러 개를 PV로 초기화해서 VG라는 큰 그릇에 담고, 그 그릇에서 필요한 크기만큼 LV를 잘라 쓰는 구조다.
### 2-3. LVM-Thick vs LVM-Thin: 핵심 차이
LV를 만들 때 공간을 "언제 실제로 할당하느냐"에 따라 두 가지 방식이 갈린다.[^1][^7]

**LVM-Thick (일반 LVM)**
- LV를 생성할 때 선언한 크기만큼 물리 공간을 **즉시** 확정해서 예약한다.[^8]
- 20GB LV를 만들면 VG에서 20GB가 바로 없어진다.
- 스냅샷을 만들면 "변경 예정 블록을 복사할 공간"을 미리 별도로 할당해야 하므로(COW 방식), 스냅샷 공간이 부족하면 스냅샷이 깨진다.[^9][^10]
- over-provisioning 불가. 단순하고 예측 가능한 구조.

**LVM-Thin (씬 프로비저닝)**
- VG 안에 먼저 **Thin Pool**을 만들고, 그 위에 Thin Volume을 올린다.[^7][^11]
- Thin Volume은 선언 크기보다 실제 물리 할당이 적어도 된다. 실제로 데이터가 써질 때 블록이 할당된다. 이게 **지연 할당(deferred allocation)**이다.[^7]
- 예: Thin Pool이 50GB인데, 각 20GB짜리 Thin Volume 5개를 만들 수 있다(합계 100GB). 실제 사용량이 50GB를 넘으면 그때 꽉 찬다.
- 스냅샷이 훨씬 효율적이다. Thin Volume과 스냅샷이 같은 데이터 영역을 공유하고, 변경된 블록만 추적하는 ROW(Redirect-on-Write) 구조이기 때문이다.[^12][^13]
- Proxmox에서 **Linked Clone**과 VM 스냅샷이 가능한 이유가 이 Thin Pool 구조 덕분이다.[^12]

***
## 3. ZFS: "볼륨 관리자 + 파일시스템"을 하나로 합친 것
### 3-1. ZFS가 다른 이유
전통적인 Linux 구조에서는 "블록 디바이스 → LVM → 파일시스템(ext4, xfs 등)" 이렇게 세 레이어가 분리되어 있다. ZFS는 이 세 레이어를 **하나의 시스템으로 통합**한다.[^14][^15]

ZFS는 스토리지 풀(zpool)을 기반으로 직접 파일시스템과 블록 볼륨(zvol)을 관리하기 때문에, LVM 같은 별도 볼륨 관리자가 필요 없다.[^15][^16]
### 3-2. ZFS 계층 구조
```
[물리 디스크 1, 2, 3 ...]
         ↓
[vdev (virtual device): 디스크 1~N개의 RAID 그룹 단위)]
         ↓
[zpool: 하나 이상의 vdev로 구성된 최상위 스토리지 풀]
         ↓
[dataset (파일시스템) 또는 zvol (블록 볼륨)]
```

- **vdev**: zpool을 구성하는 최소 단위. 단일 디스크, 미러(RAID1), RAIDZ(RAID5 계열) 등 구성 가능.[^15][^16]
- **zpool**: 서버의 최상위 스토리지 풀. 여러 vdev로 구성된다.[^15]
- **dataset**: zpool 내에서 파일시스템 역할. 쿼터, 압축, 스냅샷 등을 개별 설정 가능.[^15]
- **zvol**: dataset 대신 "블록 디바이스"처럼 쓰이는 볼륨. Proxmox에서 VM 디스크를 ZFS에 올리면 zvol 단위로 생성된다.
### 3-3. ZFS의 핵심 메커니즘
- **CoW (Copy-on-Write)**: 데이터를 덮어쓰지 않고, 변경 시 새로운 블록에 먼저 쓰고 메타데이터 포인터를 업데이트한다. 이 덕분에 스냅샷이 극히 빠르고 가볍다.[^17][^15]
- **체크섬 기반 무결성 검증**: 모든 블록에 체크섬을 달아, 읽을 때마다 손상 여부를 자동 감지하고 복구한다(self-healing).[^18][^17]
- **압축 & 중복 제거(dedup)**: 인라인에서 LZ4/GZIP 등으로 압축, 동일 블록 dedup 가능. 단 dedup은 메모리를 많이 쓰므로 기본 비활성화.[^15]
- **ARC 캐시**: RAM을 L1 캐시로, 선택적으로 SSD를 L2ARC(L2 캐시)로 쓰는 계층형 캐시 구조.[^15]
### 3-4. ZFS vs LVM: 무엇을 언제 쓰나
| 항목 | LVM / LVM-Thin | ZFS |
|---|---|---|
| 메모리 요구량 | 낮음 | 높음 (1TB당 1GB RAM 권장)[^19] |
| 순수 I/O 성능 | 더 빠름, 오버헤드 적음[^20] | 보통~높음 (CPU bound)[^18] |
| 데이터 무결성 | 체크섬 없음[^18] | 종단간 체크섬, self-healing[^17] |
| 스냅샷 안정성 | 많이 쌓이면 성능 저하[^18] | CoW 기반으로 안정적[^18] |
| Proxmox VM 복제 지원 | 미지원[^18] | 네이티브 스냅샷 활용 가능[^18] |
| 하드웨어 RAID 호환성 | 우수[^18] | 직접 디스크 접근 필요, 하드웨어 RAID와 충돌 가능[^18] |

***
## 4. Proxmox 스토리지 타입 분류
Proxmox는 스토리지를 크게 두 가지 종류로 나눈다.[^1][^21]

- **파일 기반(file-based)**: 파일시스템 위의 디렉터리를 스토리지로 씀. VM 디스크 이미지를 파일(qcow2, raw 등)로 저장.
- **블록 기반(block-based)**: 파일시스템을 거치지 않고 블록 디바이스를 직접 VM에 제공. 블록을 raw하게 다룸.
### 4-1. Directory (파일 기반)
- 구조: Linux 어느 파일시스템(ext4, xfs 등)이든 마운트된 디렉터리를 그대로 스토리지로 쓴다.[^1]
- VM 디스크는 해당 디렉터리 아래 파일(`.qcow2`, `.raw`)로 저장된다.
- 가장 단순한 구조. ISO 이미지, CT 템플릿, 백업 파일 저장에 적합.[^1]
- 스냅샷: qcow2 포맷을 쓰면 파일 레벨 스냅샷 가능(성능 불리).
- Proxmox 설치 시 기본으로 생기는 **local** 스토리지가 이 타입이다.
### 4-2. LVM (Thick)
- 구조: LVM VG를 직접 Proxmox 스토리지로 등록. VM 디스크 하나당 LV 하나가 생성됨.[^1]
- 할당 즉시 물리 공간 확정(Thick). over-provisioning 불가.[^8]
- 블록 기반이라 성능은 단순하고 예측 가능하지만, 스냅샷 지원이 제한적(Thick 스냅샷은 별도 공간 필요).[^12][^9]
- Proxmox에서 VM 스냅샷(메모리 포함)은 불가능하다.
### 4-3. LVM-Thin
- 구조: VG 안에 Thin Pool LV를 만들고, 그 위에 Proxmox가 VM 디스크마다 Thin Volume을 생성.[^7]
- 지연 할당으로 스토리지 효율이 높고, over-provisioning 가능.[^11][^7]
- **스냅샷과 Linked Clone 지원**: Thin Volume 간에 CoW 체인을 형성할 수 있어, Proxmox의 VM 스냅샷 및 Linked Clone 기능을 활용할 수 있다.[^12]
- 현재 네 환경의 **local-lvm** 이 이 타입.
### 4-4. ZFS
- 구조: zpool 위에 zvol 단위로 VM 디스크를 생성. 파일시스템 + 볼륨 관리자 통합.[^14][^22]
- CoW 기반 스냅샷, 체크섬 무결성, 압축, RAID-Z 내장.[^17][^22]
- Proxmox VM 복제(replication) 기능이 ZFS 스냅샷을 활용해 동작한다.[^18]
- 메모리 요구량이 높다. 최적 성능을 위해 RAM 여유가 필요.[^23][^19]
- 현재 네 환경의 **local-zfs** 가 이 타입.
### 4-5. NFS
- 구조: 다른 서버(또는 NAS)가 네트워크로 공유한 디렉터리를 Proxmox 노드에 마운트해서 **파일 기반 스토리지**로 쓴다.[^24][^25]
- NFS 서버 측에서 `/etc/exports`로 디렉터리를 공개, Proxmox 노드들은 이걸 마운트해서 같은 경로를 바라본다.[^26]
- 여러 노드가 동일한 NFS 경로를 공유하기 때문에 **멀티 노드 공유 스토리지**로 동작한다. HA(고가용성)나 라이브 마이그레이션에 활용 가능.[^25][^26]
- 성능과 가용성은 NFS 서버의 품질에 종속됨. NFS 서버가 내려가면 스토리지도 오프라인 됨.[^27]
- 현재 네 환경의 **shared** 가 이 타입.
### 4-6. Ceph (RBD)
- 구조: Ceph는 여러 노드의 물리 디스크를 하나의 **분산 오브젝트 스토리지 클러스터**로 묶는 소프트웨어다.[^28][^29]
- Proxmox는 Ceph의 **RBD(RADOS Block Device)** 를 통해 VM 디스크를 블록 디바이스처럼 사용한다.[^29][^28]
- LVM처럼 OS 레벨 블록 디바이스에 직접 올라가는 게 아니라, Ceph가 디스크와 Proxmox 사이에 "분산 스토리지 계층"으로 끼어들어 모든 디스크 I/O를 가로채는 구조다.[^28]
- 특징: 수평 확장(OSD 노드 추가로 용량/성능 확장), 3중 복제로 고가용성 제공, 노드 장애 시에도 데이터 보호.[^30][^29]
- 단점: 10GbE 이상의 전용 네트워크 필요, 최소 3노드 이상 권장, 운영 복잡도가 높다.[^30][^28]
- 소규모 환경이나 단일 노드에서는 실익이 없다. 멀티 노드 클러스터를 위한 스토리지다.[^31]
### 4-7. PBS (Proxmox Backup Server)
- 구조: PBS는 앞의 스토리지 타입들과 **다른 레이어**에 있다. VM 디스크를 올리는 곳이 아니라, **백업 데이터를 저장하는 전용 서버**다.[^32]
- PVE가 VM을 백업할 때, PBS는 디스크 내용을 **chunk(청크)** 단위로 쪼개서 해시 기반으로 저장한다. 동일 chunk가 이미 있으면 재사용, 없으면 새로 저장하는 방식으로 **deduplication(중복 제거)** 을 한다.[^33][^34]
- 첫 백업은 full에 가깝지만, 이후 백업은 변경된 chunk만 추가로 저장하는 **증분 백업** 구조다.[^33]
- PVE에서 `type: pbs`로 등록된 스토리지 항목은 "PBS 서버에 접속하기 위한 설정"이고, 실제 데이터는 PBS 서버 내부의 datastore에 쌓인다.[^33]
- PBS 서버 자체는 전용 ISO(Debian 기반)로 별도 VM 또는 물리 머신으로 운영하는 것이 정석이다.

***
## 5. 전체 타입 비교
| 타입 | 분류 | 기반 | 스냅샷 | 공유 가능 | 주요 용도 |
|---|---|---|---|---|---|
| Directory | 파일 기반 | 임의 파일시스템 디렉터리 | qcow2 한정[^1] | X (기본) | ISO, 백업, 단순 VM |
| LVM (Thick) | 블록 기반 | LVM LV | 제한적[^12] | X | 단순 VM 디스크 |
| LVM-Thin | 블록 기반 | LVM Thin Pool | 가능 (COW)[^12] | X | VM 디스크, 스냅샷/클론 |
| ZFS | 파일+블록 통합 | zpool / zvol | CoW, 안정적[^17] | 부분적 | VM 디스크, 고무결성 환경 |
| NFS | 파일 기반 (네트워크) | 원격 NFS 서버 디렉터리 | qcow2 한정[^24] | O | 멀티 노드 공유, 백업 |
| Ceph RBD | 블록 기반 (분산) | Ceph 클러스터 | 가능[^29] | O | 멀티 노드 HA 클러스터 |
| PBS | 백업 전용 | PBS 서버 chunk store | N/A[^32] | O | VM/CT 증분 백업 |

***
## 6. 네 환경에 대응시켜보기
현재 네 환경은:

- **local** (Directory): Proxmox 설치 루트 파일시스템 위의 `/var/lib/vz`. ISO, 스크립트, 백업 등.
- **local-lvm** (LVM-Thin): 설치 시 자동 구성된 thin-pool. VM 디스크의 기본 위치.
- **local-zfs** (ZFS): zpool로 구성된 별도 디스크. CoW 스냅샷, 무결성 검증 가능.
- **shared** (NFS): 다른 노드 또는 NAS가 공유하는 디렉터리. 여러 노드가 같이 바라봄.
- **pbs** (PBS): 팀원이 등록해 둔 PBS 스토리지 연결 항목. 현재 PBS 서버가 미설치 상태라 inactive.

즉, "VM 디스크를 어디에 올릴까" = local-lvm 또는 local-zfs,  "백업을 어디에 저장할까" = shared 또는 pbs(정상화 후)로 역할이 이미 나뉘어져 있는 구조다.

---

## References

1. [Proxmox VE: 스토리지 유형에 대해 알아보기 - - YesXYZ -](https://yesxyz.kr/about-storage-type-which-proxmox-support/) - Proxmox VE: 스토리지 유형에 대해 알아보기 · Directory. 구조: 파일 기반 저장소. · LVM. 구조: 물리 디스크를 논리적으로 관리하는 블록 기반 저장소.

2. [LVM 이란 무엇인가요? - CNF](https://www.cncf.co.kr/blog/lvm-overview/) - 1. LVM 의 기본 구성 요소 · PV (Physical Volume). 물리적인 디스크나 파티션을 LVM에서 사용할 수 있도록 초기화한 단위입니다. · VG (Volume Gr...

3. [논리 볼륨 구성 및 관리 | Red Hat Enterprise Linux | 9](https://docs.redhat.com/ko/documentation/red_hat_enterprise_linux/9/html-single/configuring_and_managing_logical_volumes/index) - 이 VG 내에서 LVM은 공백을 할당하여 논리 볼륨(LV)을 만듭니다. LV는 파일 시스템, 데이터베이스 또는 애플리케이션에서 사용할 수 있는 가상 블록 스토리지 장치입니다.

4. [[Linux] LVM(Logical Volume Manage) : PV, VG, LV - 항상 끈기있게](https://nayoungs.tistory.com/entry/Linux-LVMLogical-Volume-Manage-PV-VG-LV) - PV(Physical Volume) : 물리 장치와 직접 매핑, 다양한 장치로 생성 가능 · VG(Volume Group) : 하나 이상의 PV로 구성, 사용 가능한 PE를 LV에...

5. [LVM(Logical Volume Manager) 구조 및 개념 - 어제와 내일의 나 그 ...](https://lycos7560.com/etc/lvmlogical-volume-manager-%EA%B5%AC%EC%A1%B0-%EB%B0%8F-%EA%B0%9C%EB%85%90/40489/) - LVM의 계층 구조와 주요 개념 · 1. 물리적 계층: PV (Physical Volume) 및 PP (Physical Partition) · 2. 논리적 그룹 계층: VG (Vo...

6. [VG, PV, LV 에 대해서 - Doosil IT 공간](http://doosil87.github.io/linux/2019/08/01/VG,PV,LV.html) - VG, PV, LV 에 대해서LVM LVM은 Logical Volume Manager로, 저장장치들을 좀 더 효율적이고 유연하게 관리할 수 있는 커널의 부분과 프로그램을 뜻함.

7. [LVM Thin - 이헌제의 블로그 - 티스토리](https://whiteduck.tistory.com/173) - LVMThin에서는 Thin pool과 Thin Volume 이라는 두 가지 주요 개념을 사용합니다. ... 스냅샷 지원: 데이터의 백업이나 롤백을 쉽게 수행할 수 있는 스냅샷 ....

8. [LVM Thick-Provisioned 스냅샷 체인 활용](https://phum.co.kr/tech-116/) - 새로운 방식은 원본 디스크 이미지와 외부 스냅샷을 결합하여, 각 스냅샷을 별도의 LVM 논리 볼륨에 저장하는 체인 구조를 형성합니다. ✓동작 방식. 원본 ...

9. [67.8. 논리 볼륨의 스냅샷 | 시스템 설계 가이드](https://docs.redhat.com/ko/documentation/red_hat_enterprise_linux/8/html/system_design_guide/snapshot-of-logical-volumes_system-design-guide) - 논리 볼륨의 스냅샷. LVM 스냅샷 기능을 사용하면 서비스 중단 없이 특정 시간에 /dev/sda 와 같은 볼륨의 가상 이미지를 생성할 수 있습니다. 67.8.1.

10. [LVM Basic Architecture - 글루시스 기술 블로그](https://tech.gluesys.com/blog/2019/04/08/LVM.html) - COW 방식은 구성이 끝난 후 스냅샷 공간을 할당하기 어렵기 때문에 스토리지를 구성할 때 미리 스냅샷을 위한 공간을 할당합니다. 기존 데이터에서 ...

11. [67.9. 씬 프로비저닝된 볼륨 생성 및 관리(볼륨) | 시스템 설계 가이드](https://docs.redhat.com/ko/documentation/red_hat_enterprise_linux/8/html/system_design_guide/creating-and-managing-thin-provisioned-volumes_system-design-guide) - lvcreate 명령의 -T 또는 --thin 옵션을 사용하면 thin 풀 또는 thin 볼륨을 생성할 수 있습니다. 단일 명령을 사용하여 lvcreate 명령의 -T 옵션을 사용...

12. [LVM 스냅샷 관리 기능 개발 후기 (1) - 글루시스 기술 블로그](https://tech.gluesys.com/blog/2024/06/03/LVM-Plugin.html) - 배경 설명 · Thin 볼륨의 스냅샷: 원본 볼륨의 데이터를 공유하며, 자체 메타데이터 영역을 가지고 있습니다. 메타데이터 영역에는 스냅샷의 논리적 ...

13. [[스토리지] LVM(Logical Volume Management) 기본 아키텍처](https://chanchan-father.tistory.com/1100) - Thin LV들은 다른 논리 볼륨과 다르게 Thin pool이라는 가상풀을 사용 ... 기존 데이터에서 스냅샷을 생성하면 스냅샷은 기존 데이터를 가리키게 됨 ...

14. [제목: ZFS: 아키텍처, 개념, 주요 기능, 장단점 - 개발자 Lim](https://suhanlim.tistory.com/204) - ZFS는 기본적으로 볼륨 관리자와 파일 시스템의 통합이라고 볼 수 있습니다. 이는 파일 데이터 및 메타데이터에 대한 블록 스토리지 풀, 즉 'zpool'을 ...

15. [ZFS 파일 시스템](https://tech.gluesys.com/blog/2023/12/20/ZFSintro.html) - ZFS의 스토리지 풀 구조. ZFS의 스토리지 풀은 크게 여러 디스크를 포함한 가상 장치인 vdev(virtual device의 약자)와 스토리지 풀을 말하는 zpool(ZFS ....

16. ["초보자를 위한 ZFS" | GeekNews](https://news.hada.io/topic?id=10738) - ZFS는 스냅샷의 생성을 허용하며, 이는 저장소를 복제하지 않고 특정 시점의 파일시스템 상태를 저장합니다. ZFS는 또한 'ZFS send' 기능을 제공하며, ...

17. [RAID-Z와 ZFS 파일시스템 구조의 특징 분석 - C's Shelter](https://gnuhcjh.tistory.com/245) - 2. ZFS 파일시스템 구조 개요 · 풀(Pool) 기반 구조 · Copy-on-Write (CoW) 기반 아키텍처 · End-to-End 데이터 무결성 검증 · 스냅샷 및 클론 ...

18. [ZFS vs LVM for Local Storage in Proxmox VE - Instelligence.io](https://www.instelligence.io/blog/2025/08/choosing-the-right-proxmox-local-storage-format-zfs-vs-lvm/) - LVM is often faster than ZFS in raw I/O operations and has lower memory requirements. This makes it ...

19. [LVM vs ZFS: 시스템 관리자를 위한 심층 비교](https://go.lightnode.com/ko/tech/lvm-vs-zfs) - 리눅스의 논리 볼륨 관리자(LVM)와 Zettabyte 파일 시스템(ZFS)의 강점, 한계 및 사용 사례를 종합적으로 비교한 가이드입니다.

20. [ZFS vs LVM-Thin : r/Proxmox - Reddit](https://www.reddit.com/r/Proxmox/comments/1llf5xc/zfs_vs_lvmthin/) - LVM이 더 빠르고 오버헤드도 적어. 블록 스토리지 프로토콜로 설계됐거든. ZFS는 VM SAN 작업에 맞게 튜닝을 좀 해야 해. 안 그럼 오버헤드가 생길 거야.

21. [File vs. Block Storage - Proxmox Support Forum](https://forum.proxmox.com/threads/file-vs-block-storage.72259/) - The data partition was created as a block storage device and this is relatively new to me. Imagine m...

22. [[Proxmox] Disk 설정 가이드(Directory, LVM Thin, ZFS) - SEUHEU](https://seuheu.com/?p=1239) - ZFS는 파일 시스템과 볼륨 관리 기능을 동시에 제공하는 고급 스토리지 솔루션입니다. 스냅샷, 압축, RAID-Z 등을 지원하며, 안정성이 높아 Proxmox에서 ...

23. [Proxmox VE 심층 분석: 정의, 기능, 활용 방안 및 고려사항](https://blog.naver.com/simula/223837491036) - ZFS는 강력한 데이터 보호 기능과 성능을 제공하지만, 최적의 성능을 위해 상당한 양의 시스템 메모리(RAM)를 필요로 합니다. LVM이나 NFS와 같은 단순한 ...

24. [Proxmox VE + NFS 스토리지 연동 안정](https://phum.co.kr/tech-89/) - Proxmox에서 NFS 설정 방법 (Web UI) ; Datacenter → Storage → Add → NFS 선택; ID: nfs-store ; Server: NFS 서버 I...

25. [Proxmox NFS를 이용한 저장소 설정 - IT기술정보올리는곳](https://dong-it-engineer.tistory.com/95) - 1) NFS Storage 추가. proxmox Cluster에 Storage를 추가 등록 · 2) 필수 입력항목 (ID, Server, Export). 빨간색으로 표시된 부분은 ...

26. [Proxmox 클러스터링 및 NFS서버로 적용 - 블루베리의 개발일지](https://blueberryyum.tistory.com/56) - 1. 기본 전제 정리 (팩트) · Proxmox 5대 · 동일 라우터, 동일 스위치 연결 · 1대는 NFS 전용 공유 스토리지 · 나머지 4대는 컴퓨트 노드 · 목표: HA, 라이...

27. [내 노드가 내 VM 중 하나에서 호스팅되는 NFS 공유를 자동 ...](https://www.reddit.com/r/Proxmox/comments/rlokfe/i_need_my_node_to_auto_mount_an_nfs_share_that_is/) - 전용 하드웨어에 TrueNAS가 있고 UI를 통해 정상적으로 생성된 Proxmox에 대한 NFS 연결이 있습니다. TrueNAS를 종료하면 NFS 스토리지가 오프라인 ...

28. [Ceph을 이용한 HCI 형태의 Promox 3노드 클러스터 구성 상세 ...](https://lawmin.tistory.com/490) - Ceph Pool은 데이터를 저장하는 논리적인 단위입니다. Proxmox VE에서 VM 디스크는 RBD (RADOS Block Device) 이미지를 사용하므로 RBD Pool을 ...

29. [Proxmox Ceph: 소개 및 설치 가이드](https://www.vinchin.com/kr/vm-tips/proxmox-ceph.html) - Proxmox와 Ceph를 사용하면 고가용성 및 회복 탄력적인 인프라를 구축하면서 오픈소스 소프트웨어의 장점을 누릴 수 있습니다. 소규모 가상화 환경 ...

30. [Proxmox로 구현하는 하이퍼컨버지드 인프라 (가상화와 ...](https://blog.naver.com/thephum/223499749532) - 1. Proxmox VE 클러스터 내의 각 노드에 Ceph 패키지를 설치합니다. · 2. 웹 인터페이스나 명령줄을 통해 Ceph 클러스터를 초기화합니다. · 3. OSD(Objec...

31. [ceph에 대한 생각 : r/Proxmox](https://www.reddit.com/r/Proxmox/comments/1qz3hrv/thoughts_on_ceph/) - ceph는 컨테이너가 어디에서 실행되든 일관된 볼륨 마운트를 가능하게 해줘요. 복제의 경우, 모든 복제본이 동일한 데이터에 접근할 수 있어서, 어떤 ...

32. [Proxmox VE 백업 전략 비교: PBS vs 외부 백업 솔루션](https://phum.co.kr/tech-105/) - Proxmox Backup Server(PBS) – Proxmox 전용 백업의 강점. PBS는 Proxmox 개발팀이 직접 만든 공식 백업 솔루션으로 Proxmox VE와 100%...

33. [Proxmox Backup Server(PBS) 설치 및 구성에 대한 완벽 가이드](https://www.tecnoloblog.com/ko/Proxmox-Backup-Server(PBS)-%EC%84%A4%EC%B9%98-%EB%B0%8F-%EA%B5%AC%EC%84%B1-%EB%B0%A9%EB%B2%95/) - PBS 중복 제거 및 압축은 저장 공간 사용량을 최소화하고 백업 속도를 향상시킵니다. Proxmox VE와의 기본 통합 및 웹 또는 API를 통한 관리 기능을 통해 백업을 중앙 ....

34. [고효율 중복제거 기반 백업 시스템을 위한 실제 서버 환경 ...](https://oslab.kaist.ac.kr/wp-content/uploads/esos_files/publication/conferences/korean/dedup_dyy.pdf) - 요 약. 급증하는 데이터의 증가 추세에 맞춰서 백업의 중요성이 점차 대두되고 있다. 본 논문에서는 중복제거. 기반 백업 시스템 환경에서 파일들의 특성을 파악하여 ...

