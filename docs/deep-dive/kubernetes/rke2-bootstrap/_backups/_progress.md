---
title: "rke2-bootstrap 진행 원장"
series: "rke2-bootstrap"
status: "wip"
draft: true
---

# 진행 원장 {#progress-ledger}

이 원장은 파생 불가한 것만 담는다. 재개 포인터, 열린·확정 결정, 짧은 세션 로그다. 진행 상세
(완료 페이즈, 남은 갭)는 각 문서의 `status`·`draft`·`review`와 `REVIEW-REQUIRED` grep으로
파생되므로 여기 복사하지 않는다. 상류 문서 정정 규칙은 `codex-partial-edit-rule.md`.

## 재개 포인터 {#resume-pointer}

트랙 B 빌드를 완주했다. B0 대조 → b1 랩·사전준비 → b2 설치 → b3 검증 → b4 업그레이드·백업까지, 3노드 혼종 클러스터를 세우고 데이터 플레인 대조를 검증하고 Day-2까지 돌렸다. 클러스터는 `v1.36.2+rke2r1`로 선다(`v1.35.6`에서 업그레이드).

랩 상태: `rke2-server`(Ubuntu 24.04, Multipass, `10.240.0.30`, control-plane+etcd), `rke2-agent-0`(Ubuntu 24.04, Multipass, `10.240.0.31`), `rke2-agent-1`(Rocky Linux 10.2, Hyper-V 직접, `10.240.0.32`). 세 노드 전부 `node-ip`로 `eth1` 고정 IP 고정. CNI는 Calico(오퍼레이터 관리형), 저장 암호화 기본 활성(aescbc).

검증 완료: Calico VXLAN 오버레이 노드 간·혼종 OS(Ubuntu↔Rocky) 파드 통신, NodePort 전 노드 도달(파드 없는 노드 포함, a7 열린 항목 종결), `rke2 secrets-encrypt status` Enabled(aescbc), CoreDNS 자동 애드온 이름 해석. Day-2: etcd 온디맨드 스냅샷(`pre-upgrade`) 후 서버→에이전트 순차 업그레이드, ingress-nginx 유지 확인, 복구 경로(`--cluster-reset --cluster-reset-restore-path`) 문서화.

다음: 문서화가 남았다. b2(설치)·b3(검증)·b4(업그레이드)를 코덱스로 박고, `z-mapping.md`의 RKE2 열을 B 실측으로 승격(검증·Day-2 행 포함), 제품 관찰 노트를 정리한다. 그다음 트랙 C(Cilium eBPF) 캡스톤은 코어 주말 이후.

미해결 표면 둘. `rke2-agent-1` 동적 메모리 미고정(업그레이드는 서비스 재시작이라 VM 재부팅이 없어 커널 `211.16` 유지). 재부팅 시 고정하며 커널도 `211.28`로 넘긴다. 그리고 b2·b3·b4는 빌드만 끝났고 아직 미문서화다(b0·b1은 초안 작성됨, `draft: true`).

닫힌 표면: A7의 NodePort 타 노드 도달 REVIEW-REQUIRED는 b3 테스트 3에서 종결했다(a7 정정 반영 필요).
b0·b1·z-mapping은 `draft: true`/`review: unreviewed`이며, 저술은 민지가, 리포 커밋·리뷰 승격은 Davi가 맡는다.

## 열린·확정 결정 {#decisions}

- IP 전략 (2026-07-11 개정) : 고정 IP로 전환. 전용 internal Hyper-V vSwitch(`multipass`, 호스트
  `10.240.0.1/24`)에 이중 NIC + netplan MAC 매칭. 트랙 A 노드 `10.240.0.5/.10/.20/.21`.
- 이름 배선 드리프트 차단 (2026-07-11) : cloud-init `manage_etc_hosts` 재생성 대비, 템플릿
  `/etc/cloud/templates/hosts.debian.tmpl`에 FQDN 블록 고정.
- 라우트 영속 (2026-07-11 A6) : 파드 라우트를 netplan `routes:`로 박아 재부팅 생존.
- apiserver 정합 (2026-07-11 A6) : `--advertise-address`·`--service-cluster-ip-range` 추가로 대역·엔드포인트 정렬.
- OS (2026-07-11 / 2026-07-12) : 트랙 A는 Ubuntu 24.04 통일. 트랙 B는 혼종(Ubuntu server·agent-0 + Rocky 10 agent-1). RedHat 분기 관찰.
- RKE2 stable 핀(트랙 B) : 설치는 `v1.35.6+rke2r1`, b4에서 `v1.36.2+rke2r1`로 업그레이드(K8s 1.36.2, etcd v3.6.12-k3s1).
- 트랙 B 랩 IP·토폴로지 (2026-07-12) : `multipass` 스위치 재사용, server `.30`·agent-0 `.31`·agent-1 `.32`. jumpbox 없음(RKE2가 CA 워크스테이션을 접음). kubectl은 서버 `/etc/rancher/rke2/rke2.yaml`.
- Rocky 프로비저닝 경로 (2026-07-12) : Multipass가 Windows에서 Rocky를 못 띄워, Hyper-V Gen2 VM으로 직접(Secure Boot Microsoft UEFI CA, 이중 NIC, nmcli 고정 IP). processor compatibility는 x86-64-v3(Rocky 10)를 깨므로 off.
- Rocky 버전 분기 (2026-07-12) : Rocky 9(x86-64-v2, dnf4, `kernel-modules-extra` 불필요) vs Rocky 10(x86-64-v3, dnf5, `kernel-modules-extra` 필요). iptables는 RKE2 번들이라 무영향(10은 legacy 제거). 폐쇄망 제품 사전준비 생성기의 버전 분기 축.
- config.yaml 핵심 키 (2026-07-12) : `node-ip`로 `eth1` 고정 IP 강제(드리프트 eth0 advertise 차단, a6 교정의 접힘). `tls-san`·`cni: calico`·`cluster-cidr: 10.42.0.0/16`·`service-cidr: 10.43.0.0/16`·`write-kubeconfig-mode`. 토큰은 공유 비밀(미지정 시 무작위, 부트스트랩 암호화 겸용).
- control-plane taint (2026-07-12) : b3에서 `kubectl taint rke2-server CriticalAddonsOnly=true:NoExecute` 적용(노드 오브젝트라 재시작 생존). 영속·재현은 config.yaml `node-taint` 키(제품의 "taint 여부" 옵션).
- 인그레스 전환 (2026-07-12, b4 확인) : 기존 클러스터는 v1.36 업그레이드에도 ingress-nginx 유지. 단 v1.36부터 신규 기본 Traefik, air-gap 코어 tarball도 Traefik, ingress-nginx는 v1.37 커뮤니티 제거. 번들 생성 로직 직결.

## 세션 로그 {#session-log}

- 2026-07-10 : 00 오리엔테이션 + A1 배선 + 04 개념부.
- 2026-07-11 (빌드/문서) : A-페이즈 1·2. CA·kubeconfig·암호화·etcd·컨트롤 플레인·워커·라우트·DNS·스모크. 트랙 A 완주. a0~a7 + SVG.
- 2026-07-12 (트랙 B 강의) : b0(접힘 대조 앵커) + b1(사전점검·사전준비). RKE2 아키텍처·요건·SELinux·known-issues·Rocky 9/10 차이 확정.
- 2026-07-12 (b1 빌드) : 트랙 B 3노드 프로비저닝. Ubuntu 2대(Multipass), Rocky 10 1대(Hyper-V). 삽질 셋(multipassd Ctrl+C 먹통·Rocky graceful 종료 걸림·`--bridged` DHCP 대기). Rocky RedHat 분기 사전준비 적용. iptables 과잉 정정.
- 2026-07-12 (문서) : b0·b1 코덱스 초안, `z-mapping.md` 독립 승격, `b1-lab-topology` SVG 생성.
- 2026-07-12 (b2 설치) : 서버 config.yaml(node-ip·tls-san·cni:calico·cidr) + `v1.35.6` 서버 설치, 에이전트 2대 조인(agent-0 tarball, agent-1 Rocky RPM). 삽질: agent-0 토큰 placeholder 미치환(재시작 교정). 3노드 혼종 Ready, INTERNAL-IP 전부 eth1.
- 2026-07-12 (b3 검증) : control-plane taint, Calico 오버레이 노드 간·혼종 OS 파드 통신, CoreDNS, NodePort 전 노드 도달(a7 종결), secrets-encrypt Enabled(aescbc).
- 2026-07-12 (b4 Day-2) : etcd 온디맨드 스냅샷, `v1.36.2`로 순차 업그레이드(서버→에이전트, Rocky는 `/usr/bin` RPM), ingress-nginx 유지 확인, 복구 경로 문서화. 트랙 B 빌드 완주.
