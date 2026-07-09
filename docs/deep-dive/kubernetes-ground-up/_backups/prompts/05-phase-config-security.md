# Phase 5 프롬프트 — 설정 & 보안 (Config & Security)

> **사용법**: 공통 프롬프트(`00-common-prompt`)를 먼저 붙여넣고, 이어서 이 파일을 붙여넣는다.

## 이 채팅의 Phase
**Phase 5 — 설정 & 보안.** 워크로드에 설정을 주입하고, "누가 무엇을 할 수 있는가"를 통제하는 층. `1118` Part 1(RBAC)·Part 4(ConfigMap/Secret)를 완결하고, 과거의 보안 위생 파탄(하드코딩·`777`·NOPASSWD)을 **정반대의 규율**로 뒤집는다.

## 선행 학습 상태
- **Phase 1~4** ✅ — Phase 1에서 스친 API 요청 파이프라인(authn/authz/admission)이 여기서 본격 회수된다.
- 이번이 **Phase 5**. 이후: Phase 6(배포) → Phase 7 → Phase 8.
- *(Phase 4 인계 메모 붙여넣기)*

## 허브와의 연결점
모든 `kubectl` 선언은 API 서버의 **인증 → 인가(RBAC) → 어드미션** 3단 관문을 통과해야 etcd에 기록된다. 이번 Phase는 그 관문 자체를 판다 — 조정 루프의 *입구 경비*를 설계하는 작업.

## 이 Phase의 하위 토픽 (왜 → 정의 → 사용 → 한계)
1. **왜**: 설정을 이미지에 박으면(과거 패턴) 환경 분리·회전·감사가 불가. 권한을 열어두면 사고가 전면화.
2. **ConfigMap/Secret**: 생성(literal/file/env), 주입(env var vs volume mount), Immutable, Secret의 base64는 *인코딩*이지 *암호화*가 아님(→ etcd 저장 시 암호화 별도).
3. **ServiceAccount**: Pod의 신원. 토큰 자동 마운트, API 호출 주체.
4. **RBAC(Role-Based Access Control)**: Role/ClusterRole + RoleBinding/ClusterRoleBinding. `kubectl auth can-i`로 검증. 최소권한(least privilege) 설계.
5. **SecurityContext**: runAsNonRoot, readOnlyRootFilesystem, capabilities drop, User Namespaces(v1.36 GA — 컨테이너 root를 호스트 비특권 사용자로 매핑).
6. **Admission**: 내장 컨트롤러(LimitRanger 등), 그리고 MutatingAdmissionPolicies(v1.36 Stable, CEL 기반 네이티브 변경)·정책엔진(Kyverno/OPA) 개요 — 과거 Kyverno 웹훅 작업의 현대적 대안.
7. **한계**: RBAC의 누적·와일드카드가 부르는 과권한, Secret 평문 노출(RBAC·etcd 암호화 미비 시), 어드미션 정책의 디버깅 난이도.

## CKA/CKAD 매핑 + 완료 정의(DoD)
- **CKAD**: Environment, Configuration and Security **25%**. **CKA**: RBAC(Cluster Architecture 도메인 일부).
- **DoD**: ①최소권한 Role을 설계하고 `can-i`로 허용·거부 양쪽 검증, ②Secret을 env·volume 두 방식으로 안전 주입, ③SecurityContext로 비루트·읽기전용 루트 실행 강제, ④base64≠암호화를 실증(디코딩 시연).

## 시작 지시
**진단 질문 1개**부터(예: "'Secret은 base64로 저장되니 암호화된 것이다' — 이 문장의 어디가 틀렸고, 진짜 암호화는 어디서·어떻게 이뤄지나? 그리고 흔히 *놓치는* 노출 경로 하나는?"). 채점 후 1번부터.

## 마감
공통 프롬프트 §7 **"Phase 마감 점검 의식"** 실행 → 인계 메모 생성. 다음 Phase는 **Phase 6(배포 전략)**.
