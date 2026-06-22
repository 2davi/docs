---
title: "09. 도메인 번역 enum 계층 ─ PVE 날것을 CMP 언어로"
date: 2026-06-16
lastmod: 2026-06-16
author: "Davi"
description: "PVE의 qmstart·vzdump 같은 날것 worker type 문자열을 'VM 시작'·'백업'으로 옮기는 안티-부패 계층. TaskType 중앙 카탈로그의 단방향 의존과 정적 맵 캐싱, ResourceType 접두사 휴리스틱의 vzdump 예외, 카탈로그 vs 휴리스틱 트레이드오프, CmpUtils 조립까지 작지만 묵직한 enum 설계를 다룬다."
slug: domain-translation-enum
section: "notes"
category: "linux/proxmox-ver2"
tags: []
order: 9
series: "Proxmox 실습 v2."
series_order: 9
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


## 들어가며

[08번](./08-mvc-vm-task-log.md)에서 두 번 미뤘다. `controlVm`이 `TaskType.from(type).getDisplayName()`으로 작업명을 문구로 바꾸던 자리, 그리고 `CmpUtils.parseToCmpTask`가 PVE 작업을 화면용으로 변환하던 자리 ─ 둘 다 "이건 09에서"라고 넘겼다. 그 09다.

문제의 본질은 **어휘의 충돌**이다. PVE는 작업을 `qmstart`, `vzdump`, `aptupdate` 같은 날것 문자열로 말한다. 이건 PVE 내부의 worker type일 뿐, 우리 CMP를 쓰는 사용자에겐 의미가 없다. 사용자는 "VM 시작", "백업", "노드 업데이트"를 봐야 한다. 이 둘 사이를 **경계에서 번역**하는 계층이 필요하다.

이런 계층을 도메인 주도 설계(DDD; Domain-Driven Design)에서는 **안티-부패 계층(ACL; Anti-Corruption Layer)** 이라 부른다([Microsoft Azure 아키텍처 패턴](https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer)). 외부 시스템(PVE)의 모델과 어휘가 우리 도메인 안으로 새어 들어와 오염시키지 않도록, 경계에 번역기를 두는 것이다. PVE가 `qmstart`라고 말하면 우리는 그걸 받아 **우리 도메인 언어(대상=VM, 동작=시작)** 로 옮긴 뒤에야 안으로 들인다. 이 번역기를 네 개의 작은 타입으로 만들었다.

- **`TaskType`** ─ PVE worker type ↔ (대상, 동작)을 잇는 중앙 매핑 카탈로그.
- **`ResourceType`** ─ 작업 대상의 표시명(VM, 컨테이너, 노드, 백업).
- **`TaskAction`** ─ 동작의 표시명(시작, 정지, 복제…).
- **`CmpUtils`** ─ 위 셋을 조합해 최종 표시 문구를 만드는 조립기.

코드는 짧다. 그런데 그 짧은 코드에 enum 초기화 함정, 캐싱 결정, 분류 전략의 선택이 압축돼 있다.

<br/>

## 1. 무엇을 번역하나

번역의 양쪽 끝을 먼저 보자.

| PVE 날것 (worker type) | → | CMP 도메인 |
| --- | --- | --- |
| `qmstart` | → | VM · 시작 → **"VM 시작"** |
| `qmshutdown` | → | VM · 종료 → **"VM 종료"** |
| `vzdump` | → | 백업 · 백업 → **"백업"** |
| `aptupdate` | → | 노드 · 업데이트 → **"노드 업데이트"** |

핵심은 **하나의 worker type 문자열을 두 축으로 분해**한다는 점이다 ─ *무엇에 대한*(대상, `ResourceType`) *어떤 작업*(동작, `TaskAction`)인가. `qmstart`는 "VM(대상)을 시작(동작)"이다. 이 분해를 책임지는 게 `TaskType`이다.

<br/>

## 2. 중앙 카탈로그 ─ TaskType

### 2-1. 매핑 테이블로서의 enum

`TaskType`은 각 상수가 **(PVE worker type 문자열, 대상, 동작)** 세 쌍을 묶는 매핑 테이블이다.

```java
public enum TaskType {
    // ── VM (QEMU) : worker type = qm* ──────────────────────
    QM_START   ("qmstart",    ResourceType.VM,        TaskAction.START),
    QM_STOP    ("qmstop",     ResourceType.VM,        TaskAction.STOP),
    QM_SHUTDOWN("qmshutdown", ResourceType.VM,        TaskAction.SHUTDOWN),
    QM_CLONE   ("qmclone",    ResourceType.VM,        TaskAction.CLONE),
    QM_MIGRATE ("qmigrate",   ResourceType.VM,        TaskAction.MIGRATE),   // ★ qmigrate (qmmigrate 아님)
    // ... (qm* 다수 생략) ...

    // ── 컨테이너 (LXC) : worker type = vz* (예외 있음) ──────
    VZ_START   ("vzstart",    ResourceType.CONTAINER, TaskAction.START),
    VZ_DESTROY ("vzdestroy",  ResourceType.CONTAINER, TaskAction.DESTROY),
    CT_MOVE_VOLUME("move_volume", ResourceType.CONTAINER, TaskAction.MOVE), // vz 접두사 안 따르는 예외

    // ── 백업 / 노드 레벨 ───────────────────────────────────
    VZDUMP     ("vzdump",     ResourceType.BACKUP,    TaskAction.BACKUP),
    APT_UPDATE ("aptupdate",  ResourceType.NODE,      TaskAction.UPDATE),

    UNKNOWN    ("",           ResourceType.UNKNOWN,   TaskAction.UNKNOWN);

    private final String pveType;
    private final ResourceType resourceType;
    private final TaskAction action;
    // ... 생성자·접근자 생략 ...
}
```

이 카탈로그는 **PVE의 `task_desc_table`을 기준 삼아** 작성했다. `task_desc_table`은 PVE 웹 위젯 툴킷(widget-toolkit)이 worker type을 자원 라벨·설명에 매핑해 둔 테이블로, 사실상 "어떤 worker type이 어떤 작업인가"의 정답지다. 카탈로그가 이 테이블의 대표 집합을 옮겨 담은 셈이다.

### 2-2. 단방향 의존 ─ enum 초기화 함정

여기 Java enum의 미묘한 함정이 숨어 있다. `TaskType` 상수들이 `ResourceType.VM`, `TaskAction.START`를 **참조**하고 있다. 이 의존 방향이 한쪽으로만 흘러야 한다.

> **의존 방향은 `TaskType` → `{ResourceType, TaskAction}` 단방향이다. 두 원자 enum은 절대 `TaskType`을 역참조하지 않는다.**

왜 단방향을 강제하느냐 ─ **enum 상호 참조는 초기화 중 `null` 사고를 낸다.** enum 상수는 클래스 로딩 시점에 순차적으로 초기화되는데, 만약 `TaskType`이 `ResourceType`을 참조하고 `ResourceType`도 거꾸로 `TaskType`을 참조하면, 한쪽을 초기화하는 도중에 *아직 초기화되지 않은* 다른 쪽 상수를 참조하게 된다. 그 순간 그 상수는 `null`이다. 이런 순환은 추적하기 까다로운 버그라, 애초에 의존을 단방향으로 설계해 원천 차단한다.

그래서 `ResourceType`과 `TaskAction`은 **표시명(`displayName`)만 들고 있는 순수한 "원자"** 로 남는다. 자기가 어떤 `TaskType`에 속하는지 모른다. 분류 지식은 오로지 `TaskType` 카탈로그 한 곳에만 있다. 이게 단일 진실 공급원(Single Source of Truth)이기도 하다 ─ "qmstart는 VM의 시작"이라는 지식이 여기저기 흩어지지 않고 `TaskType` 한 곳에 모인다.

### 2-3. 정적 Map 캐싱 ─ from()

PVE가 준 문자열로 `TaskType`을 찾는 `from()` 메서드가 번역의 입구다. 여기서 **정적 Map을 미리 구축**해 둔다.

```java
// 클래스 로딩 시 1회 구축: "qmstart" → QM_START 형태의 역방향 조회 맵
private static final Map<String, TaskType> BY_PVE_TYPE
        = Arrays.stream(values())
                .filter(t -> !t.pveType.isEmpty())
                .collect(Collectors.toUnmodifiableMap(TaskType::pveType, t -> t));

public static TaskType from(String pveType) {
    if (pveType == null) return UNKNOWN;
    return BY_PVE_TYPE.getOrDefault(pveType, UNKNOWN);   // O(1) 조회
}
```

`from()`을 부를 때마다 `values()`를 순회해 일일이 비교할 수도 있다. 하지만 그건 호출마다 O(n)이다. 작업 목록이 길면(데이터센터 전체 작업 이력은 수백 건일 수 있다) 그 비용이 쌓인다. 대신 **클래스 로딩 시점에 `BY_PVE_TYPE` 맵을 딱 한 번 구축**해 두면, 이후 모든 `from()` 호출이 O(1) 해시 조회로 끝난다. `toUnmodifiableMap`으로 불변 맵을 만들어, 런타임에 누가 건드릴 수 없게 못박는다. 빈 문자열 `pveType`을 가진 `UNKNOWN`은 맵에서 제외한다(역방향 키로 쓸 수 없으니).

### 2-4. 모르면 UNKNOWN, 그래도 원본은 보존

`from()`은 카탈로그에 없는 문자열이 오면 `UNKNOWN`을 돌려준다. 이게 단순한 방어가 아니라 의도된 설계다.

PVE의 worker type은 사양상 **임의의 ASCII 문자열**이다. PVE 버전이 올라가거나 플러그인이 추가되면 카탈로그에 없는 새 작업 종류가 언제든 나타날 수 있다. 그때 앱이 예외로 죽으면 안 된다. **모르는 작업이라도 "알 수 없음"으로 표시하며 이력은 남기는** 우아한 성능 저하(Graceful Degradation)가 원칙이다.

게다가 미열거 작업이라도 **원본 문자열은 UPID에 그대로 보존**된다. `TaskType`이 `UNKNOWN`으로 분류해도, 그 작업의 UPID(`UPID:node:...:실제workertype:...`)에는 진짜 worker type이 살아 있다. 그래서 나중에 카탈로그에 그 타입을 추가하면, 과거 이력도 소급해 재분류할 수 있다. 분류는 실패해도 데이터는 잃지 않는다.

### 2-5. qmigrate, move_volume ─ 카탈로그 방식의 함정

카탈로그 방식의 대가는 **정확한 문자열을 알아야 한다**는 것이다. 직관과 어긋나는 worker type이 함정으로 도사린다.

- **`qmigrate` (≠ `qmmigrate`)** ─ VM 마이그레이션의 worker type은 `qmmigrate`일 것 같지만, 실제로는 `m`이 하나인 `qmigrate`다. 카탈로그에 `qmmigrate`로 등록하면 영원히 매칭되지 않고 `UNKNOWN`으로 빠진다.
- **`move_volume`** ─ 컨테이너 디스크 이동인데 `vz` 접두사를 따르지 않는다. `vzmove` 같은 게 아니라 `move_volume`이다. 접두사 규칙으론 못 잡는 불규칙 예외라, 카탈로그에 콕 집어 등록해야 한다.

이런 함정 때문에 **추측으로 등록하면 안 된다.** 컨테이너의 clone·migrate·snapshot 등은 명명이 불규칙할 수 있으므로, 자기 PVE 버전의 `task_desc_table`에서 실제 문자열을 확인한 뒤 등록하는 게 안전하다. *논리적 추론: 단일 노드 홈랩에선 마주칠 worker type이 제한적이라 핵심만 등록하고 나머지는 UNKNOWN으로 두는 게 합리적이다. 클러스터로 확장하며 새 작업을 만나면 그때 카탈로그를 늘린다.*

<br/>

## 3. 표시명 enum ─ ResourceType, TaskAction

`ResourceType`과 `TaskAction`은 2-2에서 말한 "순수한 원자"다. 표시명만 들고 있다.

```java
public enum ResourceType {
    VM("VM"), CONTAINER("컨테이너"), NODE("노드"),
    BACKUP("백업"), UNKNOWN("알 수 없음");

    private final String displayName;
    // ... 생성자·getName() 생략 ...
}
```

```java
public enum TaskAction {
    START("시작"), STOP("정지"), SHUTDOWN("종료"), CLONE("복제"),
    MIGRATE("마이그레이션"), BACKUP("백업"), /* ... */ UNKNOWN("알 수 없음");

    private final String displayName;
    // ... 생성자·getName() 생략 ...
}
```

둘 다 영문 상수에 한글 표시명을 매단 단순한 구조다. `TaskType`이 이 둘을 참조해 (대상, 동작)을 표현한다.

### 접두사 휴리스틱이라는 대안 ─ ResourceType.fromTaskType

그런데 `ResourceType`에는 카탈로그와 **다른 방식**의 분류 메서드가 하나 더 있다. worker type을 접두사로 추정하는 휴리스틱(Heuristic)이다.

```java
// 접두사로 안 갈리는 노드/클러스터 레벨 작업 (정적 Set으로 호이스팅)
private static final Set<String> NODE_TASKS = Set.of("aptupdate", "startall", "stopall");

public static ResourceType fromTaskType(String taskType) {
    if (taskType == null || taskType.isBlank()) return UNKNOWN;

    // (1) 접두사로 구분 안 되는 예외부터 — 순서가 함정!
    //     vzdump은 'vz'로 시작하지만 컨테이너가 아니라 백업이다.
    if (taskType.equals("vzdump"))     return BACKUP;
    if (NODE_TASKS.contains(taskType)) return NODE;

    // (2) 접두사로 구분되는 게스트 작업
    if (taskType.startsWith("qm")) return VM;
    if (taskType.startsWith("vz")) return CONTAINER;

    // (3) 모르면 UNKNOWN
    return UNKNOWN;
}
```

이 휴리스틱의 발상은 영리하다. `qm`으로 시작하는 작업은 ─ `qmstart`든 `qmstop`이든 `qmsnapshot`이든 ─ **전부 VM이다.** 그러니 `qm` 접두사 규칙 한 줄이면 *현재와 미래의 모든 qm 작업*을 한 번에 덮는다. 일일이 등록할 필요가 없다.

여기서 **순서가 결정적 함정**이다. `vzdump`은 컨테이너 작업이 아니라 VM·컨테이너를 아우르는 통합 백업 도구인데, 하필 `vz`로 시작한다. 만약 `startsWith("vz")` 검사를 먼저 하면 `vzdump`이 컨테이너로 둔갑한다. 그래서 **`vzdump` 예외 검사를 `vz` 접두사 검사보다 반드시 위에** 둔다. 코드를 위에서 아래로 읽는 순서가 곧 우선순위라, 읽으면 의도가 그대로 드러나도록 배치했다(Locality of Behavior). `NODE_TASKS`를 `static final Set`으로 빼둔 것도 같은 맥락이다 ─ 메서드 호출마다 Set을 새로 만들지 않도록 클래스 로딩 시 한 번만 구축한다.

<br/>

## 4. 카탈로그 vs 휴리스틱 ─ 왜 카탈로그를 택했나

여기서 자연스러운 의문이 든다. **분류 방식이 두 개(카탈로그 `TaskType` vs 휴리스틱 `ResourceType.fromTaskType`)인데, 실제로는 무엇을 쓰는가?** 5장에서 보겠지만 `CmpUtils`는 **카탈로그(`TaskType`)를 쓴다.** 휴리스틱 `fromTaskType`은 만들어 뒀지만 현재 주 경로에서 호출되지 않는, 일종의 대안·폴백 후보다. 왜 카탈로그를 채택했는지가 이 꼭지의 핵심 결정이다.

두 방식의 트레이드오프는 명확하다.

| | 카탈로그 (`TaskType`) | 휴리스틱 (`fromTaskType`) |
| --- | --- | --- |
| **정확성** | 높음. 각 타입의 대상·동작을 명시. | 낮음. 접두사로 추정, 예외 수동 처리. |
| **미등록 내성** | 낮음. 없는 타입은 UNKNOWN. | 높음. 접두사만 맞으면 추정 가능. |
| **뽑아낼 수 있는 정보** | 대상 **+ 동작** 둘 다. | 대상 **만**. |

마지막 행이 승부를 갈랐다. **화면에 보여줄 표시 문구(`displayTitle`)를 만들려면 대상과 동작이 *둘 다* 필요하다** ─ "VM 시작"은 대상(VM)과 동작(시작)의 조합이다. 그런데 접두사 휴리스틱은 동작을 못 뽑는다. `qm` 접두사로 "VM이다"까지는 알아도, 그게 `start`인지 `stop`인지 `snapshot`인지는 접두사만으론 알 수 없다. 동작을 알려면 결국 worker type 전체를 카탈로그와 대조해야 한다. 그래서 표시명 조합이 목적인 이 시스템에서는 **카탈로그가 필수**이고, 휴리스틱은 "대상만 급히 필요할 때의 폴백" 정도로 남았다.

이 선택의 흔적이 `TaskAction`에도 남아 있다. 처음엔 각 enum이 자기 키워드로 worker type을 자가 매칭하려는 시도가 있었다(주석으로 남은 폐기된 메서드).

```java
// (폐기됨) 각 TaskAction이 자기 keyword를 포함하는지로 매칭하려던 방식
// public static TaskAction fromTaskType(String taskType) {
//     for (TaskAction action : values()) {
//         if (!action.keyword.isEmpty() && taskType.contains(action.keyword)) return action;
//     }
//     return UNKNOWN;
// }
```

이 `contains` 방식은 위험하다. `"qmreboot"`에 `"reboot"`가 들어 있지만 `"reset"`과 `"start"`의 부분 문자열 충돌, 혹은 `"stopall"`에 `"stop"`이 포함되는 식의 오매칭이 생긴다. "분류 지식을 각 원자 enum에 흩뿌리는" 이 방식은 부정확하고 단방향 의존 원칙(2-2)과도 어긋나서 폐기됐고, **분류 지식을 `TaskType` 카탈로그 한 곳으로 중앙화**하는 현재 구조로 수렴했다.

<br/>

## 5. 조립 ─ CmpUtils

마지막으로, 번역된 조각들을 합쳐 최종 화면용 DTO를 만드는 조립기다.

```java
public class CmpUtils {

    private CmpUtils() {                 // 유틸리티 클래스는 인스턴스화 방지
        throw new IllegalStateException("Utility class");
    }

    public static CmpTaskHistoryDto parseToCmpTask(ProxmoxTaskDto raw) {
        // 1) 카탈로그로 번역: 문자열 → TaskType → (대상, 동작)
        TaskType taskType        = TaskType.from(raw.type());
        ResourceType resourceType = taskType.resourceType();
        TaskAction taskAction     = taskType.action();

        // 2) 표시 대상 결정: VMID 있으면 그걸, 없으면 노드명 (노드 레벨 작업 대비)
        String targetName = (raw.id() != null && !raw.id().isEmpty()) ? raw.id() : raw.node();

        // 3) 표시 문구 조합: "[VM 101] 시작"
        String displayTitle = String.format("[%s %s] %s",
                resourceType.getName(), targetName, taskAction.getName());

        // 4) 화면용 DTO로 빌드
        return new CmpTaskHistoryDto(
                raw.upid(), raw.node(), resourceType.name(), raw.id(),
                taskAction.name(), displayTitle, raw.status(), raw.starttime());
    }
}
```

흐름이 단순하다. `TaskType.from()`으로 번역하고(카탈로그 경로), 거기서 대상·동작을 뽑아, 표시 문구 `[VM 101] 시작`을 조합한 뒤 화면용 `CmpTaskHistoryDto`로 빌드한다. 이 DTO가 08의 프론트 드롭다운에 뿌려지던 그 `displayTitle`의 출처다.

두 가지 작은 디테일을 짚는다. 첫째, **유틸리티 클래스의 인스턴스화를 막는다.** `private` 생성자에서 예외를 던져, 누가 `new CmpUtils()`를 시도하면 막는다(정적 메서드만 쓰는 클래스라 인스턴스가 무의미하다). 둘째, **표시 대상을 VMID 우선으로 정하되 노드명으로 폴백**한다 ─ VM·컨테이너 작업은 VMID가 있지만, `aptupdate` 같은 노드 레벨 작업은 VMID가 없으니 노드명을 대신 보여준다.

<br/>

## 마무리

09에서 만든 번역 계층을 정리한다.

- **안티-부패 계층(ACL)** ─ PVE의 날것 worker type을 CMP 도메인 언어로 옮겨, 외부 어휘가 도메인을 오염시키지 않게 경계에서 번역.
- **중앙 카탈로그(`TaskType`)** ─ worker type ↔ (대상, 동작)을 잇는 단일 진실 공급원. **단방향 의존**으로 enum 초기화 사고를 막고, **정적 Map 캐싱**으로 O(1) 조회, **UNKNOWN + UPID 원본 보존**으로 우아한 성능 저하, 그리고 `qmigrate`·`move_volume` 같은 함정은 `task_desc_table`로 확인.
- **카탈로그 vs 휴리스틱** ─ 표시 문구엔 동작까지 필요한데 접두사 휴리스틱은 대상만 뽑으므로 카탈로그를 채택. `contains` 자가 매칭의 오매칭 위험 때문에 분류 지식을 한 곳으로 중앙화한 진화.
- **조립(`CmpUtils`)** ─ 번역 조각을 합쳐 `displayTitle`을 만들고 화면용 DTO로 빌드.

다음 [10. TaskMonitor](#) 꼭지에서는, 08에서 예고한 그 사각지대를 정면으로 다룬다. VM 제어가 촉발하는 백그라운드 작업 감시(`@Async`)가 ─ 07에서 완성한 인증 사슬이 `ThreadLocal` 경계에서 끊기는 탓에 ─ 어떻게 PVE 호출에 실패하고, `DelegatingSecurityContextAsyncTaskExecutor`로 그걸 어떻게 잇는지를 본다. 이번 꼭지에서 만든 `TaskType`이 거기서 작업 결과(`TaskOutcome`)를 분류하는 데 다시 쓰인다.
