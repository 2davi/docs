---
title: "REST API ─ /nodes/{node}/qemu 엔드포인트"
date: 2026-04-16
lastmod: 2026-04-16
author: "Davi"
description: "."
slug: "rest-api-nodes-qemu"
section: "notes"
category: "proxmox/ref."
tags: [proxmox, rest-api, authentication, ticket, api-token, upid, task, curl, pvesh, cmp, qemu]
order: 6
series: "Proxmox VE 학습 시리즈"
#series_order: 0
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1"
---

> **Base URL:** `https://&lt;host>:8006/api2/json`  
> **참조 버전:** Proxmox VE 8.x / 9.x (공통 적용)  
> **pvesh 매핑:** `GET → pvesh get`, `POST → pvesh create`, `PUT → pvesh set`, `DELETE → pvesh delete`

---

## 1. 개요

Proxmox VE는 전체 관리 기능을 REST API로 노출하며, `/nodes/{node}/qemu` 하위 트리는 QEMU 기반 가상 머신(KVM VM)의 생명 주기 전반을 제어하는 가장 광범위한 엔드포인트 그룹입니다. 카테고리는 크게 **VM 목록/생성**, **전원 상태 제어**, **설정 관리**, **스냅샷**, **콘솔 접속**, **Guest Agent**, **방화벽**, **마이그레이션/클론**, **디스크 조작**, **Cloud-Init**, **통계** 으로 나뉩니다.

---

## 2. 위험도 기준

각 엔드포인트에 아래 위험도 등급을 적용합니다.

| 등급    | 설명                                                              |
| ------= | ----------------------------------------------------------------- |
| ✅ 안전 | GET — 읽기 전용, 시스템 변경 없음                                 |
| ⚠️ 주의 | 비파괴적 변경, 복구 가능 (설정 수정, 스냅샷 생성 등)              |
| 🔴 위험 | 즉시 서비스 영향 또는 복구 불가 (삭제, 강제 종료, 디스크 조작 등) |

---

## 3. VM 목록 및 생성

### `/nodes/{node}/qemu`

| 메서드 | 설명                                                                                                                             | 위험도 | 필수 파라미터  | pvesh 예시                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------- | ------------------------------------------------------------------ |
| `GET`  | 해당 노드의 VM 전체 목록 반환. `VM.Audit` 권한이 있는 VM만 표시                                                                  | ✅     | `node`         | `pvesh get /nodes/kcy0122/qemu`                                    |
| `POST` | 신규 VM 생성 또는 백업에서 복원. 필수: `vmid`, `node`. 선택: `name`, `memory`, `cores`, `net[n]`, `scsi[n]`, `ostype` 등 수십 개 | ⚠️     | `node`, `vmid` | `pvesh create /nodes/kcy0122/qemu -vmid 200 -memory 2048 -cores 2` |

**참고:** `POST` 생성 시 반환값은 `UPID` (Proxmox 내부 비동기 작업 ID) 문자열이며, 즉시 완료가 아닌 백그라운드 태스크로 처리됩니다.

---

## 4. VM 개별 조작

### `/nodes/{node}/qemu/{vmid}`

| 메서드   | 설명                                                                             | 위험도 | 주요 파라미터  |
| -------- | -------------------------------------------------------------------------------- | ------ | -------------- |
| `GET`    | VM 하위 디렉토리 인덱스 반환. 실제 데이터 없이 서브 경로 목록만 반환             | ✅     | `node`, `vmid` |
| `DELETE` | **VM 완전 삭제** + 연결된 모든 디스크 볼륨 삭제. `skiplock=1`은 root만 사용 가능 | 🔴     | `node`, `vmid` |

---

## 5. 전원 상태 제어

### `/nodes/{node}/qemu/{vmid}/status`

모든 하위 상태 조작 엔드포인트는 `VM.PowerMgmt` 권한을 요구합니다. 반환값은 비동기 작업의 `UPID` 문자열입니다.

| 엔드포인트         | 메서드 | 설명                                                                                                     | 위험도 | 주요 파라미터  |
| ------------------ | ------ | -------------------------------------------------------------------------------------------------------- | ------ | -------------- |
| `/status`          | `GET`  | 하위 경로 목록 반환                                                                                      | ✅     | `node`, `vmid` |
| `/status/current`  | `GET`  | VM 현재 상태 조회 (CPU/메모리 사용률, 실행 상태 등)                                                      | ✅     | `node`, `vmid` |
| `/status/start`    | `POST` | VM 시작. `machine` 파라미터로 QEMU 머신 타입 지정 가능                                                   | ⚠️     | `node`, `vmid` |
| `/status/stop`     | `POST` | **즉시 강제 종료** (전원 차단과 동일). OS 셧다운 과정 없음. `timeout` 옵션 존재                          | 🔴     | `node`, `vmid` |
| `/status/shutdown` | `POST` | **게스트 OS에 ACPI 셧다운 신호 전송**. `forceStop=1`로 타임아웃 초과 시 강제 종료. `timeout` 기본값 있음 | ⚠️     | `node`, `vmid` |
| `/status/reset`    | `POST` | **하드 리셋** (강제 재시작, 데이터 손실 가능)                                                            | 🔴     | `node`, `vmid` |
| `/status/suspend`  | `POST` | VM 일시 중지 (RAM 상태 유지, 디스크 미저장)                                                              | ⚠️     | `node`, `vmid` |
| `/status/resume`   | `POST` | 일시 중지된 VM 재개. `nocheck` 파라미터로 상태 검증 스킵 가능                                            | ⚠️     | `node`, `vmid` |

> **stop vs shutdown 차이:** `stop`은 즉시 전원 차단(데이터 손실 위험), `shutdown`은 OS에 종료 신호를 보내 정상 종료를 유도합니다. 운영 환경에서는 반드시 `shutdown`을 우선 사용하세요.

---

## 6. VM 설정 관리

### `/nodes/{node}/qemu/{vmid}/config`

| 메서드 | 설명                                                                     | 위험도 | 비고                                               |
| ------ | ------------------------------------------------------------------------ | ------ | -------------------------------------------------- |
| `GET`  | 현재 VM 설정 전체 조회 (CPU, 메모리, 디스크, 네트워크 등)                | ✅     | —                                                  |
| `PUT`  | 설정 **동기적 변경**. 변경 즉시 적용. `delete` 파라미터로 항목 제거 가능 | ⚠️     | 실행 중 VM에도 적용 가능하나 재시작 필요 항목 있음 |
| `POST` | 설정 **비동기적 변경**. UPID 반환 후 백그라운드 처리                     | ⚠️     | 대용량 설정 변경 시 권장                           |

**주요 설정 파라미터:**

| 파라미터     | 타입    | 설명                                                |
| ------------ | ------- | --------------------------------------------------- |
| `name`       | string  | VM 표시 이름                                        |
| `memory`     | integer | RAM (MB)                                            |
| `cores`      | integer | CPU 코어 수                                         |
| `sockets`    | integer | CPU 소켓 수                                         |
| `cpu`        | string  | 에뮬레이션 CPU 타입 (`host`, `kvm64` 등)            |
| `net[n]`     | string  | 네트워크 장치 (`virtio`, `e1000` 등 + MAC + bridge) |
| `scsi[n]`    | string  | SCSI 디스크 연결 (n: 0~13)                          |
| `virtio[n]`  | string  | VirtIO 디스크 (n: 0~15)                             |
| `ide[n]`     | string  | IDE 디스크 또는 CD-ROM (n: 0~3)                     |
| `ostype`     | string  | OS 타입 (`l26`, `win11`, `other` 등)                |
| `agent`      | boolean | QEMU Guest Agent 활성화 여부                        |
| `onboot`     | boolean | 노드 부팅 시 자동 시작                              |
| `protection` | boolean | 삭제 보호 플래그                                    |
| `args`       | string  | KVM 직접 인자 (root 전용)                           |

### `/nodes/{node}/qemu/{vmid}/pending`

| 메서드 | 설명                                                                                                          | 위험도 |
| ------ | ------------------------------------------------------------------------------------------------------------- | ------ |
| `GET`  | **현재 설정과 재시작 후 적용될 대기 중 설정의 차이**를 반환. 재시작 없이 적용되지 않은 변경 사항 확인 시 사용 | ✅     |

---

## 7. 스냅샷

### `/nodes/{node}/qemu/{vmid}/snapshot`

`VM.Snapshot` 권한 필요.

| 엔드포인트                      | 메서드   | 설명                                                            | 위험도 |
| ------------------------------- | -------- | --------------------------------------------------------------- | ------ |
| `/snapshot`                     | `GET`    | 전체 스냅샷 목록 조회                                           | ✅     |
| `/snapshot`                     | `POST`   | 스냅샷 생성. `snapname` 필수, `vmstate=1`로 RAM 상태 포함 가능  | ⚠️     |
| `/snapshot/{snapname}`          | `GET`    | 특정 스냅샷의 서브 디렉토리 인덱스                              | ✅     |
| `/snapshot/{snapname}`          | `DELETE` | 스냅샷 삭제. `force=1`로 디스크 스냅샷 삭제 실패 시 설정만 제거 | 🔴     |
| `/snapshot/{snapname}/config`   | `GET`    | 해당 스냅샷 시점의 VM 설정 조회                                 | ✅     |
| `/snapshot/{snapname}/config`   | `PUT`    | 스냅샷 메타데이터(설명) 수정                                    | ⚠️     |
| `/snapshot/{snapname}/rollback` | `POST`   | **스냅샷 시점으로 VM 상태 롤백**. 현재 상태는 소멸              | 🔴     |

---

## 8. 마이그레이션 및 클론

### `/nodes/{node}/qemu/{vmid}/migrate`

| 메서드 | 설명                                                                                | 위험도 | 주요 파라미터               |
| ------ | ----------------------------------------------------------------------------------- | ------ | --------------------------- |
| `POST` | VM을 다른 노드로 이동. `target` 필수. `online=1`로 실행 중 라이브 마이그레이션 가능 | ⚠️     | `target`, `online`, `force` |

### `/nodes/{node}/qemu/{vmid}/clone`

| 메서드 | 설명                                                                             | 위험도 | 주요 파라미터                                |
| ------ | -------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| `POST` | VM 클론 생성. `newid` 필수. `full=1`로 전체 복제(Linked Clone이 아닌 Full Clone) | ⚠️     | `newid`, `full`, `name`, `target`, `storage` |

### `/nodes/{node}/qemu/{vmid}/template`

| 메서드 | 설명                                                    | 위험도 |
| ------ | ------------------------------------------------------- | ------ |
| `POST` | **VM을 템플릿으로 변환**. 변환 후 일반 VM으로 복구 불가 | 🔴     |

---

## 9. 디스크 조작

### `/nodes/{node}/qemu/{vmid}/resize`

| 메서드 | 설명                                                                                      | 위험도 | 주요 파라미터                                        |
| ------ | ----------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------- |
| `PUT`  | 디스크 크기 조정. `disk`와 `size` 필수. `+10G` 형식으로 증량 가능. **디스크 축소는 불가** | ⚠️     | `disk` (예: `scsi0`), `size` (예: `+10G` 또는 `50G`) |

### `/nodes/{node}/qemu/{vmid}/move_disk`

| 메서드 | 설명                                                                      | 위험도 | 주요 파라미터               |
| ------ | ------------------------------------------------------------------------- | ------ | --------------------------- |
| `POST` | 디스크를 다른 스토리지 또는 다른 VM으로 이동/복사. `delete=1`로 원본 삭제 | ⚠️     | `disk`, `storage`, `delete` |

### `/nodes/{node}/qemu/{vmid}/unlink`

| 메서드 | 설명                                                                                | 위험도 | 주요 파라미터     |
| ------ | ----------------------------------------------------------------------------------- | ------ | ----------------- |
| `PUT`  | VM에서 디스크 연결 해제. `idlist`에 디스크 ID 목록 지정. `force=1`로 강제 삭제 가능 | 🔴     | `idlist`, `force` |

---

## 10. 콘솔 및 원격 접속

### VNC 콘솔 흐름

Proxmox VNC 콘솔 연결은 두 단계로 동작합니다:

1. `POST /vncproxy` → `ticket`과 `port` 반환
2. `GET /vncwebsocket?port={port}&vncticket={ticket}` → WebSocket 업그레이드

| 엔드포인트      | 메서드 | 설명                                                              | 위험도 |
| --------------- | ------ | ----------------------------------------------------------------- | ------ |
| `/vncproxy`     | `POST` | VNC 세션 티켓 및 포트 발급. `websocket=1`로 WebSocket 모드 활성화 | ⚠️     |
| `/vncwebsocket` | `GET`  | VNC WebSocket 연결 수립 (noVNC 등 클라이언트용)                   | ✅     |
| `/spiceproxy`   | `POST` | SPICE 프로토콜 프록시 티켓 발급 (고화질 콘솔용)                   | ⚠️     |
| `/termproxy`    | `POST` | 시리얼 콘솔 TCP 프록시 생성. `serial` 파라미터로 serial0~3 지정   | ⚠️     |

### `/nodes/{node}/qemu/{vmid}/monitor`

| 메서드 | 설명                                                                                                     | 위험도 |
| ------ | -------------------------------------------------------------------------------------------------------- | ------ |
| `POST` | QEMU 모니터 명령어 직접 전송 (예: `info status`, `screendump`). **root 전용, 잘못 사용 시 VM 중단 가능** | 🔴     |

### `/nodes/{node}/qemu/{vmid}/sendkey`

| 메서드 | 설명                                                                          | 위험도 |
| ------ | ----------------------------------------------------------------------------- | ------ |
| `PUT`  | VM 콘솔에 키 입력 이벤트 전송. QEMU 키 이름 형식 사용 (예: `ctrl-alt-delete`) | ⚠️     |

---

## 11. QEMU Guest Agent

Guest Agent 엔드포인트는 **VM 내부에 `qemu-guest-agent` 데몬이 설치·실행 중인 경우에만** 동작합니다. 미설치 시 503 또는 빈 응답을 반환합니다.

### `/nodes/{node}/qemu/{vmid}/agent`

| 엔드포인트                      | 메서드 | 설명                                                                        | 위험도 |
| ------------------------------- | ------ | --------------------------------------------------------------------------- | ------ |
| `/agent`                        | `GET`  | agent 하위 경로 인덱스                                                      | ✅     |
| `/agent/ping`                   | `POST` | Guest Agent 응답 확인                                                       | ✅     |
| `/agent/get-osinfo`             | `GET`  | 게스트 OS 정보 조회 (OS 이름, 버전, 커널 등)                                | ✅     |
| `/agent/get-host-name`          | `GET`  | 게스트 hostname 조회                                                        | ✅     |
| `/agent/get-time`               | `GET`  | 게스트 시간 조회                                                            | ✅     |
| `/agent/get-timezone`           | `GET`  | 게스트 타임존 정보                                                          | ✅     |
| `/agent/get-users`              | `GET`  | 현재 로그인된 게스트 사용자 목록                                            | ✅     |
| `/agent/network-get-interfaces` | `GET`  | 게스트 네트워크 인터페이스 및 IP 목록 조회. VM IP 확인에 가장 많이 사용됨   | ✅     |
| `/agent/get-vcpus`              | `GET`  | 게스트 vCPU 상태                                                            | ✅     |
| `/agent/get-memory-blocks`      | `GET`  | 게스트 메모리 블록 정보                                                     | ✅     |
| `/agent/get-memory-block-info`  | `GET`  | 메모리 블록 상세 정보                                                       | ✅     |
| `/agent/get-fsinfo`             | `GET`  | 게스트 파일시스템 마운트 정보                                               | ✅     |
| `/agent/exec`                   | `POST` | **게스트 내 명령어 실행**. 반환값은 `pid`. 결과는 `exec-status`로 별도 폴링 | ⚠️     |
| `/agent/exec-status`            | `GET`  | `exec`로 실행한 프로세스의 완료 여부 및 출력 결과 조회. `pid` 파라미터 필수 | ✅     |
| `/agent/file-read`              | `GET`  | 게스트 내 파일 내용 읽기                                                    | ⚠️     |
| `/agent/file-write`             | `POST` | 게스트 내 파일 쓰기                                                         | ⚠️     |
| `/agent/set-user-password`      | `POST` | 게스트 사용자 패스워드 변경                                                 | ⚠️     |
| `/agent/suspend-disk`           | `POST` | 게스트를 디스크 Suspend 상태로 전환                                         | 🔴     |
| `/agent/suspend-ram`            | `POST` | 게스트를 RAM Suspend 상태로 전환                                            | 🔴     |
| `/agent/suspend-hybrid`         | `POST` | 디스크+RAM 하이브리드 Suspend                                               | 🔴     |
| `/agent/shutdown`               | `POST` | Guest Agent를 통한 OS 정상 종료                                             | ⚠️     |
| `/agent/fstrim`                 | `POST` | 게스트 파일시스템 TRIM 실행 (SSD 최적화)                                    | ⚠️     |

#### `agent/exec` 사용 패턴

```bash
# 1단계: 명령 실행 → pid 반환
pvesh create /nodes/kcy0122/qemu/100/agent/exec -command '["hostname"]'

# 2단계: pid로 결과 폴링
pvesh get /nodes/kcy0122/qemu/100/agent/exec-status -pid &lt;PID>
```

PVE 8.x 이후 `command` 파라미터는 문자열이 아닌 **배열 형식**으로 변경되었습니다.

---

## 12. Cloud-Init

Cloud-Init 엔드포인트는 `ostype`이 Linux 계열이고 Cloud-Init 드라이브가 연결된 VM에서 의미가 있습니다.

| 엔드포인트        | 메서드 | 설명                                                                 | 위험도 |
| ----------------- | ------ | -------------------------------------------------------------------- | ------ |
| `/cloudinit`      | `PUT`  | Cloud-Init 설정 재생성(Regenerate). VM 재시작 없이 ISO 갱신          | ⚠️     |
| `/cloudinit/dump` | `GET`  | 현재 Cloud-Init 구성 내용 출력 (`user`, `network`, `meta` 타입 선택) | ✅     |

---

## 13. 통계 및 성능 데이터

| 엔드포인트 | 메서드 | 설명                                                                             | 위험도 | 주요 파라미터           |
| ---------- | ------ | -------------------------------------------------------------------------------- | ------ | ----------------------- |
| `/rrd`     | `GET`  | VM 성능 통계를 PNG 이미지로 반환 (레거시). `ds`, `timeframe`, `cf` 파라미터 필요 | ✅     | `ds`, `timeframe`, `cf` |
| `/rrddata` | `GET`  | VM 성능 통계를 JSON 데이터로 반환 (자동화 권장). `timeframe` 필수                | ✅     | `timeframe`, `cf`       |
| `/feature` | `GET`  | VM이 특정 기능(스냅샷 등)을 지원하는지 여부 확인                                 | ✅     | `feature`               |

---

## 14. 방화벽

VM별 방화벽은 `/nodes/{node}/qemu/{vmid}/firewall` 하위에 계층적으로 구성됩니다. 설정 변경에는 `VM.Config.Network` 권한, 조회에는 `VM.Audit` 권한이 필요합니다.

| 엔드포인트                      | 설명                                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| `/firewall/rules`               | 방화벽 규칙 목록 조회(GET) / 신규 규칙 생성(POST)                     |
| `/firewall/rules/{pos}`         | 특정 위치의 규칙 조회(GET) / 수정(PUT) / 삭제(DELETE)                 |
| `/firewall/aliases`             | IP/네트워크 별칭 관리 (CRUD)                                          |
| `/firewall/ipset`               | IP Set 목록 관리 (CRUD)                                               |
| `/firewall/ipset/{name}/{cidr}` | 특정 IP Set 내 항목 관리                                              |
| `/firewall/options`             | 방화벽 전역 옵션 조회(GET) / 수정(PUT) (DHCP, MAC 필터, 기본 정책 등) |
| `/firewall/log`                 | VM 방화벽 로그 조회. `start`, `limit` 파라미터로 페이징 가능          |
| `/firewall/refs`                | IPSet/Alias 참조 목록 조회 (규칙 source/dest에 사용 가능한 이름 목록) |

---

## 15. 카테고리별 요약 및 실무 활용 지침

### 읽기 전용 — 자동화 스크립트 안전 사용 가능

| 목적                        | 권장 엔드포인트                     |
| --------------------------- | ----------------------------------- |
| VM 실행 상태 모니터링       | `GET /status/current`               |
| VM 설정 조회                | `GET /config`                       |
| 스냅샷 목록 확인            | `GET /snapshot`                     |
| 게스트 IP 확인 (Agent 필요) | `GET /agent/network-get-interfaces` |
| 성능 데이터 수집            | `GET /rrddata`                      |
| 대기 중 설정 변경 확인      | `GET /pending`                      |

### 주의 필요 — 검증 후 사용

| 목적        | 엔드포인트              | 주의사항                             |
| ----------- | ----------------------- | ------------------------------------ |
| VM 시작     | `POST /status/start`    | 이미 실행 중이면 에러                |
| 정상 종료   | `POST /status/shutdown` | 타임아웃 설정 권장                   |
| 설정 변경   | `PUT /config`           | hotplug 불가 항목은 재시작 필요      |
| 스냅샷 생성 | `POST /snapshot`        | `vmstate=1` 시 RAM 포함으로 느림     |
| 클론        | `POST /clone`           | `full=1` 시 스토리지 용량 주의       |
| 디스크 확장 | `PUT /resize`           | 축소 불가, 파일시스템 별도 확장 필요 |

### 고위험 — 운영 환경 사용 금지 또는 신중히

| 목적          | 엔드포인트                           | 위험 이유                        |
| ------------- | ------------------------------------ | -------------------------------- |
| VM 삭제       | `DELETE /{vmid}`                     | 디스크 포함 완전 삭제, 복구 불가 |
| 강제 종료     | `POST /status/stop`                  | 게스트 OS 데이터 손실 가능       |
| 하드 리셋     | `POST /status/reset`                 | 게스트 OS 데이터 손실 가능       |
| 롤백          | `POST /snapshot/{snapname}/rollback` | 현재 상태 소멸                   |
| 템플릿 변환   | `POST /template`                     | VM으로 복구 불가                 |
| 디스크 언링크 | `PUT /unlink`                        | `force=1` 시 즉시 삭제           |
| QEMU 모니터   | `POST /monitor`                      | 잘못된 명령으로 VM 중단 가능     |

---

## 16. `digest` 파라미터 — 동시성 충돌 방지

`PUT`/`DELETE` 요청에서 자주 등장하는 `digest` 파라미터는 SHA1 해시값으로, **현재 설정 파일의 내용을 기반으로 생성**됩니다. 동일 설정을 두 명이 동시에 수정할 경우 먼저 수정한 쪽의 변경이 나중에 덮어씌워지는 것을 방지합니다. `GET /config` 응답에 포함된 `digest` 값을 `PUT` 요청에 포함시키면 변경 시점의 설정이 달라졌을 경우 요청이 거부됩니다.

---

## 17. 반환 타입 패턴

| 반환 타입       | 설명                                                         | 해당 엔드포인트                              |
| --------------- | ------------------------------------------------------------ | -------------------------------------------- |
| `string (UPID)` | 비동기 작업 ID. `/tasks/{upid}/status`로 진행 상태 추적 가능 | start, stop, migrate, clone 등 대부분의 POST |
| `object`        | 단일 JSON 객체                                               | config, status/current, feature 등           |
| `array`         | JSON 배열                                                    | qemu 목록, snapshot 목록, firewall/rules 등  |
| `null`          | 응답 바디 없음 (성공만 확인)                                 | 방화벽 규칙 수정/삭제 등                     |

---

## References

1. [Proxmox VE API](https://pve.proxmox.com/wiki/Proxmox_VE_API) - Proxmox VE uses a REST like API. The concept is described in [1] (Resource Oriented Architecture - R...

2. [Proxmox VE API. Nodes. - Авторские статьи](https://vasilisc.com/proxmox-ve-api-nodes) - Proxmox VE API. Nodes. /nodes /nodes GET Description: Cluster node index. Permissions: Return: array...

3. [VM Templates and Clones via API - Proxmox Support Forum](https://forum.proxmox.com/threads/vm-templates-and-clones-via-api.14045/) - How can I perform Linked or Full clone via API ? Is it possible?

4. [[TUTORIAL] - API automation, Power ON/OFF vm and else.](https://forum.proxmox.com/threads/api-automation-power-on-off-vm-and-else.92467/) - This script is using the API system available with proxmox 6.7 if I remember correctly (Available in...

5. [qm(1) - Proxmox VE](https://pve.proxmox.com/pve-docs/qm.1.html) - Config type. qm cloudinit pending &lt;vmid>. Get the cloudinit configuration with both current and pend...

6. [proxmox-api-go/proxmox/client.go at master - GitHub](https://github.com/Telmate/proxmox-api-go/blob/master/proxmox/client.go) - Consume the proxmox API in golang. Contribute to Telmate/proxmox-api-go development by creating an a...

7. [[SOLVED] - Proxmox Web API Disk resize not working](https://forum.proxmox.com/threads/proxmox-web-api-disk-resize-not-working.151790/) - For some reason an API call to resize a disk is not working, yet all other calls are working fine. T...

8. [[SOLVED] - Delete Parameter Ignored on Move Disk API Endpoint](https://forum.proxmox.com/threads/delete-parameter-ignored-on-move-disk-api-endpoint.108334/) - According to the documentation for the move_disk endpoint below, the "delete" parameter defaults to ...

9. [Proxmox api vncwebsocket](https://forum.proxmox.com/threads/proxmox-api-vncwebsocket.73184/) - Create a new VNCProxy via the ProxmoxAPI ( POST /api2/json/nodes/{node}/qemu/{vmid}/vncproxy ); Crea...

10. [Proxmox api vncwebsocket | Page 2](https://forum.proxmox.com/threads/proxmox-api-vncwebsocket.73184/page-2) - The entire point of using vncproxy and then vncwebsocket is because Proxmox itself proxies the VNC w...

11. [[pve-devel] [PATCH qemu-server v3 1/2] add termproxy api call](https://pve.proxmox.com/pipermail/pve-devel/2017-December/029827.html) - ... node => get_standard_option('pve-node'), > + vmid => get_standard_option('pve-vmid'), > + serial...

12. [API:sendkey I would like to know if it supports delayed key release](https://forum.proxmox.com/threads/api-sendkey-i-would-like-to-know-if-it-supports-delayed-key-release.130597/) - Seeking Help I need some assistance regarding the API sendkey. I would like to know if it supports d...

13. [[SOLVED] - [pve7] api call agent/exec-status | Proxmox Support Forum](https://forum.proxmox.com/threads/pve7-api-call-agent-exec-status.137430/) - You have to do the API call exec-status to get the result of the exec command. HTML: GET /api2/json/...

14. [PROXMOX API::command agent implementation · Issue #36 - GitHub](https://github.com/proxmoxer/proxmoxer/issues/36) - Hi, I am new to proxmoxer and now wisht to implement the agent command to get the Network interfaces...

15. [[pve-devel] [PATCH qemu-server 6/8] add exec(-status) to qm](https://lists.proxmox.com/pipermail/pve-devel/2018-June/032292.html) - [pve-devel] [PATCH qemu-server 6/8] add exec(-status) to qm · Previous message (by thread): [pve-dev...

16. [api exec - Proxmox Support Forum](https://forum.proxmox.com/tags/api-exec/) - Hi, I've recently upgraded from Proxmox 7 to Proxmox 8.2.4 and I'm running into an issue with runnin...

17. [cloudinit via api | Proxmox Support Forum](https://forum.proxmox.com/threads/cloudinit-via-api.123811/) - Hi:), I saw a documentation how to attach a cloudinit drive to vm, and I want to do the same from th...

18. [Regenerate Cloudinit by PUT API return 500 - Proxmox Support Forum](https://forum.proxmox.com/threads/regenerate-cloudinit-by-put-api-return-500.124099/) - Hello ! I want to regenerate my cloud-init iso by API using a PUT on /api2/json/nodes/{node}/qemu/{v...
