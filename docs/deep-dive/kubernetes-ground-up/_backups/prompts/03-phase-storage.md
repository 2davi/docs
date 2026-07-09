# Phase 3 프롬프트 — 스토리지 (Storage)

> **사용법**: 공통 프롬프트(`00-common-prompt`)를 먼저 붙여넣고, 이어서 이 파일을 붙여넣는다.

## 이 채팅의 Phase
**Phase 3 — 스토리지.** 무상태 워크로드(Phase 2)에 **영속성**을 붙이는 층. 과거 NFS 동적 프로비저너를 "돌아가게" 만들어봤지만 개념적으로 정리하지 않은 그 부분을 체계화한다.

## 선행 학습 상태
- **Phase 1(기반)** ✅, **Phase 2(워크로드)** ✅ — StatefulSet의 `volumeClaimTemplates`가 여기서 완결된다.
- 이번이 **Phase 3**. 이후: Phase 4(네트워킹) → … → Phase 8.
- *(Phase 2 인계 메모 붙여넣기)*

## 허브와의 연결점
PVC(PersistentVolumeClaim)는 "이만한 스토리지를 원한다"는 **선언**이고, 프로비저너와 PV 컨트롤러가 실제 볼륨을 만들어 바인딩하는 것이 **조정**이다. 스토리지도 결국 조정 루프의 한 갈래 — 원하는 상태(PVC)와 실제 자원(PV)을 맞춘다.

## 이 Phase의 하위 토픽 (왜 → 정의 → 사용 → 한계)
1. **왜**: 컨테이너 파일시스템은 휘발성. 재시작·재스케줄에도 살아남는 데이터는 별도 추상화가 필요.
2. **Volume 종류**: emptyDir/hostPath(수명·이식성 한계), 그리고 PV로 가는 이유.
3. **PV/PVC 수명주기**: 프로비저닝(정적 vs 동적) → 바인딩 → 사용 → 반환. `accessModes`(RWO/ROX/RWX), `volumeBindingMode`(Immediate/WaitForFirstConsumer).
4. **StorageClass·동적 프로비저닝**: 프로비저너·파라미터·기본 클래스. PVC가 자동으로 PV를 얻는 흐름.
5. **CSI(Container Storage Interface)**: 스토리지 플러그인의 표준. 인트리→아웃오브트리 이전의 의미.
6. **reclaimPolicy**: Delete vs Retain. PVC 삭제 후 데이터가 남거나 사라지는 이유.
7. **StatefulSet 스토리지**: `volumeClaimTemplates`로 Pod별 안정 볼륨. 스케일 시 PVC 생성·잔존 규칙.
8. **한계**: RWX의 백엔드 제약(NFS 등), PVC Pending의 흔한 원인(클래스·프로비저너·용량), reclaim 오설정에 의한 데이터 소실/누수.

## CKA/CKAD 매핑 + 완료 정의(DoD)
- **CKA**: Storage **10%**. **CKAD**: state management.
- **DoD**: ①동적 프로비저닝의 전체 흐름(PVC→PV 바인딩)을 설명, ②PVC Pending 상태를 유발하고 원인 3종을 진단, ③reclaimPolicy Delete/Retain 차이를 실습으로 확인, ④StatefulSet 스케일 시 PVC 거동 관찰.

## 시작 지시
**진단 질문 1개**부터(예: "PVC를 지웠는데 백엔드에 데이터가 그대로 남았다. reclaimPolicy는 무엇이었을 것이며, 왜 그렇게 동작하나? 그리고 이때 남은 PV의 *상태*는?"). 채점 후 1번부터.

## 마감
공통 프롬프트 §7 **"Phase 마감 점검 의식"** 실행 → 인계 메모 생성. 다음 Phase는 **Phase 4(서비스 & 네트워킹)**.
