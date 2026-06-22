---
title: "12. 도메인 RestClient 확장(미완) ─ 패턴의 재사용과 남은 것"
date: 2026-06-16
lastmod: 2026-06-16
author: "Davi"
description: "시리즈를 닫는 꼭지. 05~11에서 깔아둔 토대 위에 VM 복제·삭제·템플릿, 네트워크 2단계 커밋, 스토리지 동적 스키마를 얹는다. 완성된 해설이 아니라 패턴이 어떻게 재사용되는지와 무엇이 미완으로 남았는지를 정직하게 정리하고, 전체 시리즈를 회고한다."
slug: domain-restclient-extension
section: "notes"
category: "linux/proxmox-ver2"
tags: []
order: 12
series: "Proxmox 실습 v2."
series_order: 12
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: ""
---


## 들어가며

[05번](./05-rest-client-config.md)부터 [11번](./11-exception-handling-packaging.md)까지, 토대·인증·기능·번역·비동기 감시·공통화로 백엔드의 골격을 다 세웠다. 이 마지막 문서(12)는 그 골격 *위에 올라타는* 나머지 도메인 기능들 ─ VM 복제·삭제·템플릿, 네트워크 인터페이스, 스토리지 ─ 을 다룬다.

다만 솔직히 밝힌다. **이 영역은 미완(未完)이다.** 그래서 이 꼭지는 다른 꼭지들처럼 "완성된 코드를 해설"하는 글이 아니다. 대신 두 가지를 한다.

1. **패턴의 재사용** ─ 앞에서 깔아둔 골격(form-urlencoded 조립, `ProxmoxResponse` 래핑, enum 검증, `TaskMonitor` 연동)이 새 도메인에 어떻게 그대로 적용되는지.
2. **남은 것의 정직한 목록** ─ 미완으로 남은 버그·스텁·리팩터 지점을 숨기지 않고 짚는다.

미완을 정직하게 드러내는 것 자체가 학습 문서의 값어치라고 본다. "여기까지 했고, 무엇이 왜 남았는가"를 기록하는 것이, 매끈하게 포장해 완성된 척하는 것보다 다음 사람(과 미래의 나)에게 쓸모 있다.

<br/>

## 1. 깔아둔 패턴의 재사용

새 도메인 기능을 추가할 때 매번 처음부터 짜지 않는다. 앞 꼭지들이 깔아둔 네 가지가 그대로 재사용된다.

- **form-urlencoded 조립** ─ `StringBuilder`에 `key=value&...`를 잇고 값은 `TypeUtil.encodeUTF_8`로 인코딩([05번 3-3](./05-rest-client-config.md)). VM 복제, 네트워크 생성, 스토리지 마운트 모두 이 패턴.
- **`ProxmoxResponse<T>` 래핑** ─ `ParameterizedTypeReference`로 `{"data": ...}`를 벗기는 조회([05번 3-1·3-2](./05-rest-client-config.md)). 모든 목록 조회가 동일.
- **enum 검증·번역** ─ 입력값을 PVE가 이해하는 형태로 변환하는 enum([09번](./09-domain-translation-enum.md)). 복제의 `CloneType`이 그 예.
- **`TaskMonitor` 연동** ─ 비동기 작업의 UPID를 받아 백그라운드 감시로 넘기는 흐름([10번](./10-task-monitor.md)). 시간이 걸리는 작업(복제, 네트워크 적용)에 붙는다.

그래서 새 도메인은 "이 골격에 PVE 엔드포인트만 갈아 끼우는" 작업에 가깝다. 아래에서 도메인별로 본다.

<br/>

## 2. VM 확장 ─ 복제·삭제·템플릿

[08번](./08-mvc-vm-task-log.md)에서 VM 실행·종료만 다루고 미뤘던 나머지 제어다.

### 2-1. 복제 ─ CloneType enum 검증

VM 복제는 폼 데이터를 조립해 PVE에 보내는데, "완전 복제(full)/연결 복제(linked)" 선택을 enum으로 검증한다.

```java
/* VM Clone */
public String cloneVm(String node, int vmid, ProxmoxVmCloneDto dto) {
    String uri = String.format("/nodes/%s/qemu/%d/clone", node, vmid);
    StringBuilder formData = new StringBuilder();

    formData.append("newid=").append(dto.newVmid());
    if (StringUtils.hasText(dto.name())) {
        formData.append("&name=").append(TypeUtil.encodeUTF_8(dto.name()));
    }
    formData.append("&full=").append(CloneType.verify(dto.isFull()));   // Boolean → 1/0

    return restClient.post()
            .uri(uri)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(formData.toString())
            .retrieve()
            .body(String.class);   // UPID 파싱 위해 원시 문자열 반환
}
```

`CloneType.verify`가 [09번](./09-domain-translation-enum.md)의 enum 검증 패턴이다. 프론트의 `Boolean`(체크박스)을 PVE가 요구하는 정수 플래그(`1`/`0`)로 안전하게 변환한다.

```java
public enum CloneType {
    VM_FULL_CLONE  ("full-clone",   "완전한 복제", 1),
    VM_LINKED_CLONE("linked-clone", "링크된 복제", 0),
    UNKNOWN        ("unknown",      "알 수 없음",  1);   // 기본은 안전하게 full
    // ...
    public static Integer verify(Boolean isFull) {
        if (isFull == null) return UNKNOWN.getBinary();
        return Boolean.TRUE.equals(isFull) ? VM_FULL_CLONE.getBinary() : VM_LINKED_CLONE.getBinary();
    }
}
```

`isFull`이 `null`이면 `UNKNOWN`을 거쳐 *완전 복제(1)*로 떨어지게 한 게 의도다 ─ 연결 복제(linked)는 원본에 의존하므로, 의도가 불분명할 땐 더 안전한 완전 복제로 기본값을 잡는다.

### 2-2. 삭제 ─ footgun 플래그

VM 삭제는 위험한 옵션 둘을 쿼리 파라미터로 받는다.

```java
/* VM Destroy */
public String deleteVm(String node, int vmid, ProxmoxVmDestroyDto dto) {
    String uri = String.format("/nodes/%s/qemu/%d?purge=%d&destroy-unreferenced-disks=%d",
            node, vmid,
            Boolean.TRUE.equals(dto.purge()) ? 1 : 0,
            Boolean.TRUE.equals(dto.destroyUnreferencedDisk()) ? 1 : 0);
    return restClient.delete().uri(uri).retrieve().body(String.class);
}
```

`purge`는 백업·복제 작업 기록까지 함께 지우고, `destroy-unreferenced-disks`는 설정에 참조되지 않은 디스크까지 삭제한다. 둘 다 **되돌릴 수 없는 파괴적 작업**이다. 프론트에서 명시적 확인을 받아야 하는 footgun(스스로 발등 찍는 기능)이다. *논리적 추론: 이 위험한 플래그들은 안전 게이팅(경고+확인)이 필수인데, 현재 프론트는 체크박스 + `confirm` 정도라 더 강한 가드가 남은 과제다.*

### 2-3. 미완 ─ createTemplate의 동사 버그

여기 명백한 버그가 있다. 템플릿 전환은 PVE에서 **POST** `/nodes/{node}/qemu/{vmid}/template`인데, 현재 코드는 `restClient.delete()`로 잘못된 엔드포인트를 호출한다.

```java
/* Create Template */
public String createTemplate(String node, int vmid, String disk) {
    String uri = String.format("/nodes/%s/qemu/%d?disk=%s", node, vmid, disk);
    return restClient.delete()   // ★ 버그: 템플릿 전환은 POST /.../template 이어야 함
            .uri(uri)
            .retrieve()
            .body(String.class);
}
```

복사-수정 과정에서 `deleteVm`의 골격을 가져다 HTTP 메서드와 경로를 안 고친 흔적으로 보인다. POST와 올바른 `/template` 경로로 바로잡아야 한다. 그리고 VM 설정 조회(`getVmConfig`)는 아직 `return null` 스텁(stub)이다 ─ 컨트롤러 라우트는 있지만 서비스가 빈 껍데기다. 둘 다 미완 목록(6장)에 올린다.

> 덧붙여, `VmController`의 복제·삭제도 [08번 3-2](./08-mvc-vm-task-log.md)에서 지적한 **UPID 문자열 `replace` 누더기**를 그대로 쓴다. `ProxmoxResponse<String>`로 받는 개선이 여기도 동일하게 적용돼야 한다.

<br/>

## 3. Network ─ 2단계 커밋 모델

네트워크는 이 확장 영역에서 **가장 까다롭고 가장 깊은** 부분이다. VM·스토리지와 근본적으로 다른 두 성질을 가진다.

### 3-1. 왜 노드 스코프인가

[08번](./08-mvc-vm-task-log.md)에서 VM 목록을 `/cluster/resources` 단일 호출로 바꾸며 `node`를 전역 상태에서 강등했다. 그런데 **네트워크는 그 데이터센터-플랫이 통하지 않는다.** 목록도 작업도 모두 노드별(`/nodes/{node}/network`)이다. 그래서 노드 선택자(드롭다운)가 다시 필요하다.

오해하면 안 되는 게, 이건 [08번](./08-mvc-vm-task-log.md)에서 죽인 `targetNode`의 부활이 아니다. VM은 *배치(placement)* 라 어느 노드에 있든 자동 라우팅하는 게 맞았지만, **네트워크 인터페이스는 *진짜로* 노드에 종속된 자원**이라 "어느 노드의 네트워크를 보겠다"를 사용자가 명시적으로 고르는 게 정당하다. 같은 "노드 선택"이라도 성격이 다르다. 노드 드롭다운은 이미 있는 `GET /api/proxmox/nodes`를 재활용한다.

### 3-2. 스테이징하고, 적용하거나 되돌린다

핵심 함정은 **네트워크 변경이 즉시 적용되지 않는다**는 점이다. 잘못된 네트워크 설정은 노드를 접속 불능으로 만들 수 있어서, PVE는 변경을 임시 파일 `/etc/network/interfaces.new`에 **스테이징(staging)** 만 하고 적용 전 검증을 거치게 한다. 그래서 네트워크 API는 단일 CRUD가 아니라 **2단계 커밋(staged commit)** 이다.

```java
/* Create Iface — 스테이징만 (아직 적용 안 됨) */
public void createIface(String node, ProxmoxNetworkIfaceRequestDto dto) {
    String uri = String.format("/nodes/%s/network", node);
    StringBuilder formData = new StringBuilder();
    formData.append("iface=").append(TypeUtil.encodeUTF_8(dto.iface()))
            .append("&type=").append(dto.type());
    appendConfig(formData, dto.config());
    restClient.post().uri(uri)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(formData.toString()).retrieve().toBodilessEntity();
}

/* Apply — 스테이징된 변경을 실제 적용 (ifreload), UPID task 반환 */
public String applyNetwork(String node) {
    String uri = String.format("/nodes/%s/network", node);
    ParameterizedTypeReference<ProxmoxResponse<String>> responseType
            = new ParameterizedTypeReference<>() {};
    ProxmoxResponse<String> response = restClient.put().uri(uri)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .retrieve().body(responseType);
    return response != null ? response.data() : null;   // UPID
}

/* Revert — interfaces.new 폐기 (스테이징 통째 취소) */
public void revertNetwork(String node) {
    String uri = String.format("/nodes/%s/network", node);
    restClient.put().uri(uri).retrieve().toBodilessEntity();
}
```

흐름이 셋이다. **스테이징**(생성/수정/삭제 → `interfaces.new`에 쌓기만), **적용**(`PUT /nodes/{node}/network` → `ifreload`, UPID task 반환), **되돌리기**(`DELETE /nodes/{node}/network` → `interfaces.new` 폐기). 그래서 컨트롤러의 응답 메시지가 "인터페이스 추가 **(적용 전)**" 같은 식으로 *아직 안 먹었음*을 알린다.

그리고 **비동기는 적용(`applyNetwork`)에만** 붙는다. 스테이징은 즉시 끝나지만, 실제 `ifreload`는 시간이 걸리고 UPID를 반환하므로 [10번](./10-task-monitor.md)의 `TaskMonitor`로 넘긴다.

```java
/* Apply Network Settings — UPID를 받아 백그라운드 감시로 */
@PutMapping("/nodes/{node}/network")
public ResponseEntity<Map<String, String>> applyNetwork(@PathVariable String node) {
    String upid = service.applyNetwork(node);
    if (upid != null) monitor.traceTaskStatus(node, upid);   // 10번 연동
    return ResponseEntity.ok(Map.of("message", "네트워크 설정 적용(reload) 시작됨",
            "upid", upid != null ? upid : ""));
}
```

### 3-3. delete 파라미터로 필드 삭제

수정(`modifyIface`)엔 PVE 특유의 관용구가 있다. **필드를 *지우려면* 값을 비우는 게 아니라, `delete=key1,key2` 파라미터로 키를 명시**해야 한다.

```java
/* Modify Iface */
public void modifyIface(String node, String iface, ProxmoxNetworkIfaceRequestDto dto) {
    StringBuilder formData = new StringBuilder();
    formData.append("type=").append(dto.type());   // PVE PUT은 type을 요구
    appendConfig(formData, dto.config());

    // 필드를 지우려면 delete 파라미터로 키를 넘긴다 (값 비워선 안 지워짐)
    if (dto.delete() != null && !dto.delete().isEmpty()) {
        formData.append("&delete=").append(String.join(",", dto.delete()));
    }
    // ...
}
```

이걸 모르면 "값을 비웠는데 안 지워지네" 하고 헤맨다. PVE의 unset은 빈 값 전송이 아니라 별도의 `delete` 메커니즘이다.

### 3-4. 안전 게이팅 ─ 더 치명적인 footgun

2-2의 VM 삭제가 footgun이라면, **네트워크는 그 footgun의 더 치명적인 버전**이다. 관리 인터페이스(`vmbr0`)를 잘못 건드리면 노드 자체의 접속이 끊긴다 ─ VM 하나를 잃는 게 아니라 노드를 통째로 잃는다. 그래서 적용(apply)과 인터페이스 삭제엔 "관리 인터페이스를 잘못 건드리면 이 노드 접속이 끊깁니다" 경고와 확인이 타협 불가의 필수다. *이 안전 게이팅과, "적용 안 된 변경 N건 [적용][되돌리기]" 같은 pending 배너는 현재 프론트에 미구현이라 남은 과제다.*

### 3-5. 미완 ─ 오타 둘

네트워크 코드엔 조용한 오타 두 개가 있다.

- **`modifyIface`의 Content-Type 오타** ─ `"application/x-www-form-urlenocded"`. `urlencoded`의 철자가 틀렸다(`enco**c**ded`). 이러면 PVE가 폼 데이터를 못 알아들어 수정이 실패할 수 있다.
- **`ProxmoxNetworkIfaceDto`의 `@JsonProperty` 오타** ─ `@JsonProperty("ove_tags")`. OVS 태그 필드라 `ovs_tags`여야 하는데 `s`가 빠졌다. 이 필드의 매핑이 깨진다.

둘 다 컴파일은 통과하지만 런타임에 조용히 어긋나는 종류라, 미완 목록에 명시한다.

<br/>

## 4. Storage ─ 동적 스키마 폼

스토리지는 타입(NFS/LVM-Thin/Ceph RBD…)마다 필요한 필드가 달라서, **타입별 스키마를 프론트에 두고 폼을 동적으로 그린다.**

```javascript
const STORAGE_TYPE_SCHEMA = {
    nfs: {
        label: 'NFS',
        fields: [
            { key: 'server', label: 'NFS ServerIP', placeholder: '예: 192.168.10.50' },
            { key: 'export', label: 'Export Path',  placeholder: '예: /srv/volume1/nfs' },
        ],
    },
    lvmthin: { label: 'LVM-Thin', fields: [ /* vgname, thinpool */ ] },
    rbd:     { label: 'Ceph RBD', fields: [ /* pool */ ] },
};
```

선택한 타입의 `fields`만큼 입력 칸이 그려지고, 그 값들은 `config` Map으로 묶여 백엔드로 간다. 백엔드(`createStorage`)는 공통 필드(`type`/`storage`/`content`) 뒤에 이 `config`를 `key=value`로 이어 붙인다([05번 3-3](./05-rest-client-config.md)의 form-urlencoded 패턴 그대로). 타입이 늘어도 스키마에 항목만 추가하면 되는 구조다.

> **미완** ─ `ProxmoxStorageDto`가 **두 패키지에 같은 이름으로 존재**한다. 생성용(`api.dto`, `type`/`storage`/`content`/`config`)과 조회용(`api.storage.dto`, `id`/`node`/`type`/`storage`/`content`/`disk`)이 이름만 같고 모양이 다르다. 혼란을 부르므로 이름을 갈라야 한다(예: `StorageCreateDto`/`StorageViewDto`). 또 생성 로직(`createStorage`)이 아직 분화 전 잔재인 `ProxmoxService`에 남아 있어([11번 5장](./11-exception-handling-packaging.md)에서 짚은 리패키징 대상), `api.storage`로 옮겨야 한다.

<br/>

## 5. 프론트 공통 ─ useModalForm과 일반화 자제

### 5-1. useModalForm ─ 공유 참조 버그 방지

복제·삭제·스토리지 모달이 공통으로 쓰는 컴포저블이다. 핵심은 **폼을 열 때마다 새 객체를 찍어낸다**는 점이다.

```javascript
function useModalForm(createForm) {
    const form = ref(createForm());
    const isOpen = ref(false);

    const open = (overrides = {}) => {
        form.value = { ...createForm(), ...overrides };   // 매번 새 객체
        isOpen.value = true;
    };
    const close = () => {
        form.value = createForm();   // 닫을 때도 새 객체로 리셋
        isOpen.value = false;
    };
    return { form, isOpen, open, close };
}
```

`createForm`을 *팩토리 함수*로 받아 `open`/`close` 때마다 호출하는 게 의도다. 만약 단일 객체를 만들어 재사용하면, 모달을 닫아도 이전 입력이 남거나 여러 모달이 같은 객체를 가리키는 **공유 참조 버그(shared object reference bug)** 가 난다. 특히 `config` 같은 중첩 객체는 얕은 복사로는 공유되므로, 팩토리가 *중첩 객체까지 새 인스턴스로* 찍어내야 한다. 폼 리셋 로직에서 흔히 데는 함정이라, 처음부터 팩토리 방식으로 막았다.

### 5-2. 일반화를 미루는 결정

세 패널(VM/네트워크/스토리지)이 "목록 테이블 + 생성/수정 모달 + 삭제 확인"이라는 골격을 공유한다. 그래서 `useCrudPanel`이나 `<ResourcePanel>` 같은 **공통 추상화로 묶고 싶은 유혹**이 강하게 든다. 하지만 의도적으로 미뤘다.

이유는 셋의 차이가 *작지 않기* 때문이다 ─ 스코프(VM은 데이터센터-플랫, 네트워크는 노드별), 커밋 모델(네트워크만 2단계), 위험도(네트워크가 압도적으로 치명적)가 제각각이다. 이 차이를 무시하고 섣불리 하나로 묶으면, 공통 추상화가 곧 `if (isNetwork)` 같은 분기로 누더기가 된다. **추상화가 중복을 줄이는 게 아니라 분기를 늘리는** 역효과다.

그래서 원칙은 **"세 패널을 다 명시적으로 짠 뒤, 진짜로 중복된 부분만 추출한다"** 이다. 빈 추상화 레이어를 미리 만들지 않는다. 이건 스코프 크리프(Scope Creep)를 막는 자기 규율이기도 하다 ─ 당장 필요하지 않은 일반화에 시간을 쏟느라 정작 기능을 못 끝내는 함정을 피하는 것이다.

<br/>

## 6. 남은 일 ─ 미완 목록

이 확장 영역에서 미완으로 남은 것들을 한자리에 모은다.

| 구분 | 위치 | 남은 일 |
| --- | --- | --- |
| 버그 | `VmService.createTemplate` | `delete()` → **POST `/.../template`** 으로 수정 |
| 버그 | `NetworkService.modifyIface` | Content-Type 오타 `urlenocded` → `urlencoded` |
| 버그 | `ProxmoxNetworkIfaceDto` | `@JsonProperty("ove_tags")` → `ovs_tags` |
| 스텁 | `VmService.getVmConfig` | `return null` ─ 실제 조회 구현 |
| 누더기 | `VmController` 복제·삭제 | UPID `replace` → `ProxmoxResponse<String>` ([08번](./08-mvc-vm-task-log.md)) |
| 설계 | `ProxmoxStorageDto` ×2 | 이름 충돌 분리 (`StorageCreateDto`/`StorageViewDto`) |
| 리패키징 | `ProxmoxService.createStorage` | `api.storage`로 이전, `infra.pve` 분리 ([11번](./11-exception-handling-packaging.md)) |
| 프론트 | 네트워크 패널 | pending/apply/revert 배너 미구현 |
| 프론트 | 삭제·네트워크 적용 | 안전 게이팅(경고+확인) 강화 |

대부분 "골격은 섰고 마감이 안 된" 상태다. 패턴이 자리 잡혀 있으니, 남은 건 기계적 수정과 마감에 가깝다.

<br/>

## 마무리 ─ 시리즈를 닫으며

12번까지 왔다. 이 시리즈가 걸어온 길을 한 번에 돌아본다.

- **[05](./05-rest-client-config.md) 토대** ─ RestClient를 고르고, JDK HttpClient·가상 스레드·자체 서명 인증서 위에 PVE 통신 계약(`ProxmoxResponse`·`ParameterizedTypeReference`·form-urlencoded)을 깔았다.
- **[06](./06-spring-security.md)·[07](./07-auth-login.md) 인증** ─ STATELESS 검문소를 세우고, JWT엔 `sid`만 담고 PVE 티켓은 서버 세션에 두는 이중 검증으로 즉시 무효화를 얻었다. 로그인은 realm 누락·`%25` 이중 인코딩을 뚫고 티켓을 받아 사슬을 발원시켰다.
- **[08](./08-mvc-vm-task-log.md) 첫 기능** ─ 3계층으로 VM·Task·Log를 구현하고 데이터센터-플랫으로 전환했다.
- **[09](./09-domain-translation-enum.md) 번역** ─ PVE 날것을 도메인 언어로 옮기는 안티-부패 계층을 enum 카탈로그로 세웠다.
- **[10](./10-task-monitor.md) 비동기 감시** ─ `@Async`가 끊은 인증 사슬을 `DelegatingSecurityContextAsyncTaskExecutor`로 잇고, `TaskOutcome`·포트 패턴으로 결과를 모델링했다.
- **[11](./11-exception-handling-packaging.md) 공통화** ─ 흩어진 예외를 ProblemDetail 표준으로 중앙화하고, 패키지를 기능별로 재편했다.
- **[12](./12-domain-restclient-extension.md) 확장(미완)** ─ 그 위에 VM 확장·네트워크 2단계 커밋·스토리지를 얹되, 남은 것을 정직하게 기록했다.

관통하는 한 가지가 있다면, **각 결정의 "왜"를 남기려 한 것**이다. 어떤 후보가 있었고, 무엇을 골랐고, 그 대가가 무엇이며, 무엇이 미완인가. 매끈한 완성품보다 그 과정의 기록이, 단일 노드 홈랩에서 PVE를 감싸 본 한 사람의 학습으로서 더 정직하다고 믿는다.

이 시리즈는 `notes/linux` 아래 임시로 두었지만, 본디 인프라 실습이 아니라 **백엔드·프론트 애플리케이션 구축기**에 가깝다. 차차 제 위치(예: 별도의 프로젝트/백엔드 섹션)로 재분류할 계획이다. 그건 다음 정리의 몫으로 남긴다.
