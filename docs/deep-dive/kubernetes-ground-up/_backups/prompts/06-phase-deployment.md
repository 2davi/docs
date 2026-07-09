# Phase 6 프롬프트 — 배포 전략 (Deployment Strategies)

> **사용법**: 공통 프롬프트(`00-common-prompt`)를 먼저 붙여넣고, 이어서 이 파일을 붙여넣는다.

## 이 채팅의 Phase
**Phase 6 — 배포 전략.** 원하는 상태를 *안전하게 전환*하는 층. `1118` Part 5(배포 전략)·Part 6(Kustomize/ArgoCD)가 목차만 남고 증발한 그 지점 — 이번에 끝까지 판다. Helm·Kustomize는 2025-01 CKA 개편으로 정식 편입됐다. (출처: [CNCF Curriculum](https://github.com/cncf/curriculum))

## 선행 학습 상태
- **Phase 1~5** ✅ — Phase 2의 Deployment·롤아웃 기초 위에 전략을 얹는다.
- 이번이 **Phase 6**. 이후: Phase 7(트러블슈팅) → Phase 8.
- *(Phase 5 인계 메모 붙여넣기)*

## 허브와의 연결점
배포 전략은 "원하는 상태 A → B"로의 전환을 조정 루프가 *어떤 속도·안전장치로* 수렴시키는가의 문제다. Deployment 컨트롤러가 ReplicaSet을 갈아끼우는 방식(maxSurge/maxUnavailable)이 그 수렴 곡선을 결정한다.

## 이 Phase의 하위 토픽 (왜 → 정의 → 사용 → 한계)
1. **왜**: 무중단 전환·빠른 롤백·환경별 설정 분리는 수동으로는 재현 불가. 선언형 도구가 필요.
2. **Rolling Update**: maxSurge/maxUnavailable의 조합이 만드는 가용성·리소스 트레이드오프, `rollout status/history/undo`, revision.
3. **Recreate**: 언제 굳이 다운타임을 감수하나.
4. **Canary / Blue-Green**: 개념 + 경량 데모(라벨·서비스 셀렉터 전환, 또는 Argo Rollouts 개요). 트래픽 분할의 원리.
5. **Helm**: 차트·values·릴리스·리비전. 템플릿화와 릴리스 롤백. (시험 중 `helm.sh/docs` 열람 가능)
6. **Kustomize**: base/overlay로 환경 분리(dev/prod), patch·전략적 병합. Helm과의 철학 차이(템플릿 vs 오버레이).
7. **GitOps**: ArgoCD 경량 구성 — Git이 원하는 상태의 단일 진실, drift 자동 수정. (아키텍트용, 시험은 선택. RAM 위해 필요 시만 상주)
8. **한계**: Rolling 중 프로브 오설정의 교착, Canary의 관측 부재 시 무의미함, Helm/Kustomize 혼용의 복잡도.

## CKA/CKAD 매핑 + 완료 정의(DoD)
- **CKAD**: Application Deployment **20%**. **CKA**: Helm·Kustomize(신규 편입).
- **DoD**: ①`rollout history`→`undo`로 롤백 실습, ②maxSurge/maxUnavailable를 바꿔 수렴 거동 관찰, ③Helm 릴리스 배포·업그레이드·롤백, ④Kustomize overlay로 dev/prod 분리.

## 시작 지시
**진단 질문 1개**부터(예: "Rolling Update에서 `maxUnavailable=0, maxSurge=1`이면 전환 중 무슨 일이 벌어지나 — 가용성과 리소스 관점에서? 그리고 이 설정이 15.8GiB 환경에서 부를 수 있는 *함정*은?"). 채점 후 1번부터.

## 마감
공통 프롬프트 §7 **"Phase 마감 점검 의식"** 실행 → 인계 메모 생성. 다음 Phase는 **Phase 7(트러블슈팅)**.
