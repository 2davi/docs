# Phase 1 프롬프트 — 기반: 컨트롤 플레인 & 조정 루프 (Foundation)

> **사용법**: 공통 프롬프트(`00-common-prompt`)를 먼저 붙여넣고, 이어서 이 파일을 붙여넣는다.

## 이 채팅의 Phase
**Phase 1 — 기반.** 시리즈의 허브인 *조정 루프*를 손으로 세우는 작업. 과거의 과잉 스택(Istio+ArgoCD+Prometheus+Harbor 동시 상주 → OOM)을 버리고, 15.8GiB에 맞춘 **린 클러스터**로 컨트롤 플레인의 해부학을 체화한다.

## 선행 학습 상태
- **허브(조정 루프)** — 공통 프롬프트 §2. 이걸 실물로 구현하는 게 이번 Phase.
- 이번이 **Phase 1 (8개 중 첫 Phase)**. 이후: Phase 2(워크로드) → … → Phase 8(캡스톤).
- *(직전 Phase 인계 메모가 있으면 여기 붙여넣기 — Phase 1은 시리즈 시작이라 보통 비어 있음)*

## 허브와의 연결점
공통 프롬프트가 말한 "선언 → API 파이프라인 → etcd → 컨트롤러 조정 → kubelet 실행" 루프. 이번 Phase는 그 루프를 구성하는 **다섯 컴포넌트(etcd, kube-apiserver, kube-controller-manager, kube-scheduler, kubelet)를 직접 배치**하고, kube-proxy를 Cilium eBPF로 대체해 데이터 플레인까지 손본다. 즉 허브를 조립하는 단계.

## 이 Phase의 하위 토픽 (왜 → 정의 → 사용 → 한계)
1. **왜**: 매니지드(GKE/EKS)는 컨트롤 플레인을 숨긴다. CKA 25%(최대 배점 축)가 정확히 이 숨겨진 부분 — kubeadm으로 직접 세워야 "왜 NotReady인가", "etcd가 죽으면 무엇이 멈추나"를 안다.
2. **린 노드 설계**: 1 CP(~2.5GiB) + 2 worker(~2GiB), v1.35 고정. 왜 3 worker가 아니라 2인가(RAM 예산), 왜 kubeadm인가(Kubespray는 시험이 묻는 과정을 숨김).
3. **사전 준비**: swap 비활성화·커널 모듈(overlay/br_netfilter)·sysctl·containerd(SystemdCgroup)·CRI. "왜 swap을 끄나"의 진짜 이유.
4. **컨트롤 플레인 컴포넌트**: 각 컴포넌트의 책임과 상호작용. Static Pod로 뜨는 이유, `/etc/kubernetes/manifests`의 의미.
5. **CNI = Cilium**: `kubeProxyReplacement=true`(구 `strict`는 deprecated), Gateway API·Hubble 활성화. NotReady → Ready로 바뀌는 "빠진 조각"이 CNI인 이유.
6. **보안·재현성 0일차 규율**: 하드코딩 시크릿·`chmod 777` 금지, 방화벽 완화는 의도적으로. kubeadm config + Cilium values를 git에 선언형으로.
7. **운영 필수기**: etcd 백업(`etcdctl snapshot save`)/복원, 패치 버전 업그레이드(1.35.x), 토큰·join.
8. **한계**: VirtualBox Host-Only의 네트워킹 상한(외부 LB 불가), 단일 CP의 비HA(고가용성 아님) — 학습용 트레이드오프 명시.

## CKA/CKAD 매핑 + 완료 정의(DoD)
- **CKA**: Cluster Architecture, Installation & Configuration **25%** 직결.
- **DoD**: ①클러스터가 git IaC로 재현 가능, ②etcd 백업→복원 1회 성공, ③1.35.x 패치 업그레이드 1회 성공, ④다섯 컨트롤 플레인 컴포넌트의 역할을 말로 설명 가능, ⑤보안 위생 체크리스트(하드코딩 0, 최소권한) 통과.

## 시작 지시
**진단 질문 1개**부터 던져라(예: "`kubeadm init` 직후 `kubectl get nodes`가 NotReady를 뱉는다. 이게 왜 *정상*이며, Ready로 바꾸는 '빠진 조각'은 정확히 무엇인가?"). 답을 채점한 뒤 1번부터 전개.

## 마감
이 Phase가 끝나면 공통 프롬프트 §7 **"Phase 마감 점검 의식"**을 실행해 DoD·누락을 점검하고 **인계 메모**를 만든다. 다음 Phase는 **Phase 2(워크로드 & 스케줄링)**.
