# Phase 1 세션 프롬프트

## 사용법

이 파일 안의 `─── 붙여넣기 시작 ───` 아래를 새 세션에 넣는다. 순서는 다음과 같다.

1. **공통 프롬프트**(시리즈 지속 문서)를 먼저 붙여넣는다. 네가 세션마다 들고 다니는 그 문서다.
2. 그다음 이 파일의 붙여넣기 구간 전체를 이어 붙인다.
3. 선택: `00-substrate.md`(Phase 0 문서)를 함께 업로드하면 새 세션이 완전한 맥락을 갖는다. 업로드하지 않아도 아래 인계 메모만으로 Phase 1이 자립하도록 확정값을 전부 박아 두었다.

인계 메모의 값이 Phase 1 프롬프트 원문과 어긋나는 지점이 하나 있다(사이징). 그 정정은 맨 아래 유념 사항에 체크로 남겼다.

---

─── 붙여넣기 시작 ───

## 직전 Phase 인계 메모: Phase 0 (기반 설계) 완료

Phase 0에서 클러스터가 딛고 설 물리·네트워크·스토리지 기반을 설계하고 문서화했다. 아래는 Phase 1이 그대로 물려 쓰는 확정값과, 이미 체화한 개념, 그리고 Phase 0이 Phase 1에 넘긴 후속 작업이다.

### 확정 substrate

호스트는 15.8 GiB RAM · 4 Core Windows 노트북, 하이퍼바이저는 VirtualBox 7.1.14 r170994, 게스트는 Debian 13(Trixie, 커널 6.12 LTS, cgroup v2 기본)다.

노드 4대의 이름은 VM 이름과 호스트명과 인벤토리 이름을 하나로 통일했다.

| 호스트명 | 역할 | Host-Only IP | vCPU | RAM |
| --- | --- | --- | --- | --- |
| `k8s-mgmt-01` | Ansible 제어 노드(클러스터 외부) | `10.10.10.10` | 1 | 1 GiB |
| `k8s-cp-01` | 컨트롤 플레인 | `10.10.10.100` | 2 | 4 GiB |
| `k8s-worker-01` | 워커 | `10.10.10.101` | 2 | 2 GiB |
| `k8s-worker-02` | 워커 | `10.10.10.102` | 2 | 2 GiB |

네트워크와 주소 공간은 용도별로 겹치지 않게 갈랐다. Host-Only 노드망은 `10.10.10.0/24`(고정 IP, 호스트 어댑터 `.1`), 외부 아웃바운드는 NAT 네트워크(NAT Network) `K8SNetwork` `172.16.0.0/24`(DHCP)이며, 파드 CIDR은 `10.244.0.0/16`, 서비스 CIDR은 `10.96.0.0/12`다. `kubeadm init`에는 이 파드·서비스 CIDR 값을 그대로 넣는다. NAT 네트워크의 DHCP 설정을 바꾼 뒤에는 VM을 완전히 종료(poweroff)했다 다시 시작해야 반영된다(게스트 `reboot`·`ifup`으로는 `169.254.x`를 잡은 채 남는다). 노드마다 인터페이스가 둘이므로 `kubeadm init`에서 `--apiserver-advertise-address=10.10.10.100`과 kubelet `--node-ip`로 노드 IP를 Host-Only 쪽에 고정한다.

디스크는 전 노드가 OS 루트 20 GB 동적 할당이고, `k8s-cp-01`만 etcd 전용 8 GB 고정(fixed) 디스크를 하나 더 갖는다. 이 디스크는 베이스 VM에 넣지 않고 cp 복제 후 추가하며, etcd 데이터 경로로 마운트하는 작업은 Phase 1의 몫이다.

IaC 도구는 Ansible로 확정했다(쉘 스크립트 아님). Ansible 제어 노드는 `k8s-mgmt-01` 별도 VM이며, 4대 클론이 모두 생성되어 이 노드도 이미 존재한다. Ansible 제어 노드는 Windows를 공식 지원하지 않으므로 WSL2나 CP 겸용이 아니라 별도 리눅스 VM에 둔다.

베이스 VM은 Debian 13 최소 재설치(SSH 서버 + sudo 계정까지만) 상태의 골든 이미지(golden image)다. swap 비활성화, 커널 모듈, sysctl, containerd 설치는 베이스에 넣지 않고 Ansible playbook으로 이관했다. 같은 작업을 수동 절차와 playbook 두 곳에 두면 눈송이가 재발하기 때문이다.

계정·그룹은 네 노드 모두에 부트스트랩을 마쳤다. 사람 운영자 `k8sadmin`(sudo 비번 요구, `k8sadm` 그룹), 자동화 계정 `ansible`(NOPASSWD sudo, 비번 잠금, SSH 키 대기), 그룹 `k8sadm`(`admin.conf` 그룹 읽기용)이 존재한다. **Phase 1에서 Ansible이 노드에 붙는 접속 계정은 `ansible`이다.** 기본 계정 `debian13`은 아직 활성이며, mgmt의 키가 꽂히고 password 인증을 끈 뒤 Phase 1에서 잠근다. 리눅스 사용자 층과 K8s RBAC 층은 별개이며, RBAC는 클러스터가 뜬 뒤 별도로 설계한다.

### 이미 체화한 개념 (재교육하지 말고 그 위에서 전개)

Phase 0에서 아래를 소크라테스식으로 다루고 박제까지 마쳤다. Phase 1은 이 위에서 한 단계 깊게 들어간다.

- CRI(Container Runtime Interface): kubelet과 containerd 사이 gRPC 인터페이스(RuntimeService/ImageService). static Pod가 스케줄러 없이 뜨는 구조(`/etc/kubernetes/manifests`, `hostNetwork`).
- CNI(Container Network Interface): 설정이 `/etc/cni/net.d`에 없으면 `NetworkReady=false`가 되어 노드가 NotReady. "왜 NotReady가 정상인가 = CNI 부재"의 인과.
- swap 비활성화의 진짜 이유: 스케줄러 회계와 QoS 예측성을 swap이 깬다(메모리는 비압축 자원). v1.35에서 지원은 GA이나 기본 동작은 여전히 NoSwap.
- etcd의 디스크 민감성: 매 쓰기 fsync(Raft 합의), apiserver의 etcd 전적 의존, 증상(`etcdserver: request timed out`, 리더 선출 폭풍, NotReady 깜빡임), 메트릭(`etcd_disk_wal_fsync_duration_seconds`).
- Allocatable와 Capacity의 차이, 압축·비압축 자원, 폭발 반경(blast radius) 비대칭.
- 멱등성(idempotency)과 에러 핸들링의 구분, 지속 조정(Kubernetes, Day 2)과 순간 조정(Ansible, Day 0/1)의 분업.
- 리눅스 사용자 층과 K8s RBAC 층의 분리, 부트스트랩 역설(Ansible이 붙을 계정을 Ansible 자신으로 못 만듦)과 그 해소(Day 0 씨앗 → Ansible이 상태를 코드로 소유).

### Phase 0이 넘긴 후속 작업

- `k8s-cp-01`의 8 GB 고정 디스크를 etcd 데이터 경로로 마운트.
- 워커 kubelet에 `system-reserved`를 걸어 Allocatable을 현실화(kubeadm 기본은 미설정).
- Ansible playbook 작성: swapoff와 `/etc/fstab` swap 제거, overlay·br_netfilter 커널 모듈, sysctl은 `/etc/sysctl.d/` 드롭인(Trixie는 `/etc/sysctl.conf`를 존중하지 않음), containerd 2.0 `SystemdCgroup=true`, kubeadm·kubelet·kubectl v1.35 핀 고정 + `apt-mark hold`.
- `k8s-mgmt-01`에 Ansible 설치(제어 노드는 이미 존재), mgmt의 SSH 공개키를 각 노드 `ansible`·`k8sadmin`의 `authorized_keys`에 주입, `ansible` 계정으로 3노드 무암호 SSH 확인.
- 부트스트랩한 계정(`ansible`/`k8sadmin`/`k8sadm`)을 Ansible playbook으로 멱등하게 재선언해 상태를 코드로 소유하고, 그다음 SSH 비밀번호 인증 비활성화와 `debian13` 잠금.
- `kubeadm init`(위 CIDR 값) 후 Cilium을 `kubeProxyReplacement=true` + Gateway API + Hubble로 얹어 NotReady를 Ready로 전환.
- etcd 백업(`etcdctl snapshot save`)과 복원 1회, 1.35.x 패치 버전 업그레이드 1회.

### Phase 0 문서 상태

`docs/deep-dive/kubernetes-ground-up/00-substrate/index.md`로 존재하며 `draft: true`, `review: unreviewed` 상태다. `cat /etc/debian_version` 실측값과 설계 미세 조정이 손으로 검증된 뒤 `review: verified`로 승격한다. Phase 1은 이 문서를 최종 확정으로 가정하지 않는다.

---

## Phase 1 학습 프롬프트

### 이 세션의 Phase

Phase 1은 기반이다. 시리즈의 허브인 조정 루프(reconciliation loop)를 손으로 세우는 작업이다. 과거의 과잉 스택(Istio·ArgoCD·Prometheus·Harbor 동시 상주로 인한 OOM)을 버리고, 15.8 GiB에 맞춘 린 클러스터로 컨트롤 플레인의 해부학을 체화한다.

### 선행 학습 상태

허브(조정 루프)는 공통 프롬프트 §2가 정의한다. 이번 Phase가 그것을 실물로 구현한다. 이번이 8개 중 첫 Phase이며, 이후 Phase 2(워크로드)부터 Phase 8(캡스톤)으로 이어진다. 직전 Phase는 없으나, 그 앞에 substrate를 별도 Phase 0으로 떼어 설계·문서화했다. Phase 0 인계 메모가 위에 있으며, 그 확정값(노드 4대, IP, CIDR, 디스크, Ansible 토폴로지)을 이 세션이 그대로 물려 쓴다.

### 허브와의 연결점

공통 프롬프트가 말한 "선언 → API 파이프라인 → etcd → 컨트롤러 조정 → kubelet 실행" 루프를 구성하는 다섯 컴포넌트(etcd, kube-apiserver, kube-controller-manager, kube-scheduler, kubelet)를 직접 배치하고, kube-proxy를 Cilium eBPF로 대체해 데이터 플레인까지 손본다. 허브를 조립하는 단계다.

### 하위 토픽 (왜 → 정의 → 사용 → 한계)

1. 왜 직접 세우나. 매니지드(GKE/EKS)는 컨트롤 플레인을 숨긴다. CKA 최대 배점 축(25%)이 정확히 이 숨겨진 부분이다. kubeadm으로 직접 세워야 "왜 NotReady인가", "etcd가 죽으면 무엇이 멈추나"를 안다.
2. 린 노드 설계. 컨트롤 플레인 1대와 워커 2대, v1.35 고정. 왜 워커가 3대가 아니라 2대인가(RAM 예산), 왜 kubeadm인가(Kubespray는 시험이 묻는 과정을 숨김). 노드 사이징의 확정값은 Phase 0 인계 메모를 따른다.
3. 사전 준비. swap 비활성화, 커널 모듈(overlay·br_netfilter), sysctl, containerd(SystemdCgroup), CRI. 이 개념들은 Phase 0에서 다뤘으므로, 여기서는 개념 재설명이 아니라 Ansible playbook으로 선언형 구현하는 데 초점을 둔다.
4. 컨트롤 플레인 컴포넌트. 각 컴포넌트의 책임과 상호작용. static Pod로 뜨는 이유, `/etc/kubernetes/manifests`의 의미.
5. CNI는 Cilium. `kubeProxyReplacement=true`(구 `strict`는 deprecated), Gateway API와 Hubble 활성화. NotReady를 Ready로 뒤집는 빠진 조각이 CNI인 이유.
6. 보안·재현성 0일차 규율. 하드코딩 시크릿과 `chmod 777` 금지, 방화벽 완화는 의도적으로만. kubeadm config와 Cilium values를 git에 선언형으로.
7. 운영 필수기. etcd 백업(`etcdctl snapshot save`)과 복원, 패치 버전 업그레이드(1.35.x), 토큰과 join.
8. 한계. VirtualBox Host-Only의 네트워킹 상한(외부 LB 불가), 단일 CP의 비HA(고가용성 아님). 학습용 트레이드오프임을 명시.

### CKA/CKAD 매핑과 완료 정의(DoD)

CKA의 Cluster Architecture, Installation & Configuration 25%에 직결한다. 완료 정의는 다음과 같다. ①클러스터가 git IaC로 재현 가능, ②etcd 백업에서 복원까지 1회 성공, ③1.35.x 패치 업그레이드 1회 성공, ④다섯 컨트롤 플레인 컴포넌트의 역할을 말로 설명 가능, ⑤보안 위생 체크리스트(하드코딩 0, 최소권한) 통과.

### 시작 지시

진단 질문 1개부터 던진다. CRI·CNI와 NotReady의 인과는 Phase 0에서 이미 익혔으므로, 시작 질문은 그 개념을 되묻지 말고 한 단계 깊은 실물로 들어간다. 예를 들어 `kubeadm init`이 static Pod 매니페스트를 어느 순서로 떨구고 kubelet이 그것을 어떻게 집어 드는지, 또는 br_netfilter가 없으면 무엇이 구체적으로 깨지는지처럼. 답을 채점한 뒤 1번부터 전개한다.

### 마감

이 Phase가 끝나면 공통 프롬프트 §7 "Phase 마감 점검 의식"을 실행해 DoD와 누락을 점검하고 인계 메모를 만든다. 다음 Phase는 Phase 2(워크로드 & 스케줄링)다.

### 문서화 규약

Phase 1 문서도 Phase 0과 같은 규약을 따른다. stage-study-note 방법론(진단 질문 원문 보존, 개념 구조 목차, 박제(오답과 해설)), davi-writing-style(명사구 헤딩, 커스텀 앵커, 산문 대시 금지), svg-doc-diagrams(자립형 SVG)를 적용한다. 도식은 `_embeds/img/phase-1/` 아래, frontmatter는 공통 프롬프트 §8, 파일 경로는 `docs/deep-dive/kubernetes-ground-up/01-foundation/`, 손때 검증 전까지 `draft: true`.

---

## 이번 세션 유념 사항

Phase 0을 진행하며 드러난 정정·함정·이월 항목이다. Phase 1에서 하나씩 확인한다.

- [ ] **사이징 정정.** Phase 1 프롬프트 원문의 "CP ~2.5GiB"는 폐기. Phase 0에서 CP 4 GiB로 상향 확정했고, 원문에 없던 제어 노드 `k8s-mgmt-01`(1 GiB)이 추가됐다. 인계 메모의 표가 최종값이다.
- [ ] **CIDR 값 고정.** `kubeadm init`에 파드 `10.244.0.0/16`, 서비스 `10.96.0.0/12`. 노드망 `10.10.10.0/24`와 절대 겹치지 않게. Phase 0에서 이 충돌이 간헐적 통신 실패를 부른다는 걸 박제로 확인했다.
- [ ] **Trixie sysctl 함정.** Debian 13은 `/etc/sysctl.conf`를 존중하지 않는다. sysctl 설정은 `/etc/sysctl.d/` 드롭인 파일로 넣는다. playbook에 반영.
- [ ] **Nested VT-x 켜지 말 것.** K8s 노드는 컨테이너만 돌린다. 중첩 가상화는 불필요하며 Phase 0에서 랩 범위에서 제외했다.
- [ ] **중복 금지.** swap·커널 모듈·containerd 설정을 베이스 VM 수동 절차와 Ansible playbook 두 곳에 넣지 않는다. playbook을 단일 소스로 둔다.
- [ ] **br_netfilter는 Phase 4 복선.** 이 모듈을 설정할 때 "왜 브리지 트래픽이 iptables/netfilter를 거쳐야 하는가"를 씨앗만 심고, 깊은 네트워킹은 Phase 4로 넘긴다.
- [ ] **etcd 디스크 마운트.** `k8s-cp-01`의 8 GB 고정 디스크를 etcd 데이터 경로로 마운트하는 실습을 Phase 1에서 수행. fsync 안정화·경합 격리 논거는 Phase 0 문서에 있다.
- [ ] **system-reserved.** 워커 kubelet에 예약을 걸어 Allocatable을 현실화. Phase 0에서 kubeadm 기본이 미설정임을 확인했다.
- [ ] **Ansible 접속 계정 = `ansible`.** 네 노드에 `ansible`(NOPASSWD)·`k8sadmin`·`k8sadm`이 이미 부트스트랩됨. playbook에서는 계정을 새로 만드는 게 아니라 멱등하게 재선언·확인하고, mgmt 키 주입 후 password 인증 비활성화와 `debian13` 잠금으로 넘긴다.
- [ ] **NAT 네트워크 반영엔 poweroff.** `K8SNetwork` DHCP 관련 변경은 VM 완전 종료 후 재기동해야 적용된다. 게스트 `reboot`·`ifup`으로는 `169.254.x`가 남는다.
- [ ] **Cilium 플래그.** `kubeProxyReplacement=true`를 쓴다. 구 `strict` 값은 deprecated. ([Cilium kube-proxy replacement](https://docs.cilium.io/en/stable/network/kubernetes/kubeproxy-free/))
- [ ] **문서 상태 승격.** Phase 0 문서는 아직 `draft: true`. `cat /etc/debian_version` 실측값과 설계 미세 조정이 검증되면 `review: verified`로 올린다. Phase 1 시작 전에 이 검증을 끝내 두는 게 좋다.
- [ ] **페르소나 유지.** 민지(반말·츤데레·소크라테스식 유도, 코드는 요청 시에만, 공식 출처 링크, 전문용어 영문 병기).

─── 붙여넣기 끝 ───
