---
title: "[B1] 트랙 B 랩과 노드 사전준비"
date: 2026-07-12
lastmod: 2026-07-12
author: "Davi"
description: ""
section: "deep-dive"
category: "deep-dive/kubernetes/rke2-bootstrap"
tags: [kubernetes, rke2, rke2-bootstrap, rocky-linux, hyper-v, multipass, precheck, preprep, selinux, firewalld]
doc_type: "learning-guide"
series: "rke2-bootstrap"
series_order: 9
order: 9
draft: false
search: true
toc: true
difficulty: "advanced"

ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-opus-4.8"]
  review: "reviewing"
---

# 트랙 B 랩과 노드 사전준비 {#track-b-lab-and-node-prep}

## 개요 {#overview}

이 문서는 트랙 B의 첫 실물 구간이다. [RKE2가 접는 것들](./b0-what-rke2-folds)에서 개념으로 그린 접힘 지도 위에, RKE2가 설치되기 전에 임의의 노드를 설치 가능 상태로 만드는 두 단계, 사전점검(pre-check)과 사전준비(pre-prep)를 손으로 건다. 이 두 단계는 제품 RKE2InstallSvc의 앞단 두 컴포넌트에 그대로 매핑된다.

구간은 세 조각이다. 트랙 B 3노드 랩을 세우고(우분투 두 대는 Multipass, Rocky 한 대는 Hyper-V 직접), 사전점검으로 노드가 요건을 만족하는지 게이트를 통과시키고, 사전준비로 그 노드를 조정한다. 특히 Rocky 노드가 RedHat 분기(SELinux·firewalld·NetworkManager·커널 모듈)를 실물로 꺼내며, Rocky 9와 10의 차이가 제품 백엔드의 버전 분기 로직으로 직결된다.

![트랙 B 랩 토폴로지 도식: Windows 호스트(10.240.0.1)와 rke2-server(10.240.0.30)·rke2-agent-0(10.240.0.31)·rke2-agent-1(10.240.0.32)이 multipass 전용선(Internal vSwitch, 10.240.0.0/24)에 eth1 고정 IP로 물리고, 각 노드 eth0는 Default Switch NAT로 인터넷에 닿는 이중 NIC 구조. Ubuntu 두 대는 Multipass, Rocky 한 대는 Hyper-V 직접 프로비저닝](./_embeds/img/b1-lab-and-node-prep//b1-lab-topology.svg)

## 사전점검·사전준비의 자리 {#place-of-precheck-preprep}

먼저 이 단계가 트랙 A에는 사실상 없었다는 것을 짚는다. Hard Way는 Multipass가 찍어준 깨끗한 Ubuntu 이미지를 전제로 바로 시작했다. 방화벽이 꺼져 있고, SELinux가 없고, 이전 설치 잔재가 없고, NetworkManager 대신 netplan이 도는 무균실이었다. 그런데 실무 노드는 무균실이 아니다. firewalld가 켜져 있고, SELinux는 enforcing이고, swap이 잡혀 있고, NetworkManager가 인터페이스를 물고 있다. 사전점검·사전준비는 그 임의의 실무 노드를 RKE2가 뜰 수 있는 상태로 만드는 명시적 체크리스트다. 트랙 A에서 암묵적으로 전제했거나([a5](./a5-worker-nodes#hosts-drift)의 `/etc/hosts`, `br-netfilter` 같은) 삽질로 뒤늦게 만난 것들이, 여기서는 설치 전에 통과해야 하는 앞단 게이트가 된다.

성질 하나를 붙잡는다. 사전점검은 fail-fast다. 점검이 실패하면 설치에 아예 들어가지 않는다. 트랙 A는 반쯤 세우고 나서 삽질로 굴렀지만([a5](./a5-worker-nodes)에서 노드 0개를 보고서야 이름 드리프트를 찾았다), 제품은 앞에서 막아야 롤백 비용을 물지 않는다. 이 fail-fast와 뒤의 롤백(uninstall.sh·killall.sh)이 한 세트인 것이 이 구간의 핵심 논리다.

> **제품으로 접히는 지점.** InstallSvc의 pre-check는 SSH로 노드에 붙어 OS·CPU·메모리·디스크·포트·기존 충돌을 조회하는 로직이고, pre-prep은 호스트명·swap·SELinux·firewalld·NetworkManager·시간동기를 조정한 뒤 config.yaml을 생성해 전송하는 로직이다. 반쯤 준비된 노드는 절반만 고장난 노드보다 나을 것이 없다는 것이, 앞단 게이트와 롤백이 세트인 이유다.

## 트랙 B 랩 토폴로지 {#lab-topology}

트랙 B는 3노드다. jumpbox는 만들지 않는다. [a0](./a0-lab-topology-and-network#jumpbox-bastion)의 jumpbox는 CA 워크스테이션이었는데, RKE2는 인증서를 서버에서 자동 생성하니 그 역할이 사라진다(b0에서 접힌 CA 층이다). kubectl은 서버 노드에서 친다(RKE2가 `/etc/rancher/rke2/rke2.yaml`에 kubeconfig를 떨군다). 조작이 나가는 콘솔 자리는 Windows 호스트이며, 이것이 제품의 SSH 백엔드 역할이다.

| 노드 | 역할 | OS | 프로비저닝 | eth1 고정 IP |
| --- | --- | --- | --- | --- |
| `rke2-server` | control-plane + etcd | Ubuntu 24.04 | Multipass | `10.240.0.30` |
| `rke2-agent-0` | worker | Ubuntu 24.04 | Multipass | `10.240.0.31` |
| `rke2-agent-1` | worker | Rocky Linux 10 | Hyper-V 직접 | `10.240.0.32` |

네트워크는 [a0](./a0-lab-topology-and-network#dedicated-switch-dual-nic)에서 만든 전용 스위치 `multipass`(Internal, 호스트 `10.240.0.1/24`)를 그대로 재사용한다. 세 노드 모두 이중 NIC다. `eth0`는 Default Switch NAT로 인터넷을 받고, `eth1`은 전용선에 고정 IP로 붙는다. 우분투 두 대는 [a0](./a0-lab-topology-and-network#netplan-static-mac)의 netplan MAC 매칭을 그대로 쓰고, Rocky는 NetworkManager의 nmcli로 고정 IP를 준다.

## Rocky 프로비저닝 경로 {#rocky-provisioning}

Rocky 노드는 우분투와 프로비저닝 경로가 갈린다. Multipass는 Windows에서 Rocky를 띄우지 못한다. 커스텀 이미지(`file://`·`https://`) 런치가 Linux 백엔드에서만 열려 있고 Windows·macOS에선 막혀 있으며, `multipass find`가 주는 것도 우분투 계열뿐이다. 그래서 Rocky 에이전트 한 대는 Hyper-V에 직접 만든다. `multipass` 전용 스위치가 이미 Hyper-V vSwitch이므로, Rocky VM을 그 스위치에 붙이면 우분투 노드들과 같은 대역에서 논다. 프로비저닝 경로만 갈리고 네트워크는 하나로 통일된다. ([Multipass image launch on Windows/macOS #1260](https://github.com/canonical/multipass/issues/1260), [Multipass Image](https://documentation.ubuntu.com/multipass/latest/explanation/image/))

Hyper-V VM은 2세대(Generation 2, UEFI 부트)로 만들고, 네트워크 어댑터를 두 장(Default Switch + `multipass`) 붙인다. Gen2 리눅스는 Secure Boot 템플릿을 "Microsoft UEFI(Unified Extensible Firmware Interface) Certificate Authority"로 바꿔야 부트한다. 기본 "Microsoft Windows" 템플릿이면 Rocky가 부트하지 못한다.

### x86-64-v3와 Hyper-V 프로세서 호환성 {#x86-64-v3-gotcha}

Rocky 10을 Hyper-V에 얹을 때 반드시 먼저 박아야 할 함정이 CPU 마이크로아키텍처 기준선이다. Rocky 10은 그 기준선을 x86-64-v3로 올렸다. AVX·AVX2·BMI1/2·FMA를 요구하며, Intel Haswell(2013) 이후면 만족한다. 문제는 Hyper-V의 프로세서 설정이다. VM 설정에서 "다른 프로세서 버전의 물리적 컴퓨터로 마이그레이션"(processor compatibility) 옵션을 켜면 CPU 기능을 옛 기준으로 가려버려서 AVX2가 사라지고, Rocky 10 설치가 `Fatal glibc error: CPU does not support x86-64-v3`로 즉사한다. 기본값이 꺼짐이니 그 옵션을 켜지 않으면 된다. 이 함정은 Rocky 9에는 없다. Rocky 9의 기준선은 x86-64-v2(2008년대 이후)라 훨씬 관대하다. 이 차이는 아래 [Rocky 버전 분기](#rocky-version-branch)에서 제품 관점으로 다시 짚는다. ([Rocky Linux 10 최소 하드웨어 요건](https://docs.rockylinux.org/10/guides/minimum_hardware_requirements/))

## Rocky 버전 분기 {#rocky-version-branch}

트랙 B가 Rocky를 붙인 값은 RedHat 분기를 실물로 겪는 데 있다. 그 분기는 Rocky 버전에 따라 다시 갈린다. 폐쇄망(air-gap) 인프라에 적용될 제품은 소비자가 구버전 게스트를 쓰는 경우를 상정해야 하므로, Rocky 9와 10의 차이가 곧 제품 백엔드의 버전 분기 로직이 된다. 사전준비에 영향을 주는 차이를 정리한다.

| 항목 | Rocky 9 | Rocky 10 | 사전준비 영향 |
| --- | --- | --- | --- |
| CPU 기준선 | x86-64-v2 (2008년대+) | x86-64-v3 (Haswell/2013+) | 구형 하드웨어는 10 부팅 불가. Hyper-V processor compatibility가 10을 깬다 |
| 커널 | 5.14 | 6.12 | 모듈 가용성·이름 차이 |
| 패키지 관리자 | dnf4 | dnf5 | 백엔드의 명령 호출·출력 파싱이 갈림 |
| `nf_conntrack` / `kernel-modules-extra` | 불필요(기본 커널 포함) | 필요(`dnf install kernel-modules-extra`) | 사전준비 단계가 버전에 따라 갈림 |
| iptables | `iptables-nft` 제공 | legacy 제거, nft 전용 | RKE2는 번들 iptables라 무영향. 그 밖 방화벽 로직은 분기 |
| 네트워크 설정 | NetworkManager (ifcfg 잔존) | NetworkManager 강제 (ifcfg 제거) | nmcli 경로는 공통. ifcfg 스크립트 가정 금지 |
| cgroup | v2 기본 | v2 기본 | 공통 |
| 지원 종료(EOL) | 2032-05-31 | 2035-05-31 | 폐쇄망 장기 지원 대상 판단 근거 |

두 차이가 제품에 특히 직결된다. 하나는 `kernel-modules-extra`다. RKE2 공식 요건은 "RHEL 10(및 Rocky 같은 파생)에서 `nf_conntrack`을 위해 추가 패키지가 필요하다"고 RHEL 10에 한정해 명시한다. Rocky 9에는 이 요건이 없다. `nf_conntrack`이 기본 커널 모듈에 포함되기 때문이다. 그래서 백엔드의 사전준비 생성 로직은 대상이 Rocky 10일 때만 이 설치 단계를 끼워야 한다. ([RKE2 Requirements](https://docs.rke2.io/install/requirements))

다른 하나는 CPU 기준선이다. 폐쇄망 인프라는 구형 하드웨어와 구버전 OS가 흔하다. x86-64-v3를 요구하는 Rocky 10은 2013년 이전 CPU에서 아예 서지 못하므로, 그런 환경의 소비자는 Rocky 9(v2)에 머문다. 따라서 사전점검이 대상 OS 버전과 CPU 기준선을 함께 판별해, Rocky 10 대상에는 v3 지원 여부를 검증하고 Rocky 9 대상에는 그 검증을 건너뛰는 분기가 필요하다. 버전 관리를 Java로 구현할 때 이 표가 그 분기 로직의 골격이 된다.

세 번째로 iptables는 짚되 오해를 걷어낸다. Rocky 10은 iptables-legacy를 제거해 nftables 전용이 됐지만, 이것은 RKE2 사전준비에 영향을 주지 않는다. RKE2가 containerd처럼 iptables도 자체 번들로 들고 돌기 때문이다. 그래서 Rocky 10이 legacy를 빼버려도 RKE2는 제 번들 바이너리로 돈다. 이 대목은 [삽질 박제](#iptables-overreach)에서 실측으로 확인한다.

> **제품으로 접히는 지점.** 제품의 번들 생성이 이미 "타겟 OS(RedHat/Debian)"를 입력받는데, 그 아래에 OS 메이저 버전(9/10)이 한 축 더 필요하다. InstallSvc의 pre-check가 대상에서 OS 버전과 CPU 기준선을 조회하고, pre-prep 생성기가 버전별로 다른 사전준비 스크립트를 뿌린다(Rocky 10에만 `kernel-modules-extra`, 10 대상에만 v3 검증). 이 분기표가 그 생성기의 명세다.

## 사전점검 {#precheck}

설치 전 게이트다. 네 항목으로 본다.

첫째 OS 지원이다. RKE2는 systemd와 iptables가 있는 리눅스면 대체로 돈다. 공식 검증 매트릭스가 따로 있고, RHEL 10·Rocky 10 계열은 위에서 본 `kernel-modules-extra`가 필요하다. 제품의 "타겟 OS 선택" 입력이 이 지점에 매핑된다.

둘째 하드웨어다. 최소 2 CPU·4GB RAM(권장 4 CPU·8GB), etcd 성능 때문에 SSD 권장이다. 서버 노드 사이징이 클러스터가 감당할 에이전트 수를 좌우한다. RKE2 서버는 컨트롤 플레인이 정적 파드에 etcd까지 얹혀 트랙 A보다 더 먹는다. ([RKE2 Requirements](https://docs.rke2.io/install/requirements))

셋째 기존 설치 충돌이다. 이전 rke2·k3s 잔재, 점유된 데이터 디렉터리(`/var/lib/rancher`), 이미 도는 런타임을 본다. 이것이 뒤의 uninstall.sh·killall.sh 롤백과 앞뒤로 짝이다.

넷째 포트다. RKE2가 여는 인바운드 포트가 이미 점유됐는지 확인한다. 기본 Canal 기준으로 갈린다.

| 포트 | 프로토콜 | 대상 | 용도 |
| --- | --- | --- | --- |
| 6443 | TCP | 서버 | kube-apiserver |
| 9345 | TCP | 서버 | RKE2 supervisor(노드 합류) |
| 2379–2381 | TCP | 서버 | etcd client·peer·metrics |
| 10250 | TCP | 전 노드 | kubelet |
| 8472 | UDP | 전 노드 | Canal VXLAN |
| 9099 | TCP | 전 노드 | Canal health |
| 30000–32767 | TCP | 전 노드 | NodePort |
| 51820–51821 | UDP | 전 노드 | Canal WireGuard(암호화 시) |

트랙 A와 견줘 눈에 띄는 것은 9345와 8472다. 9345는 트랙 A에 없던 포트로, RKE2가 노드 합류를 받는 supervisor 포트이며 apiserver의 6443과 별개다. 8472/UDP는 Canal의 VXLAN 캡슐화가 지나는 포트다. [a6](./a6-pod-network-dns#pod-routes)에서 정적 라우트로 이은 노드 간 파드망이, RKE2에선 이 UDP 포트를 타고 오버레이로 흐른다.

## 사전준비 {#preprep}

점검을 통과한 노드를 설치 가능 상태로 조정한다. 우분투 두 대는 손댈 것이 거의 없고, 실질은 Rocky다.

### 공통 조정 {#common-prep}

세 노드에서 호스트명·swap·시간동기를 확인한다. 우분투는 Multipass가 인스턴스 이름을 호스트명으로 박고 swap 없이 뜨며 systemd-timesyncd로 동기하므로, 확인만으로 통과한다. Rocky는 Anaconda 자동 파티션이 swap 파티션(실측 3G)을 만들었으므로 끈다. `swapoff -a`로 즉시 해제하고 `/etc/fstab`의 swap 줄을 주석 처리해 재부팅에도 붙지 않게 한다. kubelet은 메모리 회계와 축출(eviction) 판단을 물리 메모리 기준으로 하므로, swap이 켜져 있으면 그 판단이 어긋난다.

### RedHat 분기 {#redhat-branch}

Rocky 노드의 사전준비가 이 구간의 본론이다. 네 표면을 손으로 건다.

첫째, 커널 모듈이다. Rocky 10은 `dnf install kernel-modules-extra`로 `nf_conntrack`을 포함한 모듈을 확보한다. [a5](./a5-worker-nodes#bridge-netfilter)에서 손으로 `modprobe br-netfilter` 한 그 계열 모듈이 Rocky 10에선 이 패키지로 온다. 앞서 본 대로 이 단계는 Rocky 9에는 불필요하다.

둘째, firewalld 비활성이다. `systemctl disable --now firewalld`로 끈다. Canal과 충돌해서 공식 권장이 완전 비활성이며, 하부 nftables·iptables는 남고 Canal이 그것을 쓴다. 방화벽을 없애는 것이 아니라 상위 관리자를 치우는 것이다. ([RKE2 Known Issues](https://docs.rke2.io/known_issues))

셋째, NetworkManager 드롭인이다. `/etc/NetworkManager/conf.d/rke2-canal.conf`에 CNI 인터페이스(`cali*`·`flannel*`·`vxlan.calico` 등)를 unmanaged로 선언하고 NetworkManager를 reload한다. 이것이 없으면 NetworkManager가 Canal이 만드는 인터페이스를 물어 파드망을 깬다. 드롭인은 그 CNI 인터페이스만 unmanaged로 두므로 `eth1` 고정 IP는 그대로 관리된다. RHEL 8.4+에서는 `nm-cloud-setup.service`와 타이머도 끈다. 클라우드 이미지에만 있어 ISO 설치엔 없을 수 있으므로 조건부로 처리한다.

넷째, SELinux는 끄지 않는다. `getenforce`가 `Enforcing`인 것을 확인하고 그대로 둔다. rke2-selinux 정책은 b2에서 RKE2를 RPM으로 깔 때 의존성으로 딸려온다. 여기서 permissive로 내리면 그것이 오히려 트랙 A Ubuntu로의 회귀다. RedHat 분기의 핵심이 "enforcing인 채로 돌린다"이므로, 손대지 않고 두는 것이 사전준비다. ([RKE2 SELinux](https://docs.rke2.io/security/selinux))

> **제품으로 접히는 지점.** 이 네 표면이 InstallSvc pre-prep의 RedHat 분기 그 자체다. Ubuntu 대상에는 이 넷이 전부 무동작이고, Rocky 대상에만 켜진다. 그리고 그 안에서 다시 `kernel-modules-extra`는 Rocky 10에만 걸린다. 사전준비 생성기가 OS 계열과 메이저 버전 두 축으로 분기해야 하는 근거가 여기 있다.

### Dynamic Memory {#dynamic-memory}

Rocky VM에서 하나 더 잡는다. 콘솔 로그에 뜬 `hv_balloon: Max. dynamic memory size: 4096 MB`는 이 VM에 동적 메모리(Dynamic Memory)가 켜져 있다는 신호다. RKE2 최소가 4GB인데 동적 메모리는 호스트가 쪼들리면 그 밑으로 회수해 가므로, 노드가 메모리를 굶을 위험이 있다. b2 설치 직전에 VM을 끄고 Hyper-V 설정에서 "동적 메모리 사용"을 해제하거나 최소 RAM을 `4096`으로 고정한다. 우분투 노드는 Multipass가 `--memory`로 고정 할당하므로 이 문제가 없다.

## 삽질 박제 {#debug-stucco}

이 구간의 값은 세운 결과만큼 프로비저닝 과정에서 밟은 삽질에 있다. 셋을 박제한다.

> **박제: Ctrl+C가 부른 multipassd 먹통**
>
>> **삽질.** <br/>
>> `multipass launch ... --bridged`로 우분투 에이전트를 띄우는데 "Starting"에서 오래 멈췄다. 못 참고 Ctrl+C로 빠져나온 뒤 `multipass list`를 쳤더니 그것마저 hang이 걸렸다. 뒤이어 `Restart-Service Multipass -Force`는 "서비스가 중지될 때까지 기다리는 중"만 반복했고, `Stop-Service`는 `CouldNotStopService`로 실패했다.
>
>> **교정.** <br/>
>> 두 가지가 겹쳤다. 하나, launch가 안 끝난 것은 `--bridged`로 붙은 `eth1`이 DHCP를 기다린 것이다. `multipass` 스위치는 Internal이라 DHCP 서버가 없는데, 새 인스턴스는 그 두 번째 NIC를 기본 DHCP로 물고 부팅해 `systemd-networkd-wait-online`이 타임아웃까지 블록한다. 둘, `multipass list`까지 멈춘 것은 multipassd(데몬)가 엉킨 것이다. 공식 문서가 못 박듯 launch를 끊어도 초기화는 백그라운드에서 계속 돌므로, Ctrl+C는 클라이언트만 떨어뜨리고 데몬은 작업을 붙든 채 먹통이 됐다. 서비스가 곱게 안 멈추니 프로세스를 직접 죽여야 했다. `Get-CimInstance Win32_Service`로 PID를 잡아 `Stop-Process -Force`로 사살하고 `Start-Service`로 되살리자 `list`가 응답했다. 재기동은 `--bridged` 없이 맨몸으로 띄운 뒤 NIC를 나중에 붙이는([a0](./a0-lab-topology-and-network#dedicated-switch-dual-nic)의 방식) 순서로 바꿔, 첫 부팅이 DHCP를 기다리지 않게 했다. 교훈은 하나다. 조작 중엔 손을 떼고 기다린다. `--timeout`을 늘리는 것이 공식 권장이다. ([Multipass Troubleshoot](https://documentation.ubuntu.com/multipass/latest/how-to-guides/troubleshoot/troubleshoot-launch-start-issues/))

> **박제: graceful 종료가 걸린 Rocky VM**
>
>> **삽질.** <br/>
>> Rocky 설치 후 재부팅에서 검은 화면이 오래 이어지길래 Hyper-V 연결 창의 "종료"(Shut Down)를 눌렀다. 그런데 `Failed to execute shutdown binary`를 뱉으며 "종료 중..."에서 넘어가지 못하고 먹통이 됐다. 호스트를 재부팅해도 그 상태가 풀리지 않았다.
>
>> **교정.** <br/>
>> "종료"는 ACPI graceful 신호라 OS가 먹통이면 그대로 걸린다. 이럴 때 필요한 것은 "끄기"(Turn Off), 전원 코드를 뽑는 하드 파워 오프다. `Stop-VM -Name rke2-agent-1 -TurnOff -Force`로 끊고 다시 시작해 콘솔로 부팅을 끝까지 지켜봤다. 검은 화면은 콘솔이 로그인 프롬프트를 안 그린 것뿐이라, Enter 한 번으로 `rke2-agent-1 login:`이 떴다. 여기서도 교훈은 같다. 안 끝났다고 끊지 않는다. graceful이 안 먹으면 hard로 내려가되, 그 판단은 콘솔로 상태를 본 뒤에 한다.

> **박제: iptables 패키지 과잉** {#iptables-overreach}
>
>> **삽질.** <br/>
>> 사전준비에서 `dnf install -y kernel-modules-extra iptables`로 iptables를 함께 잡으려 했다. 그런데 `rpm -q iptables`가 `package iptables is not installed`을 냈다.
>
>> **교정.** <br/>
>> Rocky 10에는 `iptables`라는 패키지명이 없다. iptables-legacy가 RHEL 10에서 제거됐기 때문이다. 더 근본적으로, RKE2는 iptables를 자체 번들로 들고 돌아 호스트 iptables 패키지를 요구하지 않는다. RKE2 요건 문서가 RHEL 10 추가 요건으로 드는 것은 `kernel-modules-extra` 하나뿐이고, 그것은 이미 설치됐다. 즉 이 단계는 애초에 불필요했다. Rocky 10이 legacy를 빼버려도 RKE2가 안 깨지는 이유가 이 번들 구조이며, 이것은 b0에서 containerd 번들과 같은 결로 짚은 접힘이다. (초안 사전준비의 저자 과잉이었다.) ([RKE2 Requirements](https://docs.rke2.io/install/requirements))

## 검증 {#verification}

세 노드가 전용선에서 서로 보이고, Rocky가 인터넷에 닿고, 사전준비가 걸렸는지를 본다. 두 결과가 이 구간의 종결을 대표한다.

첫째는 3노드 상호 도달이다. `eth1`이 각각 `10.240.0.30`·`.31`·`.32`로 서고, `ping`이 `ttl=64`에 `0% loss`로 돌아왔다. `ttl=64`는 라우터를 거치지 않고 같은 `multipass` 스위치에서 직접 오갔다는 뜻이다. Rocky→server(아웃바운드)와 server→Rocky(인바운드)가 모두 통과했다. 한 관찰. firewalld는 기본 public 존에서 ICMP를 열어두므로, 인바운드 ping 통과가 firewalld 부재를 뜻하지는 않는다. Canal 충돌은 그것과 별개라 firewalld를 통째로 끈다.

둘째는 Rocky 사전준비 상태다. `swapon --show`가 빈 출력, `systemctl is-active firewalld`가 `inactive`, `getenforce`가 `Enforcing`, `rpm -q kernel-modules-extra`가 설치를 확인하고, 드롭인 파일이 제자리에 있다. `rpm -q`에 `kernel-modules-extra`가 두 버전 뜬 것은 커널이 둘 깔렸다는 뜻이며(ISO 커널 + 업데이트 커널), 모듈이 양쪽 다 있어 재부팅해도 문제없다.

> **제품으로 접히는 지점.** 이 검증이 InstallSvc 설치 직전 점검의 원형이다. 노드가 서로 도달하고, 대상 OS의 사전준비가 걸렸고, 인터넷(또는 폐쇄망 미러)에 닿는지를 설치 전에 확인하면, 반쯤 준비된 노드로 설치에 들어가는 사고를 앞단에서 막는다.

---

## 부록 A. 핵심 어휘 빠른 참조 {#appendix-a-glossary}

| 용어 | 한 줄 정의 |
| --- | --- |
| **사전점검(pre-check)** | 설치 전 노드 요건 게이트. 실패 시 설치에 들어가지 않는 fail-fast |
| **사전준비(pre-prep)** | 통과한 노드를 설치 가능 상태로 조정. 호스트명·swap·SELinux·firewalld·NM·시간동기·config 생성 |
| **supervisor 포트 9345** | RKE2 서버가 노드 합류를 받는 포트. apiserver 6443과 별개 |
| **x86-64-v3** | Rocky 10의 CPU 기준선. AVX·AVX2·BMI1/2·FMA(Haswell+). Rocky 9는 v2 |
| **Hyper-V processor compatibility** | CPU 기능을 옛 기준으로 가리는 옵션. 켜면 Rocky 10이 v3 부재로 설치 실패 |
| **`kernel-modules-extra`** | RHEL 10 전용 추가 패키지. `nf_conntrack` 제공. Rocky 9는 불필요 |
| **dnf5** | Rocky 10 기본 패키지 관리자. Rocky 9는 dnf4. 백엔드 명령·출력 파싱 분기 |
| **rke2-selinux** | container-selinux를 RKE2 경로에 맞춘 정책. RPM 설치가 의존성으로 당김 |
| **firewalld 비활성** | Canal 충돌 회피. 하부 nftables·iptables는 남고 Canal이 사용 |
| **NetworkManager 드롭인** | `rke2-canal.conf`로 CNI 인터페이스를 unmanaged로 선언 |
| **`nm-cloud-setup`** | 클라우드 라우팅 설정 서비스. CNI와 충돌해 비활성. ISO 설치엔 없을 수 있음 |
| **번들 iptables** | RKE2가 자체 포함한 iptables. Rocky 10의 legacy 제거에 무영향 |
| **Dynamic Memory / hv_balloon** | Hyper-V 동적 메모리. 4GB 밑으로 회수될 수 있어 노드엔 고정 권장 |
| **networkd-wait-online** | 인터페이스 온라인을 기다리는 systemd 단계. DHCP 없는 전용선에서 부팅 지연 유발 |
| **Turn Off(끄기)** | Hyper-V 하드 파워 오프. graceful "종료"가 먹통일 때 사용 |

---

## 부록 B. 명령어 빠른 참조 {#appendix-b-commands}

Rocky의 사전준비는 버전에 따라 갈리므로 코드블럭을 Rocky 9와 Rocky 10으로 분리한다. 우분투와 프로비저닝은 공통이다.

```powershell
# === 우분투 노드 프로비저닝 (Multipass, 관리자 PowerShell) ===
#   전제: a0의 전용 스위치와 local.bridged-network=multipass 생존
multipass launch 24.04 --name rke2-server  --cpus 4 --memory 6G --disk 30G --bridged
multipass launch 24.04 --name rke2-agent-0 --cpus 2 --memory 4G --disk 20G --bridged
#   --bridged 첫 부팅이 DHCP로 늘어지면: 맨몸 launch 후 stop → set bridged=true → start
multipass exec rke2-server -- ip -br link            # eth1 MAC 확인
```

```bash
# === 우분투 eth1 고정 IP (각 노드, MAC 매칭) ===
multipass exec rke2-server -- bash -c '
MAC=$(cat /sys/class/net/eth1/address)
sudo tee /etc/netplan/99-cluster.yaml >/dev/null <<EOF
network:
  version: 2
  ethernets:
    eth1:
      match:
        macaddress: "$MAC"
      dhcp4: no
      optional: true
      addresses: [10.240.0.30/24]     # agent-0은 .31
EOF
sudo chmod 600 /etc/netplan/99-cluster.yaml
sudo netplan apply
'
multipass exec rke2-server -- ip -br addr show eth1  # 10.240.0.30 확인
```

```text
# === Rocky 노드 프로비저닝 (Hyper-V 관리자, 관리자 권한) ===
#   Gen2 VM, 2 vCPU / 4096MB(동적 메모리 해제) / VHDX 30GB
#   네트워크 어댑터 2장: Default Switch(인터넷) + multipass(전용선)
#   보안 → Secure Boot 템플릿: Microsoft UEFI Certificate Authority
#   프로세서 → "다른 프로세서 버전으로 마이그레이션" 체크 해제(x86-64-v3 보존)
#   설치 이미지: Rocky Linux 10 minimal ISO, 소프트웨어=Minimal Install
```

```bash
# === Rocky eth1 고정 IP (nmcli) ===
nmcli device status                    # 172.x 받은 쪽=Default Switch, 빈 쪽=multipass
sudo nmcli con mod "<multipass 연결명>" ipv4.addresses 10.240.0.32/24 ipv4.method manual
sudo nmcli con up  "<multipass 연결명>"
ip -br addr                            # 10.240.0.32 확인 (전용선 NIC엔 게이트웨이 미지정)
```

```bash
# === 사전준비: 공통 (세 노드) ===
swapon --show          # 뭐가 잡혔나 (우분투는 보통 빈 출력)
hostnamectl            # 노드 이름 확인
timedatectl            # System clock synchronized: yes
```

```bash
# === 사전준비: Rocky 9 (dnf4, kernel-modules-extra 불필요) ===
sudo swapoff -a
sudo sed -i.bak '/ swap /s/^/#/' /etc/fstab
sudo systemctl disable --now firewalld
sudo tee /etc/NetworkManager/conf.d/rke2-canal.conf >/dev/null <<'EOF'
[keyfile]
unmanaged-devices=interface-name:flannel*;interface-name:cali*;interface-name:tunl*;interface-name:vxlan.calico;interface-name:vxlan-v6.calico;interface-name:wireguard.cali;interface-name:wg-v6.cali
EOF
sudo systemctl reload NetworkManager
sudo systemctl disable --now nm-cloud-setup.service nm-cloud-setup.timer 2>/dev/null || true
getenforce             # Enforcing 유지 (rke2-selinux는 b2 RPM 설치가 당김)
#   nf_conntrack는 기본 커널에 포함 → kernel-modules-extra 설치 단계 없음
```

```bash
# === 사전준비: Rocky 10 (dnf5, kernel-modules-extra 필요) ===
sudo swapoff -a
sudo sed -i.bak '/ swap /s/^/#/' /etc/fstab
sudo dnf install -y kernel-modules-extra          # RHEL 10 전용: nf_conntrack
sudo systemctl disable --now firewalld
sudo tee /etc/NetworkManager/conf.d/rke2-canal.conf >/dev/null <<'EOF'
[keyfile]
unmanaged-devices=interface-name:flannel*;interface-name:cali*;interface-name:tunl*;interface-name:vxlan.calico;interface-name:vxlan-v6.calico;interface-name:wireguard.cali;interface-name:wg-v6.cali
EOF
sudo systemctl reload NetworkManager
sudo systemctl disable --now nm-cloud-setup.service nm-cloud-setup.timer 2>/dev/null || true
getenforce             # Enforcing 유지
#   iptables 패키지 불필요: RKE2 번들. Rocky 10은 iptables-legacy 제거(nft 전용)
```

```bash
# === 사전준비 검증 (Rocky) ===
swapon --show                        # 빈 출력
systemctl is-active firewalld         # inactive
getenforce                            # Enforcing
rpm -q kernel-modules-extra           # (Rocky 10) 설치 확인
cat /etc/NetworkManager/conf.d/rke2-canal.conf
```

```powershell
# === 복구: multipass 데몬 먹통 (관리자 PowerShell) ===
$svc = Get-CimInstance Win32_Service -Filter "Name='Multipass'"
Stop-Process -Id $svc.ProcessId -Force            # 서비스가 안 멈추면 프로세스 직접 사살
Get-Process multipass -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Service Multipass; Start-Sleep 5; multipass list

# === 복구: Rocky VM 강제 끄기 ===
Stop-VM -Name rke2-agent-1 -TurnOff -Force        # graceful "종료"가 걸렸을 때
```

---

## 개인 노트 {#personal-notes}

### 손때 검증 상태 {#hands-on-status}

이 구간은 실습으로 닫혔다. 우분투 두 대(Multipass)와 Rocky 한 대(Hyper-V 직접)를 세우고, 전용선 고정 IP `10.240.0.30`·`.31`·`.32`를 박고, 3노드 상호 ping(`ttl=64`, `0% loss`)과 Rocky의 인터넷 도달(`dnf`)을 확인했다. Rocky에 RedHat 분기 사전준비(swap 비활성·firewalld 비활성·NetworkManager 드롭인·SELinux enforcing 유지·`kernel-modules-extra`)를 걸고 검증했다. 세 박제는 상상한 함정이 아니라 실제로 낸 삽질의 기록이다.

가장 값이 나가는 자산은 두 가지다. 하나는 Rocky 버전 분기표다. `kernel-modules-extra`가 10에만 필요하고 CPU 기준선이 9=v2·10=v3로 갈리는 것은, 폐쇄망 제품이 구버전 게스트를 지원할 때 백엔드 사전준비 생성기가 반드시 분기해야 하는 축이다. 다른 하나는 iptables 과잉 박제다. 잘못 잡으려던 그 단계가 사실 불필요했고, 그 이유가 RKE2의 번들 iptables라는 점이 b0의 접힘을 실측으로 확인해 주었다.

### 심화로 가는 길 {#deeper}

- **networkd-wait-online의 내부**: DHCP 없는 인터페이스가 부팅을 지연시키는 메커니즘과, `optional: true`·`RequiredForOnline`이 그것을 끊는 원리.
- **Hyper-V 프로세서 호환성**: 마이그레이션 옵션이 노출 CPU 기능을 어떻게 마스킹하는가, x86-64 마이크로아키텍처 레벨(v1~v4)의 실제 명령 집합.
- **RKE2 번들 바이너리 목록**: containerd·runc·iptables 외에 RKE2가 자체 포함하는 것과, 그것이 폐쇄망 배포에 갖는 함의.
- **dnf5 대 dnf4**: 명령·플러그인·출력 포맷 차이와, 백엔드가 셸 아웃할 때의 파싱 안정성.
- **rke2-selinux 정책의 실물**: 어떤 도메인·경로 규칙이 `/var/lib/rancher`를 덮는가. b2 RPM 설치에서 확인한다.

### 자기 점검 {#self-check}

각 절이 왜 성립하는지를 한 줄로 재구성한다.

1. **트랙 A엔 왜 이 단계가 없었나** → Multipass 이미지가 무균실이라 firewalld·SELinux·NM·잔재가 처음부터 없었다. 실무 노드는 그렇지 않다 (→ 사전점검·사전준비의 자리).
2. **왜 Rocky는 Hyper-V에 직접 만드나** → Multipass가 Windows에서 Rocky를 못 띄우므로, a0의 전용 스위치에 Hyper-V VM을 붙여 네트워크만 통일한다 (→ Rocky 프로비저닝 경로).
3. **`kernel-modules-extra`가 왜 버전 분기인가** → `nf_conntrack`이 Rocky 9 기본 커널엔 있고 10엔 별도 패키지라, 사전준비 생성기가 10에만 이 단계를 끼워야 한다 (→ Rocky 버전 분기).
4. **왜 iptables 패키지가 불필요했나** → RKE2가 iptables를 번들하고 RHEL 10 추가 요건은 kernel-modules-extra 하나뿐이라, Rocky 10의 legacy 제거에도 안 깨진다 (→ 삽질 박제).
5. **왜 Ctrl+C가 데몬을 먹통으로 만들었나** → launch를 끊어도 초기화는 백그라운드에서 계속 돌아, 클라이언트만 떨어지고 데몬이 작업을 붙든 채 엉킨다 (→ 삽질 박제).

이로써 세 노드가 B2 설치 직전 상태에 섰다. 다음 b2에서 `config.yaml`(token·tls-san·cni·cluster-cidr·service-cidr·node-taint)을 작성하고 서버부터 RKE2를 실제로 설치한다. 트랙 A에서 판 골수가 거기서 각 설정 키의 근거가 된다.
