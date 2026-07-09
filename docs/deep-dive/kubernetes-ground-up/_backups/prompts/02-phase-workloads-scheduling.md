# Phase 2 프롬프트 — 워크로드 & 스케줄링 (Workloads & Scheduling)

> **사용법**: 공통 프롬프트(`00-common-prompt`)를 먼저 붙여넣고, 이어서 이 파일을 붙여넣는다.

## 이 채팅의 Phase
**Phase 2 — 워크로드 & 스케줄링.** 허브(조정 루프)가 "무엇을 몇 개, 어디에" 돌릴지 결정하는 층. 과거 `1117` 실습에서 Node 관리는 완주했지만 **Pod 관리(06~13번)를 목차만 남기고 미완**으로 둔 그 구멍을 정확히 메운다.

## 선행 학습 상태
- **Phase 1(기반)** ✅ — 컨트롤 플레인·스케줄러·조정 루프가 이미 돈다.
- 이번이 **Phase 2**. 이후: Phase 3(스토리지) → … → Phase 8.
- *(Phase 1 인계 메모 붙여넣기)*

## 허브와의 연결점
Phase 1에서 세운 kube-scheduler가 "원하는 상태(replicas·제약)"를 받아 노드에 Pod를 배치하고, 컨트롤러(Deployment/ReplicaSet 등)가 실제↔원하는 차이를 조정한다. 이번 Phase는 그 "원하는 상태"를 어떻게 정교하게 선언하는가 — 워크로드 타입·프로브·스케줄링 제약이 전부 조정 루프의 입력이다.

## 이 Phase의 하위 토픽 (왜 → 정의 → 사용 → 한계)
1. **왜**: Pod는 최소 배포 단위지만 직접 쓰지 않는다. 자가치유·확장·롤아웃을 컨트롤러가 조정하기 때문.
2. **워크로드 타입**: Deployment/ReplicaSet(무상태), StatefulSet(안정 신원·순서·스토리지), DaemonSet(노드당 하나), Job/CronJob(완료형·스케줄). 언제 무엇을 쓰나.
3. **Pod 설계·수명주기**: `restartPolicy`, Init Container(순서 보장 준비작업), 멀티컨테이너 패턴(사이드카/앰배서더/앰배서더/어댑터).
4. **프로브(probe)**: liveness/readiness/startup 3종의 목적 차이와 **실패 모드**. readiness 실패 시 트래픽 차단 vs liveness 실패 시 재시작.
5. **리소스**: requests/limits, QoS(Guaranteed/Burstable/BestEffort), OOMKilled·CPU throttling. In-Place Pod Resize(v1.33+ Stable)로 재시작 없이 조정.
6. **스케줄링 제약**: nodeSelector, nodeAffinity(required/preferred), podAffinity/anti-affinity, Taint/Toleration, Topology Spread Constraints.
7. **자동 확장**: HPA(Horizontal Pod Autoscaler, 부하 기반 Pod 수 조절), metrics-server 의존성.
8. **한계**: 프로브 오설정이 부르는 롤아웃 교착, anti-affinity가 스케줄 불가(Pending)를 부르는 함정, HPA와 리소스 미설정의 상호작용.

## CKA/CKAD 매핑 + 완료 정의(DoD)
- **CKA**: Workloads & Scheduling **15%**. **CKAD**: Application Design and Build 큰 덩어리.
- **DoD**: ①각 워크로드 타입을 "언제 쓰는지" 구분해 설명, ②프로브 3종 실패 모드를 각각 재현·진단, ③스케줄링 제약 4종(selector/affinity/taint/topology) 실습, ④OOMKilled·throttling을 의도적으로 유발해 관찰.

## 시작 지시
**진단 질문 1개**부터(예: "Deployment의 Pod와 StatefulSet의 Pod는 재생성 시 무엇이 결정적으로 다른가 — 이름·스토리지·순서 관점에서? 그리고 흔히 *놓치는* 한 가지는?"). 채점 후 1번부터.

## 마감
공통 프롬프트 §7 **"Phase 마감 점검 의식"** 실행 → 인계 메모 생성. 다음 Phase는 **Phase 3(스토리지)**.
