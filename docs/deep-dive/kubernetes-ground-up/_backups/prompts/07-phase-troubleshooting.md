# Phase 7 프롬프트 — 트러블슈팅 (Troubleshooting)

> **사용법**: 공통 프롬프트(`00-common-prompt`)를 먼저 붙여넣고, 이어서 이 파일을 붙여넣는다.

## 이 채팅의 Phase
**Phase 7 — 트러블슈팅.** 앞선 모든 Phase를 *부수며 통합*하는 층. **CKA 최대 배점(30%)이자 탈락 1순위** — 학습 시간의 최소 1/3을 여기 붓는다. 반전: 네 과거 문서는 이미 실전 장애 일지다(ArgoCD OOM, Cilium 429, Static Pod CrashLoop, 포트 점유, DNS 타임아웃). 그 상처를 **드릴 플레이북으로 승격**한다.

## 선행 학습 상태
- **Phase 1~6** ✅ — 각 도메인을 알아야 "무엇이 어떻게 깨지는지"를 안다. 그래서 트러블슈팅을 뒤에 뒀다.
- 이번이 **Phase 7**. 이후: Phase 8(캡스톤).
- *(Phase 6 인계 메모 붙여넣기)*

## 허브와의 연결점
장애란 결국 "원하는 상태 ≠ 실제 상태"가 조정되지 못하고 멈춘 것. 진단은 항상 조정 루프의 어느 고리가 끊겼는지를 역추적하는 일이다 — 선언(스펙)? API 관문(RBAC/admission)? 스케줄(리소스/제약)? 실행(kubelet/CNI/CSI)?

## 이 Phase의 하위 토픽 (왜 → 정의 → 사용 → 한계)
1. **왜**: 실무·시험 둘 다 "새로 짓기"보다 "왜 안 되는지"가 압도적. 체계적 진단 프로토콜이 무기.
2. **진단 도구**: `describe`(이벤트·상태)·`logs`(+`--previous`)·`get -o yaml`·`events --sort-by`·시스템 컴포넌트 로그(`journalctl -u kubelet`, static pod 로그) — 무엇을 언제 보나.
3. **Pod 장애**: CrashLoopBackOff·OOMKilled·ImagePullBackOff·Pending. 각 증상→원인 매핑.
4. **노드 장애**: NotReady, DiskPressure/MemoryPressure, kubelet·containerd 이상, cordon/drain 복구.
5. **컨트롤 플레인 장애**: Static Pod 떼죽음, etcd 이상, 포트 점유, 인증서 만료 — Phase 1 지식의 역방향 활용.
6. **네트워킹 장애**: DNS 해석 실패, Service Endpoints 공백, NetworkPolicy 과차단, CNI 이상.
7. **플레이북화**: 증상별 진단 플로우차트 + 과거 실전 장애를 재현→복구하는 드릴.
8. **한계**: 로그가 없는 침묵 실패(eBPF/Hubble로 보강), 시간 압박 하의 우선순위(2시간·부분점수), 재현 불가한 상태 의존 버그.

## CKA/CKAD 매핑 + 완료 정의(DoD)
- **CKA**: Troubleshooting **30%** — 단일 최대 도메인. **CKAD**: Observability and Maintenance 일부.
- **DoD**: ①Pod/노드/컨트롤플레인/네트워킹 4계층의 진단 플로우차트 보유, ②의도적 고장 주입→복구 5종 이상(예: 잘못된 이미지·리소스 초과·NetworkPolicy 과차단·etcd 스냅샷 복원·DNS 붕괴), ③각 장애에서 "첫 명령"이 무엇인지 즉답.

## 시작 지시
**진단 질문 1개**부터(예: "Pod가 CrashLoopBackOff다. `describe`와 `logs` 중 무엇을 *먼저* 보고, 각각에서 정확히 무엇을 찾나? 그리고 이 둘로도 안 잡히면 다음 수는?"). 채점 후 1번부터.

## 마감
공통 프롬프트 §7 **"Phase 마감 점검 의식"** 실행 → 인계 메모 생성. 다음 Phase는 **Phase 8(관측성 & 아키텍트 종합)**.
