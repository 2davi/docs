---
title: "Hard Way ↔ RKE2 ↔ 제품 대응표"
date: 2026-07-12
lastmod: 2026-07-12
author: "Davi"
description: ""
section: "deep-dive"
category: "deep-dive/kubernetes/rke2-bootstrap"
tags: [kubernetes, rke2, rke2-bootstrap, mapping, product]
doc_type: "learning-guide"
series: "rke2-bootstrap"
series_order: 99
order: 99
draft: true
search: true
toc: true
difficulty: "advanced"

ai_assistance:
  authorship: "ai-drafted"
  role: [drafting, research]
  model: ["claude-opus-4.8"]
  review: "reviewing"
---

# Hard Way ↔ RKE2 ↔ 제품 대응표 {#z-mapping}

## 개요 {#overview}

이 문서는 시리즈의 3원 대응표다. 트랙 A에서 손으로 배선한 층, 트랙 B에서 RKE2가 그것을 접는 방식, 그리고 두 트랙이 함께 겨누는 제품(RKE2 설치·업그레이드 콘솔)의 기능목록 항목을 한 표로 집계한다. 각 코덱스 카드의 적용 대상 축이 여기 한 행으로 모이며, 스프린트가 진행되며 행이 채워진다.

세 축의 뜻을 고정한다. **Hard Way(손조작)**는 [트랙 A](./a0-lab-topology-and-network)에서 실제로 수행한 맨손 배선이다. **RKE2(접기)**는 그 배선을 RKE2가 자동화한 설정 표면(`config.yaml` 키·CLI·자동 동작)이다. **제품 기능목록**은 그 자동화를 UI로 감싸 소비자에게 파는 콘솔의 컴포넌트다. 이 세 열을 한 줄로 읽으면, 제품 화면 정의서에서 항목을 짚어 그 골수 근거(왜 그 설정이 필요한가)와 출처로 바로 점프할 수 있다.

상태 표기는 세 단계다. **A 실측**은 트랙 A에서 손으로 확인했다는 뜻, **B 실측**은 트랙 B에서 RKE2·제품 표면을 실물로 확인했다는 뜻, **예정**은 아직 밟지 않은 구간이다. 트랙 B 빌드(b0~b4)를 완주해, RKE2 열 대부분이 B 실측으로 승격됐다. 실물로 확인하지 못한 표면은 [미실행 표면](#not-executed)에 명시해, 표가 다 채워진 것처럼 위장하지 않게 한다.

## 접힘 대응 {#fold-mapping}

트랙 A의 층별 접힘이다([b0](./b0-what-rke2-folds)의 뼈대를 옮겨 확장하고, b2~b4의 실측을 반영한다). 구조 행이 나머지의 골격이다.

| 구간 | Hard Way (손조작) | RKE2 (접기) | 제품 기능목록 | 상태 |
| --- | --- | --- | --- | --- |
| 구조 | 호스트 프로세스 + systemd 유닛 + 수동 기동 순서 | 단일 바이너리 + 번들 containerd + 정적 파드 + supervisor(9345) | 번들 생성 / InstallSvc 설치 | A 실측 · [B 실측(b2)](./b2-install-server-and-agents#server-install) |
| [a1](./a1-pki-and-trust) 신뢰 | 단일 CA · leaf 8 · kubeconfig 6 (파일 26) | 내부 다중 CA · 전 인증서·kubeconfig 자동, `tls-san` | InstallSvc 사전준비(인증서) · config.yaml 생성 | A 실측 · [B 실측(b2)](./b2-install-server-and-agents#config-key-mapping) ¹ |
| [a2](./a2-data-encryption) 암호화 | `/dev/urandom` 키 · EncryptionConfig · apiserver 플래그 | `secrets-encryption`(기본 활성 aescbc) · `rke2 secrets-encrypt` | 설치 후 검증(암호화) · Day-2 키 회전 | A 실측 · [B 실측(b3)](./b3-verify-smoke#encryption-verify) |
| [a3](./a3-etcd-bootstrap) etcd | 평문 루프백 단일 노드 · 수동 스냅샷 · 미참조 인증서 | TLS etcd 정적 파드 · 임베디드 HA · 스케줄 스냅샷 | UpgradeSvc etcd 백업·복구 | A 실측 · [B 실측(b2·b4)](./b4-upgrade-and-backup#etcd-snapshot) ² |
| [a4](./a4-control-plane) 컨트롤 플레인 | apiserver 플래그 수동 배선(대역 드리프트) | 정적 파드 플래그 정합 주입, `cluster-cidr`·`service-cidr` | InstallSvc 설치 · config.yaml 키 | A 실측 · [B 실측(b2)](./b2-install-server-and-agents#config-key-mapping) |
| [a5](./a5-worker-nodes) 워커 | containerd·runc·CNI·kubelet·kube-proxy 수동 · 커널 준비 · 노드별 `/24` | 번들 설치 · 기본 Canal(우리는 Calico) · 에이전트 `server`+`token` · CNI IPAM | InstallSvc 사전점검·설치 · 번들 전송 | A 실측 · [B 실측(b2)](./b2-install-server-and-agents#agent-join) |
| [a6](./a6-pod-network-dns) 라우트·DNS | L3 정적 라우트(netplan) · CoreDNS 수동 배포 | Calico VXLAN 오버레이 · CoreDNS 애드온 자동 | config.yaml `cni` · 설치 후 DNS 검증 | A 실측 · [B 실측(b3)](./b3-verify-smoke#cross-node-overlay) |
| [a7](./a7-smoke-test) 스모크 | 수동 여섯 테스트(암호화 hexdump·NodePort) | 노드 Ready · kubeconfig 자동 점검 | InstallSvc 점검 · 제품 관찰 노트 | A 실측 · [B 실측(b3)](./b3-verify-smoke#nodeport-all-nodes) |

¹ `tls-san`과 TLS 도달은 실측. 내부 다중 CA 위상(`/var/lib/rancher/rke2/server/tls`) 열람은 미완([미실행 표면](#not-executed)).
² etcd TLS 정적 파드·온디맨드/스케줄 스냅샷은 실측. HA etcd는 단일 서버라 미검증.

## 사전점검·사전준비 대응 {#precheck-preprep-mapping}

[b1](./b1-lab-and-node-prep)에서 실물로 밟은 앞단 두 단계다. 트랙 A에는 명시적으로 없던 구간이라 Hard Way 열이 "암묵 전제"로 채워지며, 이 구간이 제품 InstallSvc의 pre-check·pre-prep에 가장 직접 대응한다.

| 구간 | Hard Way (손조작) | RKE2 (접기) | 제품 기능목록 | 상태 |
| --- | --- | --- | --- | --- |
| 사전점검 | (암묵) 깨끗한 이미지 전제 | install.sh 사전 확인 · fail-fast | InstallSvc 사전점검(OS·CPU·메모리·디스크·충돌·Port) | B 실측(b1) |
| 사전준비 공통 | [a5](./a5-worker-nodes) `swapoff` · [a0](./a0-lab-topology-and-network) 이름 배선 | 설치 스크립트가 sysctl·모듈 처리, config.yaml 생성 | InstallSvc 사전준비(호스트명·swap·시간동기·config 생성) | B 실측(b1·b2) |
| 사전준비 RedHat 분기 | (트랙 A Ubuntu엔 없음) | firewalld·NetworkManager·SELinux 조정 요구 | InstallSvc 사전준비 RedHat 분기 | B 실측(b1·b2) |
| 버전 분기 | (트랙 A 단일 OS) | Rocky 9/10 차이(`kernel-modules-extra`·CPU 기준선·dnf) | 번들 생성 OS·버전 선택 · 사전준비 생성 분기 | B 실측(b1) |
| 롤백(install-time) | (트랙 A 수동 복구·재배선) | `uninstall.sh`·`killall.sh` 전체 롤백 | InstallSvc 실패 시 롤백 | 문서 · 미실행 |

## 검증·Day-2 대응 {#verify-day2-mapping}

트랙 B 페이즈 2에서 채웠다.

| 구간 | Hard Way (손조작) | RKE2 (접기) | 제품 기능목록 | 상태 |
| --- | --- | --- | --- | --- |
| 설치 검증 | [a7](./a7-smoke-test) 수동 스모크 | `kubectl get nodes` · 오버레이·DNS·NodePort·암호화 | InstallSvc 점검(kubeconfig·노드 상태) | [B 실측(b3)](./b3-verify-smoke) |
| 업그레이드 | (트랙 A 해당 없음) | `install.sh` 재실행 · 서비스 재시작 · 서버→에이전트 순서 | UpgradeSvc(버전 조회·순서·재시작) | [B 실측(b4)](./b4-upgrade-and-backup#rolling-upgrade) |
| etcd 백업·복구 | [a3](./a3-etcd-bootstrap) 수동 스냅샷 | `rke2 etcd-snapshot save` · `--cluster-reset` 복구 | UpgradeSvc 사전준비(etcd 백업)·실패 복구 | [B 실측(b4)](./b4-upgrade-and-backup#restore-path) ³ |

³ 온디맨드 스냅샷은 실행. `--cluster-reset` 복구는 문서화만(미실행).

## 미실행 표면 {#not-executed}

빌드에서 밟지 않아 아직 실측이 아닌 표면을 명시한다. 표의 상태 각주가 여기로 모인다.

- **HA etcd** : 단일 서버 랩이라 3·5·7대 임베디드 etcd HA는 미검증. 정족수·재합류 동역학은 트랙 B 확장 또는 별도 랩에서.
- **내부 다중 CA 위상** : `tls-san`과 TLS 도달은 실측했으나 `/var/lib/rancher/rke2/server/tls`의 다중 CA 열람은 미완. a1 단일 CA 대조를 닫으려면 이 열람이 필요.
- **install-time 롤백** : `uninstall.sh`·`killall.sh`로 되감는 InstallSvc 롤백은 문서 개념만, 미실행.
- **etcd 복구 실행** : `--cluster-reset --cluster-reset-restore-path` 복구는 명령으로 문서화했으나 실제 복구 리허설은 미실행. 스냅샷이 있으니 안전하게 리허설 가능.
- **저장 암호화 hexdump** : `secrets-encrypt status`로 활성만 확인. a7의 `etcdctl | hexdump` 저장소 바이트 재현은 미실행([b3 REVIEW-REQUIRED](./b3-verify-smoke#encryption-verify)).

## 읽는 법과 갱신 규칙 {#read-and-update}

행은 코덱스 카드의 적용 대상 축에서 파생된다. 새 카드가 제품 기능목록 항목에 매핑되면, 그 매핑을 이 표의 한 행으로 등록한다. 상태는 트랙 진행을 따라 승격한다. Hard Way 열이 먼저 A 실측으로 서고, 트랙 B에서 RKE2 설정 표면을 실물로 확인하면 그 행이 B 실측이 된다. 실측하지 못한 표면은 [미실행 표면](#not-executed)으로 내려, 표가 "다 채워진 것처럼" 위장하지 않게 한다.

이 표의 값은 역참조에 있다. 제품 설계서·화면 정의서를 검수할 때, 기능목록 항목을 짚으면 그 항목이 어느 Hard Way 손조작에서 왔고 RKE2의 어느 설정으로 접히는지가 한 줄로 잡히고, 상태 열이 그것이 실측인지 미실행인지를 알려준다. 골수 근거와 출처는 각 구간 문서의 카드에 있다. 다음 갱신은 트랙 C(Cilium eBPF)에서 오버레이가 eBPF 데이터플레인으로 바뀔 때, a6·b3의 오버레이 행에 트랙 C 열이 붙는 자리다.
