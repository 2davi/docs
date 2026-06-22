---
title: "08. 첫 MVC 슬라이스 ─ VM 제어와 Task·Log, 그리고 대시보드"
date: 2026-06-16
lastmod: 2026-06-16
author: "Davi"
description: "인증 위에 올라타는 첫 기능. Controller→Service→RestClient 3계층으로 VM 목록·실행·종료와 Task·Log 조회를 구현하고, Vue 대시보드로 정렬 테이블과 로그 폴링을 붙인다. /cluster/resources 데이터센터-플랫 전환, UPID 파싱 누더기, 폴링 타이머 누수 같은 결정·버그를 함께 짚는다."
slug: mvc-vm-task-log
section: "notes"
category: "linux/proxmox-ver2"
tags: []
order: 8
series: "Proxmox 실습 v2."
series_order: 8
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


로그인한 사용자가 PVE를 안전하게 호출할 수 있는 길이 뚫렸으니, 이제 그 길 위로 **첫 기능**을 흘려보낸다. 이 문서(08)가 다루는 슬라이스는 셋이다.

- **VM 목록·실행·종료** ─ 데이터센터의 VM을 한눈에 보고, 켜고 끄는 것.
- **Task 목록** ─ PVE에서 벌어진 작업(start/stop 등)의 이력 조회.
- **Log 추적** ─ 특정 작업의 진행 로그를 실시간에 가깝게 폴링.

그리고 이 셋을 보여주는 **Vue 대시보드 프론트엔드**까지 붙인다.

> 범위를 분명히 해둔다. VM의 **복제(clone)·삭제(destroy)·템플릿 전환**과 스토리지·네트워크 같은 나머지 기능은 [12. 도메인 RestClient 확장](#) 꼭지로 미룬다. 08은 "MVC 한 슬라이스가 어떤 모양으로 도는가"의 골격을 세우는 데 집중한다. 그래서 깊이보다 흐름이 우선이다.

<br/>

## 1. 슬라이스의 모양 ─ Controller → Service → RestClient

이 프로젝트의 백엔드는 전형적인 3 Layer로 흐른다.

```markdown
[브라우저] → Controller (HTTP 입출력)
              → Service (PVE 호출 로직)
                → RestClient (05에서 만든 PVE 통신 인프라)
                  → [Proxmox VE]
```

원칙은 단순하다. **컨트롤러는 얇게, 서비스가 일한다.** 컨트롤러는 HTTP 요청을 받아 경로 변수·바디를 꺼내고, 서비스를 호출하고, 결과를 HTTP 응답으로 포장하는 데까지만 책임진다. PVE를 실제로 호출하고 응답을 가공하는 건 서비스의 몫이다. VM 컨트롤러의 목록 조회가 이 분업을 잘 보여준다.

```java
@RestController
@RequestMapping("/api/proxmox")
public class VmController {
    private final VmService service;
    private final TaskMonitor monitor;
    // ... 생성자 생략 ...

    /* VM List */
    @GetMapping("/cluster/qemu")
    public ResponseEntity<List<ProxmoxVmDto>> getVmList() {
        return ResponseEntity.ok(service.getVmList());   // 일은 서비스에 위임
    }
}
```

컨트롤러는 `service.getVmList()`를 부르고 그 결과를 200 응답으로 감쌀 뿐이다. 한 줄이다.

<br/>

## 2. VM 목록 ─ /cluster/resources 단일 호출

VM 목록을 가져오는 서비스 메서드엔 **버려진 옛 버전과 현재 버전이 나란히** 남아 있다. 이 둘의 차이가 곧 하나의 설계 결정이 될 수 있다.

```java
/* VM List */
@Deprecated
public List<ProxmoxVmDto> getVmList(String node) {           // 옛 버전: 노드별
    String uri = String.format("/nodes/%s/qemu", node);
    // ...
}

public List<ProxmoxVmDto> getVmList() {                      // 현재 버전: 데이터센터 전체
    String uri = "/cluster/resources?type=vm";
    ParameterizedTypeReference<ProxmoxResponse<List<ProxmoxVmDto>>> responseType
            = new ParameterizedTypeReference<>() {};
    ProxmoxResponse<List<ProxmoxVmDto>> response = restClient.get()
            .uri(uri)
            .retrieve()
            .body(responseType);
    return response != null && response.data() != null
            ? response.data() : Collections.emptyList();
}
```

처음엔 `/nodes/{node}/qemu`로 **노드를 하나 정해서** 그 노드의 VM만 가져왔다(`@Deprecated`가 붙은 버전). 그런데 이 방식은 노드가 여럿이면 노드 수만큼 호출해야 하고, 프런트가 "지금 어느 노드를 보는가"라는 전역 상태(`targetNode`)를 들고 있어야 했다.

현재 버전은 `/cluster/resources?type=vm` **단일 호출**로 데이터센터 전체의 VM을 한 번에 긁어온다. PVE가 클러스터 전역 리소스를 모아주는 엔드포인트라, 노드별로 쪼개 부를 필요가 없다. 이 전환으로 얻은 게 둘이다.

- **호출이 한 번으로 준다.** 노드가 늘어도 목록 조회는 여전히 한 번이다.
- **`node`가 전역 상태에서 VM의 속성으로 강등된다.** "지금 보는 노드"라는 모드가 사라지고, 각 VM이 자기가 올라탄 노드(`node` 필드)를 들고 다닌다. 그래서 제어 작업을 할 때 "그 VM의 `node`"로 라우팅하면 된다(3장에서 본다). 화면에도 `노드` 컬럼을 1급으로 띄운다.

> 부수 효과로 확장성도 싸진다. `node`가 1급 데이터라, 나중에 화면을 "데이터센터 → 노드 → 게스트" 트리 구조로 승급시키더라도 데이터 모델을 갈아엎을 필요가 없다. *논리적 추론: 단일 노드 환경에선 차이가 안 느껴지지만, 클러스터로 확장할 때 이 선택이 비용을 아낀다.*

응답을 담는 `ProxmoxVmDto`는 이렇다.

```java
public record ProxmoxVmDto(
        String vmid, String node, String name, String status,
        Double maxmem, Double cpus, Long uptime) {}
```

`node` 필드가 들어 있는 게 위 설계의 핵심이다. `/cluster/resources`가 각 VM의 현재 배치 노드를 함께 주므로, 이 값으로 제어 작업의 목적지를 정한다.

<br/>

## 3. VM 실행·종료 ─ 비동기 작업과 UPID

### 3-1. status/{status} 엔드포인트

VM을 켜고 끄는 건 PVE의 상태 변경 엔드포인트를 때리는 일이다.

```java
/* VM Control */
public String controlVmStatus(String node, int vmid, String action) {
    String uri = String.format("/nodes/%s/qemu/%d/status/%s", node, vmid, action);
    String response = restClient.post()
            .uri(uri)
            .header("Content-Length", "0")   // 빈 본문 POST
            .retrieve()
            .body(String.class);
    return response;
}
```

`action` 자리에 `start`·`shutdown`·`stop` 등이 들어가 `/nodes/{node}/qemu/{vmid}/status/start` 같은 경로가 된다. 본문 없는 POST라 `Content-Length: 0`을 명시한다.

여기서 PVE의 중요한 성질을 짚어야 한다. **VM 제어는 즉시 끝나는 동기 작업이 아니다.** VM을 켜라고 요청하면 PVE는 "작업을 접수했다"는 의미로 **UPID(Unique Process ID)** 라는 작업 식별자를 즉시 돌려준다. 실제 부팅은 백그라운드에서 진행되고, 우리는 그 UPID로 작업의 진행·완료를 따로 추적해야 한다. UPID는 이런 구조의 콜론 구분 문자열이다.

```bash
UPID:<node>:<pid>:<pstart>:<starttime>:<type>:<id>:<user>:
     └ 노드 └ PID  └ ...   └ 시작시각  └ 작업 └ 대상    └ 실행자
```

### 3-2. UPID 파싱이 누더기다

문제는 이 UPID를 컨트롤러에서 꺼내는 방식이다. 솔직히 누더기다.

```java
/* Controller ─ VM Control */
@PostMapping("/nodes/{node}/qemu/{vmid}/status/{status}")
public ResponseEntity<Map<String, String>> controlVm(
        @PathVariable String node, @PathVariable int vmid, @PathVariable String status) {

    String rawResponse = service.controlVmStatus(node, vmid, status);
    // ↓ 생짜 JSON 문자열을 replace로 뜯어낸다 (문제의 지점)
    String upid = rawResponse.replace("{\"data\":\"", "").replace("\"}", "").trim();

    String[] seg = upid.split(":");
    String type = seg.length > 5 ? seg[5] : "";   // UPID 6번째 = 작업 종류

    monitor.traceTaskStatus(node, upid);          // 백그라운드 추적 시작 (10장에서)
    return ResponseEntity.ok(Map.of(
            "message", TaskType.from(type).getDisplayName(),
            "upid", upid
    ));
}

/* Service ─ VM Control */
public String controlVmStatus(String node, int vmid, String action) {
    String uri = String.format("/nodes/%s/qemu/%d/status/%s", node, vmid, action);
    String response = restClient.post()
            .uri(uri)
            .header("Content-Length", "0")
            .retrieve()
            .body(String.class);

    return response;
}
```

`service.controlVmStatus`가 PVE 응답을 **생짜 JSON 문자열**(`{"data":"UPID:..."}`)로 반환하고, 컨트롤러가 그걸 `replace`로 `{"data":"`와 `"}`를 도려내 UPID만 추출한다. 동작은 한다.

그런데 **05에서 만든 `ProxmoxResponse<T>` 래퍼를 두고 생짜 문자열을 손으로 주무르고 있다.** 다른 조회들은 모두 `ParameterizedTypeReference`로 `{"data": ...}`를 깔끔하게 벗기는데, 유독 여기만 일관성이 깨졌다. 문자열 `replace`는 PVE 응답 포맷이 조금만 바뀌어도 깨지는 깨지기 쉬운(fragile) 코드다.

올바른 방향은 **서비스가 `String.class` 대신 `ProxmoxResponse<String>`로 받으면** 된다.

```java
// 개선안
ProxmoxResponse<String> res = restClient.post().uri(uri)
        .header("Content-Length", "0").retrieve()
        .body(new ParameterizedTypeReference<ProxmoxResponse<String>>() {});
return res.data();   // UPID가 바로 손에 들어온다 — replace 불필요
```

그러면 컨트롤러의 `replace` 줄이 필요 없어지고, UPID에서 작업 종류를 뽑는 `split(":")`만 남는다. *이 누더기는 "UPID만 빨리 빼면 된다"고 급히 짠 흔적이고, `ProxmoxResponse` 일관 적용으로 정리할 수 있다.*

<br/>

**수정 결과:**

```java
/* Controller ─ VM Control */
@PostMapping("/nodes/{node}/qemu/{vmid}/status/{status}")
public ResponseEntity<Map<String, String>> controlVm(
        @PathVariable String node
        , @PathVariable int vmid
        , @PathVariable String status) {
    String upid = service.controlVmStatus(node, vmid, status);
    String[] seg = upid.split(":");
    String type = seg.length > 5 ? seg[5] : "";
    
    monitor.traceTaskStatus(node, upid);
    return ResponseEntity.ok(Map.of(
            "message", TaskType.from(type).getDisplayName(),
            "upid", upid
    ));
}

/* Controller ─ VM Control */
public String controlVmStatus(String node, int vmid, String action) {
    String uri = String.format("/nodes/%s/qemu/%d/status/%s", node, vmid, action);
    
    ParameterizedTypeReference<ProxmoxResponse<String>> responseType =
            new ParameterizedTypeReference<>() {};
    
    ProxmoxResponse<String> response = restClient.post()
            .uri(uri)
            .header("Content-Length", "0")
            .retrieve()
            .body(responseType);
    
    String upid = response.data();

    return upid;
}
```

> 마지막 줄의 `monitor.traceTaskStatus(node, upid)`는 이 UPID를 받아 백그라운드에서 작업 완료를 감시하는 호출이다. 그 `TaskMonitor`가 어떻게 도는지 ─ 그리고 그게 `@Async`라서 07의 인증 사슬에 안 닿는 문제 ─ 는 [10. TaskMonitor](#) 꼭지의 주제다. 여기선 "제어 요청이 추적을 촉발한다"는 연결만 봐둔다. 그리고 `TaskType.from(type).getDisplayName()`으로 작업 종류를 사람이 읽는 문구로 바꾸는데, 그 enum 번역 계층은 다음 [09번](#) 꼭지에서 본격적으로 다룬다.

<br/>

## 4. Task 목록과 Log 추적

### 4-1. Task 목록 ─ /cluster/tasks

VM 목록과 같은 데이터센터-플랫 원칙으로, 작업 이력도 `/cluster/tasks`로 한 번에 가져온다.

```java
/* Task List (Datacenter scope) */
public List<CmpTaskHistoryDto> getTaskList() {
    ParameterizedTypeReference<ProxmoxResponse<List<ProxmoxTaskDto>>> responseType
            = new ParameterizedTypeReference<>() {};
    ProxmoxResponse<List<ProxmoxTaskDto>> response = restClient.get()
            .uri("/cluster/tasks")
            .retrieve()
            .body(responseType);

    if (response == null || response.data() == null) {
        return Collections.emptyList();
    }
    // PVE 원본 작업 → CMP 화면용으로 변환
    return response.data().stream()
            .map(CmpUtils::parseToCmpTask)
            .collect(Collectors.toList());
}
```

PVE API로 받은  `ProxmoxTaskDto`(원본)를 `CmpUtils.parseToCmpTask`로 `CmpTaskHistoryDto`(화면용)로 변환하고 있다. PVE의 RAW 데이터를 CMP 기준의 사람 친화적 표시명으로 바꾸는 변환인데 **(e.g., "qmstart" → "VM 시작"),** **그 변환의 알맹이 ─ `TaskType`·`ResourceType`·`TaskAction` enum 계층 ─ 는 [09번](#) 꼭지에서 통째로 다룬다.** 여기서는 "목록을 가져와 화면용으로 변환한다"는 흐름만 다룬다. 변환된 DTO는 이렇다.

```java
public record CmpTaskHistoryDto(
        String upid, String node,
        @JsonProperty("resource-type") String resourceType,  // VM, CT, NODE...
        String resourceId, String action,                    // START, STOP...
        String displayTitle,                                 // 프론트 표시용 문구
        String status, Long timestamp) {}
```

`displayTitle`이 프론트 드롭다운에 뿌릴 "예쁜 텍스트"다(예: `[VM 101] 시작`).

### 4-2. Log 추적 ─ 폴링의 토대

특정 작업의 로그는 UPID로 조회한다.

```java
/* Log Trace */
public List<ProxmoxTaskLogDto> getTaskLog(String node, String upid) {
    String uri = String.format("/nodes/%s/tasks/%s/log?limit=100000", node, upid);
    // ... ParameterizedTypeReference로 조회 ...
}
```

로그 한 줄은 줄 번호(`n`)와 텍스트(`t`)의 쌍이다.

```java
public record ProxmoxTaskLogDto(Integer n, String t) {}  // n=줄번호, t=로그텍스트
```

이 엔드포인트를 프런트가 2초마다 폴링해서 터미널처럼 로그가 흐르는 화면을 만든다(5장). Backend는 "현재까지의 로그 전체"를 줄 뿐이고, "끝났는지"를 판정하고 폴링을 멈추는 건 Frontend의 책임이다.

<br/>

## 5. Vue 대시보드 프론트엔드

Frontend는 Vue 3을 CDN으로 불러 단일 `app.js`로 구성했다. 빌드 도구 없이 빠르게 도는 대시보드다. 인증 관련 부분(로그인·토큰 영속화·axios 인터셉터)은 [07번](./07-auth-login.md)에서 이미 다뤘으니, 여기선 기능 화면에 집중한다.

### 5-1. VM 테이블과 정렬

VM 목록은 클릭으로 정렬 가능한 테이블이다. Vue의 [`computed`](https://vuejs.org/guide/essentials/computed.html)로 원본을 건드리지 않고 정렬된 사본을 만든다.

```javascript
const sortKey = ref('vmid');
const sortOrder = ref(1);

const sortBy = key => {
    if (sortKey.value === key) {
        sortOrder.value *= -1;        // 같은 컬럼 다시 누르면 오름/내림 토글
    } else {
        sortKey.value = key;
        sortOrder.value = 1;
    }
};

const sortedVmList = computed(() => {
    return [...vmList.value].sort((a, b) => {   // 원본 복사 후 정렬
        let valA = a[sortKey.value];
        let valB = b[sortKey.value];
        // ... null 가드 ...
        if (sortKey.value === 'vmid' || sortKey.value === 'uptime') {
            return (Number(valA) - Number(valB)) * sortOrder.value;  // 숫자 정렬
        }
        // ... 문자열 정렬 ...
    });
});
```

`[...vmList.value]`로 원본 배열을 복사한 뒤 정렬한다.

`sort()`는 배열을 제자리에서(in-place) 바꾸므로, 원본 `vmList`를 직접 정렬하면 반응형 데이터를 오염시킨다. 사본을 만들어 정렬하면 원본은 그대로 두고 화면 표시 순서만 바꿀 수 있다. `vmid`·`uptime`은 숫자로, 나머지는 문자열로 비교하도록 갈랐다.

VM 제어 버튼은 그 VM의 `node`로 라우팅한다.

```javascript
const controlVm = async (vm, action) => {
    if (!confirm(`${vm.vmid}번 VM을 ${action} 하시겠습니까?`)) return;
    // vm.node로 라우팅 — 전역 targetNode 없이 VM 자신의 노드 사용
    const response = await api.post(`/proxmox/nodes/${vm.node}/qemu/${vm.vmid}/status/${action}`);
    const newUpid = response.data.upid;
    if (newUpid) {
        targetUpid.value = newUpid;
        fetchTasks();
        startWatchingLogs();          // 제어 직후 로그 추적 자동 시작
    }
};
```

`vm.node`를 URL에 직접 넣는다. 제어가 성공하면 돌아온 UPID로 곧장 로그 추적을 시작해, 사용자가 작업 진행을 바로 볼 수 있게 한다.

### 5-2. Log 터미널 폴링

로그 화면은 2초 간격 폴링으로 갱신된다.

```javascript
const startWatchingLogs = () => {
    if (isPolling.value) return;          // 중복 시작 방지
    isPolling.value = true;
    taskLogs.value = [];                  // 화면 초기화
    fetchLogs();                          // 즉시 1회 실행
    logPollingTimer = setInterval(fetchLogs, 2000);  // 이후 2초마다
};

const fetchLogs = async () => {
    // ... 로그 조회 ...
    const node = nodeFromUpid(targetUpid.value);   // UPID 2번째 세그먼트에서 노드 추출
    const response = await api.get(`/proxmox/nodes/${node}/tasks/${targetUpid.value}/log`);
    taskLogs.value = response.data;

    await nextTick();                              // DOM 갱신 후
    if (logContainer.value) {
        logContainer.value.scrollTop = logContainer.value.scrollHeight;  // 맨 아래로 스크롤
    }

    // 로그 끝 감지: 마지막 줄이 'TASK '로 시작하면 작업 종료
    const lastLog = taskLogs.value[taskLogs.value.length - 1];
    if (lastLog && lastLog.t.startsWith('TASK ')) {
        stopWatchingLogs();
        setTimeout(() => { fetchVmList(); fetchTasks(); }, 1500);  // 잠시 후 목록 갱신
    }
};
```

두 가지가 깔끔하다. 첫째, `nextTick()`으로 DOM이 갱신된 뒤 스크롤을 맨 아래로 내려 새 로그가 항상 보이게 한다. 둘째, **작업 종료 판정을 로그 내용으로** 한다 ─ PVE는 작업이 끝나면 로그 마지막 줄에 `TASK OK`/`TASK ERROR` 같은 `TASK `로 시작하는 줄을 남기므로, 그걸 감지하면 폴링을 멈추고 잠시 뒤 VM·작업 목록을 새로고침한다. 작업 상태 필드를 따로 파싱하지 않고도 종료를 안다.

### 5-3. 폴링 타이머 누수 ─ 재로그인이 막힌다

여기 버그가 하나 숨어 있다. 타이머를 멈출 때 **`clearInterval`만 하고 변수를 `null`로 비우지 않는다.**

```javascript
let vmPollingTimer = null;

const startWatchingVmList = () => {
    if (vmPollingTimer) return;          // ← 타이머 변수가 차 있으면 시작 안 함
    vmPollingTimer = setInterval(fetchVmList, 10000);
};

const stopWatchingVmList = () => {
    if (vmPollingTimer) clearInterval(vmPollingTimer);   // ← 멈추지만 변수는 안 비움
};
```

문제의 메커니즘은 이렇다. `startWatchingVmList`는 `if (vmPollingTimer) return`으로 중복 시작을 막는데, `stopWatchingVmList`가 `clearInterval`만 하고 `vmPollingTimer`를 `null`로 안 만든다. 그러면 타이머는 멈췄어도 **변수엔 옛 타이머 ID가 그대로 남는다.** 이 상태에서 로그아웃 → 재로그인을 하면, `clearSession()`이 `stopWatchingVmList`를 부르지만 변수가 비워지지 않은 탓에, 재로그인 후 `startWatchingVmList`가 "이미 타이머가 있네"라고 오판하고 **VM 목록 자동 갱신을 다시 켜지 못한다.** 화면이 갱신을 멈춘 채로 남는 것이다.

고치는 건 한 줄이다.

```javascript
const stopWatchingVmList = () => {
    if (vmPollingTimer) {
        clearInterval(vmPollingTimer);
        vmPollingTimer = null;           // ← 멈춘 뒤 반드시 비운다
    }
};
```

타이머를 멈췄으면 변수도 `null`로 되돌려야, 다음 시작 가드가 정상 동작한다. **"타이머 ID 변수는 멈춤과 동시에 비운다"** 가 폴링 관리의 기본 규칙이다. 로그 폴링(`logPollingTimer`)도 같은 손질이 필요하다.

<br/>

## 마무리

08에서 만든 첫 슬라이스를 정리한다.

- **3계층 흐름** ─ 얇은 컨트롤러, 일하는 서비스, 05의 RestClient. VM 목록 한 줄짜리 컨트롤러가 그 분업을 보여준다.
- **데이터센터-플랫** ─ 노드별 조회(`@Deprecated`)를 `/cluster/resources`·`/cluster/tasks` 단일 호출로 전환, `node`를 VM 속성으로 강등해 제어를 자동 라우팅. 트리 승급 비용까지 낮춘 선택.
- **비동기 작업과 UPID** ─ VM 제어가 즉시 끝나지 않고 UPID를 돌려주는 성질, 그 UPID를 `replace`로 뜯는 누더기(와 `ProxmoxResponse<String>` 개선안), 로그 폴링과 `TASK ` 종료 감지.
- **프론트 결정·버그** ─ 원본을 복사해 정렬하는 `computed`, `nextTick` 스크롤, 그리고 **폴링 타이머를 `null`로 안 비워 재로그인이 막히는 버그**(와 한 줄 수정).

다음 [09. 도메인 번역 enum 계층](#) 꼭지에서는, 이번에 두 번이나 미뤄둔 것 ─ `qmstart` 같은 PVE 날것 문자열을 "VM 시작"으로 바꾸는 `TaskType`·`ResourceType`·`TaskAction`과 `CmpUtils` ─ 을 정면으로 다룬다. 작아 보이지만 접두사 파싱 예외 처리와 정적 맵 캐싱 같은 설계 디테일이 묵직한 계층이다.
