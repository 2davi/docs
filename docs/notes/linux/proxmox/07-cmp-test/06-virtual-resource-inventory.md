---
title: "06. 가상 자원 인벤토리 — 41 VM 전수조사와 처분 원칙"
date: 2026-04-25
lastmod: 2026-04-25
author: "Davi"
description: "5노드 클러스터에 존재하는 모든 VM의 구성, 상태, 디스크, 네트워크, 작성자, HA 등록 여부를 전수조사한다. 'test' 포함 여부에 따른 처분 원칙을 본 환경의 핵심 판단 기준으로 확립하고, 41개 VM을 4개 처분 분류로 나눈다."
slug: "virtual-resource-inventory"
section: "notes"
category: "linux/proxmox/cmp-test"
tags: [proxmox, vm, qemu, template, snapshot, ha, inventory, cmp]
order: 6
series: "CMP Pre-Test Reconnaissance Handbook"
series_order: 6
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1.1"
---

## 0. 이 챕터의 정찰 목적

챕터 01~05가 "기반"을 다뤘다면 본 챕터는 그 기반 위에서 **실제 작동하는 자원**을 조사한다. 5노드에 **41개 VM**(LXC 0개)이 분산되어 있고, 작성자·용도·상태가 각기 다르다. 본 챕터의 목적은 다음 세 가지를 확정하는 것이다.

1. **각 VM의 실제 정체**: 이름이 같아도 디스크·네트워크·작성자가 다를 수 있다. 혼동 없이 41개를 식별
2. **처분 가능 여부**: STN 전 정리 대상 vs 보존 대상의 구분. 기준은 **"이름에 `test`가 포함되는가"**
3. **이전 챕터 이월 항목의 최종 해소**: VM 112 (챕터 02·05), VM 100015 (챕터 03), VM 809 (챕터 03), VM 101·102·9502 등의 개별 추적

### 0.1 본 환경의 VM 처분 규칙 — 단일 문장 원칙

본 환경의 VM 처분은 다음 한 문장으로 요약된다(사용자 메타 확인).

> **이름에 `test`가 포함되지 않은 VM은 건드리지 않는다.**

이는 팀 내 암묵 합의로 운영되는 규칙이며, 본 핸드북에서 **가장 중요한 단일 규칙**이다. 이 규칙이 적용되는 근거와 한계를 정리한다.

**적용 근거**:

- 팀에 VM 명명 규약이 문서화되어 있지 않음
- 직책 서열(PL-이사, TA-과장)에 따른 비공식 관리 책임 분담이 있으며, 중요 VM은 상위 직책이 관리
- `test` 접두사/접미사는 테스터가 자유롭게 생성한 실험용 자원의 관행
- 반대로 `test` 없는 이름(예: `bani`, `ubuntu-base`, `100-PBS`)은 **상위 직책 또는 개발팀이 관리하는 인프라 자원**일 가능성이 높음

**한계**:

- 규칙 자체가 암묵이므로 판단 오류 가능성 존재(예: 상위 직책이 `test` 접두사를 실수로 남긴 케이스)
- `test`의 위치도 일정하지 않음: 접두사(`test-vm`), 접미사(`-test-`), 중간(`56-test-testerB`), tag(`test-2026-04-22`)
- 이 규칙은 **처분(삭제·정지) 판단**에만 적용. 조회·구성 확인은 모든 VM에 가능

**실무적 적용**: 본 챕터 §2.6에서 41개 VM을 이 규칙으로 자동 분류. 모호 사례는 "확인 필요"로 보류.

### 0.2 본 챕터가 해소하는 미결 항목

| 출처         | 항목                                         | 본 챕터 §                  |
| ------------ | -------------------------------------------- | -------------------------- |
| 챕터 02 §2.5 | VM 112 처분 보류 — 작성자 미상               | §2.7                       |
| 챕터 02 §2.5 | VM 802 마이그레이션 중단 7일 방치            | §2.8                       |
| 챕터 03 §2.6 | VM 100015 node03-dir 마이그레이션 제약       | §2.9                       |
| 챕터 03 §2.6 | VM 809 동일 이름 두 스토리지                 | §2.10 — **유령 VM** 확정   |
| 챕터 03 §2.7 | VM 112 stale zvol (nd01, nd04)               | §2.7                       |
| 챕터 05 §2.5 | VM 112·101·799 mgmt 평면 연결                | §2.5                       |
| 챕터 05 §2.5 | VM 100004 NIC1 fwbr 미래핑                   | §2.5 — 3평면 연결 발견     |
| 챕터 05 §2.7 | CMP 요청 nd01 집중 + 5노드 cmp.jar 분산 구조 | §2.11 — CMP 배포 구조 확인 |

---

## 1. 개념 — 본 챕터 이해에 필요한 최소 배경

### 1.1 VM 상태 분류 — 실행 중인 VM vs 정지된 VM

`qm list`는 각 VM을 다음 상태로 표시.

| STATUS    | 의미                                     | 본 환경 건수 |
| --------- | ---------------------------------------- | ------------ |
| `running` | QEMU 프로세스 실행 중, PID 존재          | 20           |
| `stopped` | 정지. 디스크·설정은 유지, 즉시 기동 가능 | 21           |

본 챕터는 **정지 상태의 VM을 더 자세히 본다**. 실행 중 VM은 챕터 02에서 CPU/메모리 관점으로 이미 다뤘다. 정지 VM 21개 중에는 **테스트 후 정리 안 된 잔재**가 다수 섞여 있을 것으로 예상되며, 이를 분류하는 것이 본 챕터의 핵심.

### 1.2 템플릿(`template: 1`)과 일반 VM의 구분

Proxmox VM의 config에 `template: 1`이 있으면 해당 VM은 **템플릿**이다. 템플릿은 다음 특성을 갖는다.

- 직접 기동 불가 — clone의 원본으로만 사용
- 디스크가 read-only로 고정됨
- `qm template {vmid}`로 한 번 변환하면 **비가역** (일반 VM으로 되돌릴 수 없음)

`qm list` 자체로는 템플릿을 구분해주지 않는다. **`qm config {vmid} | grep template`** 또는 **`qm list --full 1`**로 분리 가능. 본 환경에는 **7개 템플릿**(§2.4)이 있다.

### 1.3 Snapshot 계보 — `parent` 키워드

VM config의 `parent:` 필드는 현재 VM 상태가 어느 snapshot에서 분기되었는지를 나타낸다. `qm listsnapshot {vmid}`으로 tree 형태 시각화 가능.

본 환경에서 `parent:`가 있는 VM은:

- VM 700: `parent: test-0413`
- VM 702: `parent: test-snap`
- VM 114: `parent: init`
- VM 100015: `parent: postgres15-installed`
- VM 9502: `parent: test_24`

이들은 **특정 snapshot에서 갈라져 나온 상태**다. snapshot 자체는 §2.12에서 확인.

### 1.4 Cloud-init VM 식별 — `ide0` + `ciuser`

Cloud-init은 VM 최초 부팅 시 네트워크·사용자·SSH 키 등을 자동 주입하는 프로비저닝 메커니즘. Proxmox에서는 다음 config 패턴으로 식별.

```markdown
ide0: {storage}:vm-{vmid}-cloudinit,media=cdrom   # cloud-init 이미지가 ide0에 꽂힘
ciuser: {username}                                 # 기본 로그인 사용자명
cipassword: **********                             # 패스워드 (암호화 표시)
ipconfig0: ip={ip}/{mask},gw={gw}                 # 네트워크 설정
```

본 환경에서 cloud-init을 쓰는 VM은 **12개**(§2.13). `ciuser` 값이 여러 개 혼재한다 — 통일되어 있지 않다는 것은 **여러 작성자가 각자 만든 흔적**.

### 1.5 HA 등록 VM — `ha-manager`로 관리되는 VM

HA(High Availability) 등록 VM은 다음 특징:

- 특정 노드 장애 시 다른 노드로 자동 재시작
- `ha-manager status`에 `service vm:{vmid}` 형태로 등장
- `state` 필드로 원하는 상태 지정 (started, stopped, ignored)

본 환경 HA 등록 VM은 **6개**(§2.3). 이 중 일부는 comment에 작성자 실명이 박혀 있다(§2.3.1).

### 1.6 VM config 파일 저장 위치 — pmxcfs의 원자성

VM config는 **`/etc/pve/nodes/{node}/qemu-server/{vmid}.conf`**에 저장. `/etc/pve/`는 pmxcfs(Proxmox Cluster Filesystem)로 마운트되며, 5노드에 자동 복제.

특히 중요한 사실: **`/etc/pve/qemu-server/`**에서 접근하면 pmxcfs가 **현재 노드의 qemu-server/ 디렉터리로 심볼릭 링크**한다. 즉 `/etc/pve/qemu-server/{vmid}.conf`와 `/etc/pve/nodes/{hostname}/qemu-server/{vmid}.conf`가 같은 파일(현재 노드에서).

이 구조가 **"어느 노드에 어떤 VM이 속하는가"**를 명시한다. `nodes/pve-nd01/qemu-server/`에 있는 config는 **nd01 소속 VM**이다. `qm list`는 이 경로를 스캔해서 리스트를 만든다.

**이 구조의 중요한 함의**: **config 파일이 존재하지 않는데 QEMU 프로세스만 실행 중인 VM**이 있을 수 있다. 이는 **유령 VM**이며, 본 환경에 실제 1건 존재(§2.10 VM 809).

### 1.7 tag 시스템 — PVE 9의 자원 분류 기능

PVE 8 이후 VM/스토리지에 `tags` 필드가 추가되었다. 여러 tag를 세미콜론 `;`으로 구분. WebUI에서 필터링 가능.

본 환경 tag 사용 패턴은 매우 제한적:

- VM 102: `tags: testerB-test.-` (테스터 ID + test 표시)
- VM 112: `tags: ` (공백 — 의도적 빈값?)
- VM 702: `tags: tag01;tag02` (placeholder 느낌)
- VM 9502, 99502: `tags: test-2026-04-22` (날짜 포함)

**정리된 명명 규칙 없음**. tag 자원 분류 자체는 설계되어 있으나 실무 활용이 미비. 챕터 04에서 통일 규약 논의 필요.

---

## 2. 정찰 명령과 출력 해석

데이터 수집: 2026-04-25 오전. 5노드 동시 수집.

### 2.1 VM 개수 — 노드별 분포

| 노드     | 실행 중 | 정지   | 템플릿                     | 합계   |
| -------- | ------- | ------ | -------------------------- | ------ |
| pve-nd01 | 2       | 3      | 0                          | 5      |
| pve-nd02 | 2       | 2      | 1 (VM 810)                 | 4      |
| pve-nd03 | 5       | 3      | 0                          | 8      |
| pve-nd04 | 3       | 4      | 1 (VM 105)                 | 7      |
| pve-nd05 | 8       | 9      | 3 (VM 200, 100001, 100003) | 17     |
| **합계** | **20**  | **21** | **5**                      | **41** |

**LXC 컨테이너 0개** (5노드 `pct list` 결과 모두 비어있음). 본 환경은 **전적으로 QEMU VM으로 운영**.

**판독**:

1. **nd05가 VM 절반 보유 (17/41)**: 시설 상 가장 부하가 집중된 노드. 그러나 챕터 02 §2.2에서 nd04의 메모리 사용률(63%)이 더 높았다 — **VM 개수와 실제 부하는 별개**. nd05의 VM 다수가 정지 상태라 메모리는 안 쓰는 상태.
2. **템플릿 수가 5개**(§2.4 전체 목록). 템플릿 2개가 추가로 존재 — VM `810`(nd02)은 본 `qm list`에는 정지 VM으로 나왔으나 `qm config` 결과 `template: 1`. 총 템플릿은 **7개**로 재정정(§2.4).

### 2.2 VM 이름 명명 패턴 분석

5노드 전체 41개 VM의 이름을 분석. 다음 패턴이 공존.

| 패턴                 | 예시                                                    | 건수 | 해석                    |
| -------------------- | ------------------------------------------------------- | ---- | ----------------------- |
| `{번호}-test-{설명}` | `56-test-testerB`, `58-CICD`                            | ~15  | 테스터 번호 + test 명시 |
| `{VMID}-test-{설명}` | `104-test-vm`, `810-test-tp`                            | ~10  | VMID 앞에 붙음          |
| `{역할}-{번호}`      | `WEB01`, `HAProxy01`, `Prom01`                          | ~8   | 기능 중심 명명          |
| 한 단어 임의 명명    | `bani`, `test`, `noip-test-vm`, `74-disk`               | ~5   | 테스터 자유             |
| 특수                 | `ubuntu-base`, `docker-base`, `56-test-testerB-restore` | 3    | 베이스 이미지 또는 복원 |

**규약 부재가 명확**. 동일 기능의 VM이 이름만 달리 만들어진 케이스:

- `100010 = 64-HAProxy01`, `100011 = 65-HAProxy02` (통일)
- `10020001 = 70-Prom01`, `100020 = 67-Prom01` (**같은 이름, 다른 VMID**)
- `10021001 = 71-PromAgent01`, `100021 = 69-PromAgent01` (**같은 이름, 다른 VMID**)

후자 두 쌍은 매우 이상하다 — 같은 이름의 VM이 각 노드에 따로 존재. 서로 다른 버전의 구축 실험인지, 한쪽이 정리 대상인지 확인 필요. 챕터 04 또는 개발팀 협의 인계.

### 2.3 HA 등록 자원 — 6개 VM, 작성자 식별 가능

`ha-manager config` 결과.

| VMID   | VM 이름            | 노드 | state       | 작성자 정보 (comment)                                       |
| ------ | ------------------ | ---- | ----------- | ----------------------------------------------------------- |
| 100002 | 61-docker-registry | nd01 | started     | **testerA (testerA-real)** — "docker-registy VM HA"         |
| 106    | 58-CICD            | nd04 | started     | (작성자 미상) — "CI/CD"                                     |
| 115    | 56-test-testerB    | nd02 | stopped     | **testerB (testerB-real)** — HTML: `<h6 style="color:red">` |
| 116    | 113-test-testerB   | nd01 | stopped     | **testerB (testerB-real)** — HA 추가                        |
| 9502   | 92-test-vm         | nd05 | started     | (작성자 미상) — "test_26 (2026-04-22 15:18)"                |
| 9503   | noip-test-vm       | nd04 | **ignored** | (작성자 미상) — "test_32"                                   |

**HA 자원 수 = 6개** (챕터 01 §2.8의 7개와 1건 차이). 이는 `pvecm status`의 HA 자원 카운트가 `service` 블록 수와 다르게 집계되거나, 본 수집 시점 사이 1건이 변동되었을 가능성. 수치 편차는 챕터 01 §3.2의 의심 패턴이지만, 이 정도 편차는 **config 갱신 중 순간 불일치**로도 발생 가능.

**판독**:

1. **HA 자원이 주로 `test` 이름의 VM** (4/6): testerB의 55번, 56번, 113번 + 9502(92-test-vm) + 9503(noip-test-vm). **HA는 테스트 목적으로 활용 중이며, 실질 운영 고가용성 보장 대상은 100002와 106 2개만**
2. **comment에 작성자 정보가 풍부**: 특히 testerB의 comment에는 **실명 "testerB-real"이 박혀 있다**. HA config가 작성자 태깅의 실질 수단이 되어 있음
3. **VM 9503의 state가 `ignored`**: 등록은 됐지만 HA 대상에서 제외. 결국 "HA에 있지만 HA 안 함" — 정리 후보
4. **HA comment의 HTML 태그**: testerB의 VM 115 comment에 `<h6 style="color:red">`. PVE WebUI에서 빨간색 굵은 글씨로 표시하려는 의도. **이 HTML이 WebUI의 XSS 방어를 우회할 수 있는가**는 챕터 08 보안 검토 항목

### 2.3.1 HA 자원 comment의 XSS 검토 필요성

PVE WebUI는 HA comment의 HTML을 **그대로 rendering**하는가, 또는 **escape 처리**하는가? 본 데이터만으로는 확정 불가 — UI 실측 필요. 만약 rendering된다면:

- 악의적 사용자가 HA config에 `<script>` 태그 주입 가능 (theoretically)
- 현재 testerB가 의도적으로 `<h6>` 태그를 사용하여 가시성 강화 중이므로, **rendering되는 환경**일 가능성 높음

권고: 챕터 08에서 XSS 가능성 실측 항목으로 등록.

### 2.4 템플릿 전수 — 7개

| VMID   | 이름           | 노드 | 용도 추정                                 |
| ------ | -------------- | ---- | ----------------------------------------- |
| 105    | 105-test-tp    | nd04 | 테스트 목적                               |
| 200    | 200-review-tp  | nd05 | 리뷰용                                    |
| 810    | 810-test-tp    | nd02 | 테스트 목적                               |
| 100001 | 57-docker-base | nd05 | **Docker 기반 이미지**                    |
| 100003 | ubuntu-base    | nd05 | **Ubuntu 기반 이미지** — 이름에 test 없음 |

**발견 5개**. 하지만 nd03·nd01에도 template이 있을 수 있어 재확인 필요.

본 데이터에서 확인되는 template 5개. `105-test-tp`, `810-test-tp`, `200-review-tp`의 **`-tp`** 접미사는 "template"의 축약으로 추정 — 자체 명명 규칙 일부 사례.

**판독**:

1. **`100003 = ubuntu-base`가 `test` 없음**: 본 §0.1 규칙에 따라 **건드리지 말아야 할 자원**. 공통 기반 이미지
2. **`100001 = 57-docker-base`도 `test` 없음**: Docker 관련 인프라 이미지. 역시 보존
3. **`105, 200, 810`**은 test 포함 → 처분 가능 후보이나, 템플릿 삭제는 그로부터 clone된 VM이 있는지 확인 필수

### 2.5 VM 네트워크 연결 전수 — 평면 매트릭스

챕터 05 §2.5에서 "VM이 mgmt 평면에 연결된 비정상 케이스"를 발견했다. 본 챕터에서 41개 VM의 네트워크 설정을 전수 조사하여 정리.

#### 2.5.1 각 VM의 net0~netN 연결 bridge 매트릭스

| VMID     | 이름                    | net0      | net1      | net2      | 평면 평가                         |
| -------- | ----------------------- | --------- | --------- | --------- | --------------------------------- |
| 100      | 100-PBS                 | vmbr1     | vmbr2     | —         | ✓ 의도된 분리 (백업 트래픽)       |
| 102      | 56-test-testerB-restore | vmbr1     | —         | —         | ✓                                 |
| 104      | 104-test-vm             | vmbr1     | —         | —         | ✓                                 |
| 116      | 113-test-testerB        | vmbr1     | —         | —         | ✓                                 |
| 100002   | 61-docker-registry      | vmbr1     | —         | —         | ✓                                 |
| 112      | 112-test-vm             | **vmbr0** | —         | —         | ⚠ mgmt 평면                       |
| 115      | 56-test-testerB         | vmbr1     | —         | —         | ✓                                 |
| 700      | 50-test-ubuntu          | vmbr1     | —         | —         | ✓                                 |
| 810      | 810-test-tp             | vmbr1     | —         | —         | ✓ (template)                      |
| 114      | 55-test                 | vmbr1     | —         | —         | ✓                                 |
| 702      | 51-test-rocky           | vmbr1     | —         | —         | ✓                                 |
| 802      | 802-test-tmp            | **vmbr0** | —         | —         | ⚠ mgmt 평면 (migration 중단 상태) |
| 803      | 803-test-winPE-clone    | **vmbr0** | —         | —         | ⚠ mgmt 평면                       |
| 806      | 806-test-vm             | vmbr1     | —         | —         | ✓                                 |
| 807      | 807-test-vm             | **vmbr0** | —         | —         | ⚠ mgmt 평면                       |
| 100010   | 64-HAProxy01            | vmbr1     | **vmbr0** | —         | ⚠ net1이 mgmt                     |
| 100015   | 66-PostgresDB           | vmbr1     | —         | —         | ✓                                 |
| 100021   | 69-PromAgent01          | vmbr1     | —         | —         | ✓                                 |
| 105      | 105-test-tp             | **vmbr0** | —         | —         | ⚠ (template)                      |
| 106      | 58-CICD                 | vmbr1     | —         | —         | ✓                                 |
| 113      | 52-monitoring           | vmbr1     | —         | —         | ✓                                 |
| 801      | 801-test-winPE          | **vmbr0** | —         | —         | ⚠ mgmt 평면                       |
| 805      | 805-test-vm             | **vmbr0** | —         | —         | ⚠ mgmt 평면                       |
| 811      | 811-test-vm             | vmbr1     | —         | —         | ✓                                 |
| 9503     | noip-test-vm            | vmbr1     | —         | —         | ✓                                 |
| 100020   | 67-Prom01               | vmbr1     | —         | —         | ✓                                 |
| 101      | bani                    | vmbr1     | vmbr1     | —         | ✓ 둘 다 vm (rtl8139 NIC 사용)     |
| 103      | test                    | **vmbr0** | —         | —         | ⚠ mgmt 평면                       |
| 200      | 200-review-tp           | vmbr1     | —         | —         | ✓ (template)                      |
| 201      | 200-review              | vmbr1     | —         | —         | ✓                                 |
| 9502     | 92-test-vm              | vmbr1     | —         | —         | ✓                                 |
| 99502    | 92-test-clone           | vmbr1     | —         | —         | ✓                                 |
| 100001   | 57-docker-base          | vmbr1     | —         | —         | ✓ (template)                      |
| 100003   | ubuntu-base             | **vmbr0** | —         | —         | ⚠ mgmt 평면 (template)            |
| 100004   | 62-WEB01                | vmbr1     | **vmbr0** | **vmbr2** | ⚠⚠ **3평면 연결**                 |
| 100005   | 63-WEB02                | vmbr1     | vmbr0     | vmbr2     | ⚠⚠ 3평면 연결                     |
| 100006   | 68-ceph-test            | vmbr1     | vmbr2     | vmbr0     | ⚠⚠ 3평면 연결                     |
| 100011   | 65-HAProxy02            | vmbr1     | **vmbr0** | —         | ⚠                                 |
| 111069   | 74-disk                 | vmbr1     | —         | —         | ✓                                 |
| 10020001 | 70-Prom01               | vmbr1     | —         | —         | ✓                                 |
| 10021001 | 71-PromAgent01          | vmbr1     | —         | —         | ✓                                 |
| 10025001 | 72-filebrowser          | vmbr1     | —         | —         | ✓                                 |
| 10031001 | 73-Grafana01            | vmbr1     | —         | —         | ✓                                 |

#### 2.5.2 평면 연결의 분류

**mgmt 평면(vmbr0) 연결 VM = 14건**:

- test 이름 VM (9): 105, 112, 103, 801, 802, 803, 805, 807, (NIC1만: 100010, 100011)
- test 없는 VM (5): 100003 (ubuntu-base), 100004 (WEB01), 100005 (WEB02), 100006 (ceph-test), 100010 (HAProxy01 net1)

**3평면 동시 연결 VM = 3건**: 100004, 100005, 100006 (WEB01, WEB02, ceph-test)

**판독**:

1. **"VM이 vmbr1(vm 평면)에 연결되어야 한다"는 설계 원칙이 절반만 지켜짐**. 절반 이상의 VM이 예외 — 특히 test 이름 VM의 경우 **mgmt 평면으로 쉽게 붙는 관행**이 있다. 이는 신규 VM 생성 시 PVE의 기본값(`bridge=vmbr0`)을 변경하지 않고 넘기는 것이 원인
2. **3평면 동시 연결 VM**: WEB01/WEB02/ceph-test가 특이. 3 NIC 구성은 **다중 네트워크 세그먼트 실험용** (Ceph는 Public/Cluster 네트워크 분리 설계가 일반적). 의도된 설계
3. **VM 100004 net1이 fwbr 미래핑**(챕터 05 §2.5): `net1: virtio=BC:24:11:E9:79:05,bridge=vmbr0` — `firewall=1` 플래그가 **없다**. PVE가 net0에만 firewall=1을 기본 적용하고 net1·net2는 명시해야 활성. 이를 빼먹은 상태

### 2.6 41 VM의 'test' 규칙 자동 분류

§0.1 규칙을 41개 VM에 적용한 결과.

#### 2.6.1 처분 가능 (test 포함, 24건)

| VMID   | 이름                    | 작성자/소속                | 상태                         |
| ------ | ----------------------- | -------------------------- | ---------------------------- |
| 102    | 56-test-testerB-restore | testerB                    | stopped                      |
| 103    | test                    | 미상                       | stopped                      |
| 104    | 104-test-vm             | 미상                       | stopped                      |
| 105    | 105-test-tp             | 미상 (template)            | stopped                      |
| 112    | 112-test-vm             | 미상                       | **running — 3일 고부하**     |
| 114    | 55-test                 | 미상                       | running                      |
| 115    | 56-test-testerB         | testerB                    | stopped                      |
| 116    | 113-test-testerB        | testerB                    | stopped                      |
| 200    | 200-review-tp           | 미상 (template)            | stopped                      |
| 700    | 50-test-ubuntu          | 미상                       | running                      |
| 702    | 51-test-rocky           | 미상                       | running                      |
| 802    | 802-test-tmp            | 미상                       | **running — migration 중단** |
| 803    | 803-test-winPE-clone    | 미상                       | stopped                      |
| 805    | 805-test-vm             | 미상                       | stopped                      |
| 806    | 806-test-vm             | 미상                       | stopped                      |
| 807    | 807-test-vm             | 미상                       | stopped                      |
| 810    | 810-test-tp             | 미상 (template)            | stopped                      |
| 811    | 811-test-vm             | 미상                       | stopped                      |
| 9502   | 92-test-vm              | 미상 (HA started)          | running                      |
| 9503   | noip-test-vm            | 미상 (HA ignored)          | stopped                      |
| 99502  | 92-test-clone           | 미상 (tag test-2026-04-22) | stopped                      |
| 100006 | 68-ceph-test            | 미상                       | stopped                      |
| 111069 | 74-disk                 | 미상 (수집 직전 생성)      | running                      |
| 801    | 801-test-winPE          | 미상                       | stopped                      |

**24/41 = 58.5%**. 과반이 정리 대상 후보.

#### 2.6.2 보존 (test 없음, 17건)

| VMID     | 이름               | 작성자/소속                 | 평가                              |
| -------- | ------------------ | --------------------------- | --------------------------------- |
| 100      | 100-PBS            | 인프라                      | **PBS 서버 — 절대 건드리지 않음** |
| 106      | 58-CICD            | HA etched, comment: "CI/CD" | CI/CD 인프라                      |
| 100002   | 61-docker-registry | testerA (HA)                | Docker registry 인프라            |
| 113      | 52-monitoring      | 미상                        | 모니터링 서버 — 500G 디스크       |
| 100001   | 57-docker-base     | 미상 (template)             | Docker 기반 이미지                |
| 100003   | ubuntu-base        | 미상 (template)             | Ubuntu 기반 이미지                |
| 100004   | 62-WEB01           | 미상                        | WEB 서버                          |
| 100005   | 63-WEB02           | 미상                        | WEB 서버                          |
| 100010   | 64-HAProxy01       | 미상                        | HAProxy                           |
| 100011   | 65-HAProxy02       | 미상                        | HAProxy                           |
| 100015   | 66-PostgresDB      | testerA                     | Postgres DB                       |
| 100020   | 67-Prom01          | 미상                        | Prometheus                        |
| 100021   | 69-PromAgent01     | 미상                        | Prometheus Agent                  |
| 10020001 | 70-Prom01          | 미상                        | Prometheus (중복 이름)            |
| 10021001 | 71-PromAgent01     | 미상                        | Prometheus Agent (중복 이름)      |
| 10025001 | 72-filebrowser     | 미상                        | 파일 브라우저                     |
| 10031001 | 73-Grafana01       | 미상                        | Grafana                           |
| 201      | 200-review         | 미상                        | review용 — test 없음              |
| 101      | bani               | 미상 (nd05, stopped)        | 불명 이름 — **이상 신호**         |

**17/41 + 101 (bani) = 18/41 = 43.9%**.

#### 2.6.3 모호 사례 — "확인 필요"

**VM 101 (`bani`)**:

- 이름에 `test` 없음 → 보존 대상
- 그러나 이름이 사전에 없는 단어(한국어 "바니"?) + `rtl8139` 구식 NIC + USB mapping `pve-nd01-usb` (nd01의 USB를 nd05 VM이 매핑?)
- USB mapping 자체가 특이 — 누군가가 USB 장비(키보드/마우스/동글 등)를 VM에 연결한 흔적
- **처분 판단 불가**. 작성자 확인 필요

**VM 103 (`test`)**:

- 이름이 단순히 `test` — 접두/접미/위치 없이 단어 자체
- §0.1 규칙의 "이름에 test 포함"에 해당 → 처분 가능 후보
- 그러나 단순 `test`가 맥락 없이 단독 사용되는 것은 의도를 읽기 어렵다
- **정지 상태 + 100% test 이름**이므로 처분 가능으로 분류하되 확인 선행

### 2.7 VM 112 최종 정리 — 작성자 미상, 3일 고부하 지속

챕터 02 §2.5·§7.1, 챕터 03 §2.3.1, 챕터 05 §2.5에서 추적해 온 VM 112.

#### 2.7.1 본 챕터에서 확인된 추가 사실

```markdown
config:
  boot: order=scsi0;ide2;net0
  cpu: x86-64-v2-AES
  memory: 2048
  scsi0: local-zfs:vm-112-disk-0, size=32G
  scsi1: local-zfs:vm-112-disk-1, size=32G
  net0: vmbr0 (mgmt 평면, firewall=1)
  tags: (공백)
  ctime: 2026-03-04 (49일 전 생성)
```

추가 관측:

- **ctime(VM 생성 시각) 2026-03-04** — 클러스터 초기 구축 시점과 가까움. 개발팀 초기 설정 테스트 VM일 가능성 시사
- `/etc/pve/nodes/pve-nd02/qemu-server/112.conf` mtime: **2026-04-22 13:14** — 22일 전 마지막 편집. 최근 누군가 config 수정
- **HA에 등록되지 않음**: `ha-manager config`에 없음. 장애 시 자동 복구 대상 아님

#### 2.7.2 처분 원칙 확정

본 챕터 §0.1 규칙에 의해:

- 이름 `112-test-vm`에 **test 포함** → 처분 가능 후보
- 그러나 **3일 연속 61.6% CPU + 3월 4일 생성 + 최근 편집됨** → **현재 사용 중일 가능성 배제 불가**
- "처분 가능 후보"임에도 "현재 누군가가 쓰고 있다"는 가능성 때문에 보류

**최종 처분 권고**: **작성자 추적 후 처분 판단**. 절대 단독으로 삭제하지 않음 (§7.1).

**작성자 추적 방법**:

1. `/etc/pve/nodes/pve-nd02/qemu-server/112.conf`의 mtime(2026-04-22) 시점에 PVE WebUI에 접속한 사람을 **PVE access log**에서 확인 (챕터 07 로그 영역)
2. VM 생성 시점(2026-03-04) 경로로 **가장 오래된 pvedaemon log**가 남아 있다면 확인
3. 두 방법 모두 실패 시 팀 전체에 "VM 112 작성자?"로 간단히 질문 (Slack 메시지 1건으로 해결 가능)

### 2.8 VM 802 최종 정리 — 마이그레이션 중단 상태 7일 방치 확정

챕터 02 §2.5, 챕터 03 §2.6에서 추적.

#### 2.8.1 QEMU 프로세스 확인

```bash
ps -ef | grep -E 'kvm.*-id 802|qmmigrate.*802'
```

결과:

```markdown
root 129443 1 1 Apr16 ? 02:28:59 /usr/bin/kvm -id 802 ...
... -incoming unix:/run/qemu-server/802.migrate -S
```

**확정 사실**:

1. **프로세스 시작 시각: Apr16** — 데이터 수집 시점(2026-04-24) 기준 8일 전
2. **`-incoming unix:/run/qemu-server/802.migrate`**: 마이그레이션 수신 대기 중
3. **`-S` 플래그**: QEMU를 시작 시 `paused` 상태로 두라는 의미 — **실제로 작동하지 않는 상태**
4. config mtime: `Apr 16 13:18` — 프로세스 시작과 거의 동시. 마이그레이션 시작 후 config가 박히고 멈춤
5. `-cpu qemu64`: 매우 기본적인 CPU 모드 (Linux qemu64 pre-built). 다른 VM의 `x86-64-v2-AES`보다 훨씬 낡은 스펙

#### 2.8.2 추정 상황

VM 802 마이그레이션이 **nd? → nd03**으로 시도됨(`802.conf`는 nd03 소속). 이 과정에서:

1. nd03에 `802.migrate` socket 파일이 만들어지고 대기 상태 QEMU 기동
2. 원본 노드에서 memory state 전송 시작
3. **전송 중 실패 또는 중단** (네트워크? 원본 노드 crash? 타임아웃?)
4. 수신 대기 QEMU 프로세스가 정리되지 못하고 8일째 남아있음

**8일 동안 이 사실을 아무도 인지하지 못함**. 본 챕터에서 처음 공식 확인.

#### 2.8.3 처분 권고

- 이름 `802-test-tmp` → **test 포함, 처분 가능**
- 정지 상태이며 8일 방치 → **현재 사용 중일 가능성 매우 낮음**
- 먼저 **프로세스 강제 종료**: `qm stop 802 --force` (격자 L2×R3 — 프로세스 죽어도 디스크 남음)
- 그 다음 **디스크 남은 상태 확인** 후 VM config 정리

**격자 평가**: 프로세스 종료는 L2×R3 (메모리 상태 잃음, 그러나 이미 paused 상태라 상실 없음). **정리 권고**. 단 작성자 1회 확인 후 진행.

### 2.9 VM 100015 (PostgresDB) — node03-dir 제약 확인

챕터 03 §2.6에서 "node03-dir에 디스크 → 마이그레이션 제약"으로 기록.

#### 2.9.1 본 챕터에서 확인된 사실

```markdown
name: 66-PostgresDB
description: testerA-real (URL-encoded 한글)
scsi0: node03-dir:100015/vm-100015-disk-0.qcow2, size=30G
parent: postgres15-installed
(snapshot): postgres16-installed — 2026-04-22 10:24:13
           "[유스케이스 테스트] 16버전 업그레이드 후 test16 테이블 생성"
```

- **작성자: testerA (testerA-real)** — description에서 확인
- **snapshot 체인**: postgres15-installed → current (postgres16 snapshot 기록)
- **Postgres 버전 업그레이드 실험 중** (15 → 16)
- 이름에 `test` 없음 → **보존 대상**

#### 2.9.2 마이그레이션 제약의 실전 함의

- **node03-dir는 nd03 로컬 디렉터리** (다른 노드에서 접근 불가)
- 따라서 VM 100015는 **nd03 외의 노드에서 기동 불가**
- HA에도 등록 불가
- nd03 장애 시 **Postgres DB 전면 중단**

**개선 방향** (개발팀 협의 항목):

1. 디스크를 `pve-nd06-nfs`로 이전 → 마이그레이션 가능해짐 + 백업 자동 (NFS는 PBS가 접근)
2. `prom-lvm` shared LVM으로 이전 → live migration 가능
3. 현 상태 유지 → 가동률이 크게 중요하지 않은 실험용 DB이면 수용

**권고**: 개발팀에 "PostgresDB VM이 nd03 로컬에 있는 의도가 무엇인지, 이전할 의사 있는지" 문의. 테스트팀 단독 판단 영역 아님.

### 2.10 VM 809 — 🔴 유령 VM 확정

챕터 03 §2.6에서 "VM 809 동일 이름의 두 스토리지"로 기록했던 항목. 본 챕터에서 최종 확인.

#### 2.10.1 유령 VM 판정 증거

```bash
ssh pve-nd03 "qm config 809"
# → Configuration file 'nodes/pve-nd03/qemu-server/809.conf' does not exist
```

**`qm list`에도 나타나지 않음**. 5노드 어디에도 809 config 파일 없음.

그러나 챕터 03 §2.6의 VM 디스크 매트릭스에 `pve-nd06-nfs:809/vm-809-disk-0.qcow2`와 `local:809/vm-809-disk-0.qcow2`가 관찰되었음. 즉 **디스크 파일은 있지만 VM config는 없음** = **orphaned disk**.

#### 2.10.2 orphaned disk의 해석

Proxmox에서 VM을 삭제할 때 `Purge` 옵션을 켜지 않으면 디스크가 남는다. 또는:

- VM을 수동으로 unlink (`qm unlink`) 후 config만 삭제
- pmxcfs 상에서 `.conf` 파일을 직접 `rm` (비권장)

어느 경로인지는 불명. 챕터 03에서 "nd03-dir:809/vm-809-disk-0.qcow2"와 "local:809/vm-809-disk-0.qcow2" 두 위치에 같은 파일명의 디스크가 존재 → **VM 삭제 후 양쪽에서 정리되지 않은 상태**.

**정리 가능 여부**:

- 이름 `809-*`로 추정 — **test 포함**일 가능성 높음 (VMID 800번대는 대부분 test-winPE 시리즈)
- 그러나 config가 없어 이름 확정 불가
- 디스크 파일명만으로는 내용 확인 불가

**권고**: 두 디스크를 **qemu-img info**로 먼저 확인. 내용이 비어있거나 PE 설치 흔적 정도면 삭제 가능(L2×R2). 데이터가 있어 보이면 소유자 확인 후 결정.

```bash
# (추후 수행) 내용 확인
qemu-img info /mnt/pve/pve-nd06-nfs/images/809/vm-809-disk-0.qcow2
qemu-img info /var/lib/vz/images/809/vm-809-disk-0.qcow2
```

### 2.11 CMP 배포 구조 최종 확인

챕터 02 §2.6에서 "CMP 5노드 분산"으로 결론, 챕터 05 §2.7에서 "실제 요청은 nd01 집중"으로 정정. 본 챕터에서 **VM 구성 관점에서 CMP 배포 구조**를 최종 확인한다.

#### 2.11.1 CMP 관련 VM 후보

41개 VM 중 이름에 `cmp`·`CMP` 포함 VM: **0건**.

`cmp.jar` 프로세스는 **호스트(Proxmox 노드) 자체에서 실행**되는 것이지, VM 내부에서 실행되는 것이 아니다(챕터 02 §2.5, §2.6). 즉 CMP는:

- **호스트 프로세스로 5노드에서 실행** — `/CmpData/apps/cmp/libs/cmp.jar`
- **VM 내부에 CMP가 있는 것이 아님**
- **테스트팀이 VM 수준으로 CMP를 조작할 수 없음** — 호스트 root 권한 필요

이 구조 확인이 본 챕터의 중요 성과. 챕터 02에서 "5노드 분산 실행" 사실, 챕터 05에서 "nd01 집중 트래픽" 사실, 그리고 본 챕터에서 **"VM이 아닌 호스트 프로세스"** 사실이 모두 모였다.

#### 2.11.2 함의 — 테스트팀 작업의 범위

CMP가 호스트에서 돌면:

- CMP **재시작** → 호스트 root 필요. 테스트팀 권한 부족
- CMP **로그 접근** → 호스트 파일시스템 접근 필요. 테스트팀 가능
- CMP **설정 변경** → 호스트 root 필요. 개발팀 영역
- CMP **API 호출** → 가능. `:18080`으로 HTTP 요청

**테스트팀은 CMP를 "블랙박스"로 테스트할 수 있다**. 내부 조작은 할 수 없고, API와 UI 통해서만 행동 가능. 이는 STN의 **통합 테스트 관점**에서 오히려 올바른 역할 분담.

### 2.12 Snapshot 보유 VM — 4개

`qm listsnapshot` 결과.

| VMID   | snapshot             | 생성 시각        | 설명                                                    |
| ------ | -------------------- | ---------------- | ------------------------------------------------------- |
| 702    | test-snap-01         | 2026-03-13 15:38 | vi test-dir/test-2                                      |
| 702    | test-zfs             | 2026-03-16 15:30 | state                                                   |
| 702    | test1                | 2026-03-19 15:39 | no-description                                          |
| 100015 | postgres16-installed | 2026-04-22 10:24 | [유스케이스 테스트] 16 업그레이드 후 test16 테이블 생성 |
| 114    | (parent: init)       | —                | init snapshot                                           |
| 700    | (parent: test-0413)  | —                | test-0413 snapshot                                      |
| 9502   | (parent: test_24)    | —                | test_24 snapshot                                        |

**snapshot 보유 VM 정리**:

- VM 702: **3개 snapshot** — 3월 13/16/19 연속 — 동일 날짜 오후 3시 반에 snapshot을 찍는 패턴. 누군가 VM 702에서 **일일 progress snapshot**을 했던 흔적. 2026-03-19 이후 snapshot 없음 → **실험 종료된 상태**
- VM 100015: postgres15 → postgres16 업그레이드 실험의 경계점
- VM 114, 700, 9502: parent만 있고 listsnapshot 결과에 자세한 기록 없음

#### 2.12.1 정리 권고

- **VM 702의 3 snapshot**: 실험 종료 후 정리 대상. 각 snapshot이 최대 393MiB의 RAM 덤프(챕터 03 §2.3.2 `vm-702-state-*`)를 포함할 가능성 있음. 스토리지 용량 절감 효과
- **VM 100015의 postgres16 snapshot**: **현재 실험이 진행 중일 가능성** — testerA가 실험 중이므로 임의 삭제 금지

### 2.13 Cloud-init 사용 VM — 12개 + `ciuser` 혼재

| VMID        | 이름                    | ciuser                  | IP 설정      |
| ----------- | ----------------------- | ----------------------- | ------------ |
| 102         | 56-test-testerB-restore | **corp**                | 10.10.40.56  |
| 100002      | 61-docker-registry      | **corp**                | 10.10.40.60  |
| 100001      | 57-docker-base          | **corp**                | 10.10.40.62  |
| 100003      | ubuntu-base             | (미지정?)               | 10.10.40.63  |
| 100004      | 62-WEB01                | (미지정?)               | 10.10.40.62  |
| 201         | 200-review              | **aa**                  | 10.10.40.200 |
| 9502        | 92-test-vm              | **test**                | 10.10.40.92  |
| 99502       | 92-test-clone           | **test**                | 10.10.40.92  |
| 104         | 104-test-vm             | (ide0만, ciuser 미확인) | —            |
| 116, 115 등 | —                       | (ide2만 iso로)          | —            |

**판독 — `ciuser: corp`의 의미** (원본 값은 마스킹 정책에 따라 `corp`로 치환됨 — 실제로는 사내 도메인에서 파생된 단어):

- `corp`는 **사내 도메인 `corp.local`의 첫 단어** — 회사명을 cloud-init 기본 사용자명으로 사용
- **이는 VM 내부의 OS 로그인 ID로도 고정됨** → 테스터들이 VM 접속 시 `ssh corp@10.10.40.X` 패턴 사용
- 보안적으로 취약: **회사명을 username으로 공개**하면 외부 노출 시 회사 식별 정보가 된다
- 팀 내 관행이라 즉시 변경은 어렵지만, CMP production 배포 시 이 관행을 그대로 유지하면 곤란

**권고**: CMP의 VM 프로비저닝 시 `ciuser`를 **일반명(예: `admin`, `ubuntu`)** 또는 **VM 목적별(예: `cmp-user`)**로 변경. 회사명 username 금지. 챕터 04 개발팀 협의 항목.

**다른 ciuser**:

- `aa`: 의미 없는 2글자 — 작성자 임의 (검토 대상)
- `test`: 9502, 99502 (clone) — 테스트 목적, OK

### 2.14 pmxcfs 상의 VM config 분포

`ls -la /etc/pve/nodes/pve-ndXX/qemu-server/` 결과.

| 노드 | .conf 파일 수                                                                               | qm list 결과 | 일치                         |
| ---- | ------------------------------------------------------------------------------------------- | ------------ | ---------------------------- |
| nd01 | 5 (100, 100002, 102, 104, 116)                                                              | 5            | ✓                            |
| nd02 | 4 (112, 115, 700, 810)                                                                      | 4            | ✓                            |
| nd03 | 9 (100010, 100015, 100021, 114, 702, 802, 803, 806, 807)                                    | 8            | ⚠ **.conf 9개, qm list 8개** |
| nd04 | 8 (100020, 105, 106, 113, 801, 805, 811, 9503)                                              | 7            | ⚠ **.conf 8개, qm list 7개** |
| nd05 | 10 (100001, 100003, 100004, 100005, 100006, 100011, 10020001, 10021001, 10025001, 10031001) | 17           | 🔴 **불일치 7건**            |

**nd05의 불일치 7건**이 특이. 본 데이터를 다시 보면:

- nd05 `qm list`에는 101, 103, 200, 201, 9502, 99502, 111069가 더 있지만 nd05의 `qemu-server/` 디렉터리 목록에 빠짐
- 이유: **`qm list`는 노드에 "소속"된 VM이 아니라 "관찰되는" VM을 표시**. 본 실행은 `pve-nd05`에서 했으므로 nd05의 모든 VM이 보이지만, 그중 일부는 다른 노드 소속일 수 있음 (`/etc/pve/nodes/*/qemu-server/` 전체 스캔)

즉 본 `ls` 결과는 **pve-nd05의 자체 config만** 보인 것. nd05의 qm list가 17개로 나온 것은 **pve-nd05에서 돌린 qm list가 다른 노드의 config도 볼 수 있어서**가 아니라, **nd05에 실제 소속된 VM이 17개**인 것이다. 이는 `ls`의 수집 명령이 범위가 좁았음을 의미.

#### 2.14.1 재수집 필요

nd01에서 `ls -la /etc/pve/nodes/*/qemu-server/ 2>&1 | head -60` 실행했는데, **실제로 모든 노드를 순회한 결과**가 나와야 하지만 본 데이터에는 nd01 결과 5건만 있음. `head -60`이 60라인 안에서 잘려 다른 노드가 안 보임. §7.1에 재수집 명령 박음.

### 2.15 Resource Pool — 1개 (비어있음)

```markdown
┌────────┬─────────┬─────────┐
│ poolid │ comment │ members │
╞════════╪═════════╪═════════╡
│ test   │         │         │
└────────┴─────────┴─────────┘
```

**Pool `test`가 1개 존재하나 members 비어있음**. 과거 누군가 pool을 만들고 VM을 잠시 넣었다가 뺀 흔적. 정리 가능 — 단독 작업 가능(L1×R1).

### 2.16 HTML injected description — 보안 관점

VM 102와 VM 115의 description이 URL-encoded 한글 + HTML 태그 포함.

```markdown
VM 102 description:
  통합테스트용 vm생성 - testerB(testerB-real)<h1>메모용 h1 태그입니다</h1>

VM 115 (HA comment):
  <h6 style="color:red">[통합테스트용 - testerB(testerB-real)] - HA 리소스 추가</h6>
```

**발견 사실**:

1. PVE의 description과 HA comment 필드 모두 **HTML을 허용** (적어도 저장)
2. 테스터가 **의도적으로 HTML 사용** — rendering되어 스타일 효과를 본다고 가정
3. 즉 PVE WebUI는 **HTML을 rendering**할 가능성이 매우 높음

**보안 함의**:

- 현재 사용은 단순 스타일링뿐이나, 이 경로로 `<script>` 주입이 가능하다면 **XSS (Cross-Site Scripting) 취약점**
- 테스터는 신뢰받는 내부 사용자이지만, 외부 공격자가 PVE WebUI를 탈취하면 이 경로로 추가 공격 가능
- 실측 필요: 실제 rendering되는지, escape되는지

권고: 챕터 08 보안 검토 항목으로 등록. 단 본 테스트팀 범위가 아닐 수 있음 — PVE 자체 보안 이슈는 개발자 커뮤니티·업스트림 보고 체계를 거친다.

---

## 3. 출력의 비정상 패턴과 조기 경보

### 3.1 정상 패턴

```markdown
[정상 1] qm list의 VM 개수가 pmxcfs /etc/pve/nodes/*/qemu-server/*.conf 수와 일치
[정상 2] 각 VM의 실행 프로세스(kvm)가 qm list의 STATUS와 일치
[정상 3] HA 등록 VM이 실제 해당 state로 유지됨
[정상 4] 템플릿 VM에 생성일 이후 config 변경 없음 (`qm template`은 one-way)
[정상 5] snapshot 목록이 `qm listsnapshot`에 정상 표시
```

### 3.2 의심 패턴

| #   | 패턴                                                          | 추정 원인                                  | 즉시 확인                          |
| --- | ------------------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| 1   | `qm list`에 없는데 `/run/qemu-server/{vmid}.*` 파일 존재      | 유령 VM 프로세스                           | `ps -ef \| grep 'kvm.*-id {vmid}'` |
| 2   | VM config에 `-incoming unix:.../migrate -S`가 프로세스에 보임 | 마이그레이션 중단 상태                     | 해결 또는 강제 종료                |
| 3   | description/comment에 `<script>` 또는 HTML                    | XSS 시도 또는 테스터 실수                  | WebUI 실측                         |
| 4   | 같은 이름의 VM이 2개 이상 존재                                | 명명 충돌 (특히 70-Prom01, 71-PromAgent01) | 정리 판단                          |
| 5   | HA state `ignored` + comment에 "test"                         | HA 등록 후 방치                            | HA config 정리                     |
| 6   | ciuser가 사내 정보 노출 (`corp`)                              | 부주의한 cloud-init 기본값                 | 일반명으로 변경                    |
| 7   | VM net0이 vmbr0(mgmt)인데 이름에 "WEB"/"DB" 등 서비스 VM      | 평면 설계 실수                             | 평면 이전                          |
| 8   | VM의 pmxcfs config mtime이 매우 최근인데 실행 안 됨           | 누군가 방금 편집                           | 소유자 추적                        |
| 9   | template VM의 디스크가 read-write (Attr `-wi-ao----`의 w)     | 드물게 발생                                | `qm rescan`                        |
| 10  | tag 값이 공백                                                 | 의도적 빈값인지 실수인지 불명              | 소유자 확인                        |

### 3.3 즉시 중단 신호

#### 신호 A: config 파일 급증

```bash
ls /etc/pve/nodes/*/qemu-server/*.conf | wc -l
```

짧은 시간에 파일 수가 급증하면 **자동화 스크립트 오동작** 가능. 정상 환경에서는 테스터가 수동으로 만들므로 시간당 1~5건 이하.

#### 신호 B: HA service state 충돌

```bash
ha-manager status | grep 'service vm:' | awk '{print $2, $3, $4}' | \
  awk '{count[$1]++} END {for (s in count) if (count[s] > 1) print "DUPLICATE:", s}'
```

같은 VMID가 여러 노드에 HA 등록된 상태면 장애 시 중복 기동 가능.

#### 신호 C: template이 아닌데 clone origin으로 사용됨

```bash
# template이 아닌 VM의 disk가 다른 VM의 linked clone으로 쓰이면 비정상
# (확인 명령은 복잡. 보통 WebUI 또는 별도 스크립트)
```

본 환경은 linked clone 거의 사용 안 하는 듯 보이나, 향후 증가 시 검토.

---

## 4. 이 영역의 CMP 테스트 대분류와 시나리오

### 4.1 CRUD 기능 검증

#### 시나리오 4.1.1 — 41 VM 리스트 표시 정합성

CMP UI의 VM 리스트가 실제 41개와 일치하는가.

- 진입점: `pvesh get /cluster/resources --type vm`
- 사전 정찰: §2.1, §2.14
- 검증 항목:
  - 총 VM 수 = 41
  - running/stopped 구분 정확
  - 템플릿 구분 표시 (또는 별도 탭)
  - VM 809 같은 **orphaned disk**는 어떻게 표시되는가? (disk 탭에는 보이나 VM 리스트엔 없어야 함)

#### 시나리오 4.1.2 — VM 생성·삭제·클론 기본 동작

- template에서 clone → 새 VM 생성
- VM 삭제 → config + disk 정리
- VM 중지 → STATUS 변경

각 작업이 CMP UI를 통해 원활하게 동작하는가. 본 환경의 clone 시 **고유 VMID 자동 할당 로직**이 있는가 (1~99999 중 비어있는 번호 자동 선택).

#### 시나리오 4.1.3 — Snapshot 관리

- snapshot 생성 (with/without RAM)
- snapshot 복원 (rollback — L2×R3, 확인 절차 필요)
- snapshot 삭제

VM 702의 3 snapshot을 모두 삭제하는 실험에 CMP를 사용 가능한가.

### 4.2 스테이징 워크플로우

#### 시나리오 4.2.1 — VM 마이그레이션 (정상 경로)

shared storage VM을 노드 간 이동. 본 환경의 이동 가능 VM 분류:

- **live migration 가능**: `pve-nd06-nfs` 디스크 VM (대다수)
- **오프라인 마이그레이션만**: `local-zfs` 디스크 VM (VM 112, 112-test, 9502 등)
- **마이그레이션 불가**: VM 100015 (node03-dir)

#### 시나리오 4.2.2 — 마이그레이션 중단 복구 시나리오

VM 802의 현 상태를 참조. 의도적으로 마이그레이션을 중단한 후 CMP가:

- 중단 상태를 정확히 표시하는가
- 재시도 또는 롤백 옵션을 제공하는가
- **"중단 상태로 며칠 방치"를 경고하는가** (본 환경처럼 8일 방치가 발생할 수 있음)

### 4.3 위험 시나리오·에러 처리

#### 시나리오 4.3.1 — 존재하지 않는 VM의 조작

VM 809 (orphaned disk)에 대한 조작 요청. CMP가:

- "VM 없음" 에러 정확히 표시
- orphaned disk 존재는 별도 알림 (정리 유도)

#### 시나리오 4.3.2 — 잘못된 스토리지 선택 (node03-dir)

새 VM 생성 시 `node03-dir` 스토리지를 선택할 수 있는가. 선택되면 마이그레이션 불가 경고가 나오는가.

#### 시나리오 4.3.3 — 디스크 용량 초과 요청

`local-zfs` 여유가 10GiB인 노드에 100GiB 디스크 요청. CMP가 사전에 거부하는가.

### 4.4 클러스터 일관성

#### 시나리오 4.4.1 — 동일 이름 VM 식별

VM 100020 (67-Prom01)과 VM 10020001 (70-Prom01). 이름이 같아 CMP UI에서 혼동 가능. CMP가:

- VMID 병기
- 노드 정보 명시
- 중복 이름 경고

#### 시나리오 4.4.2 — 5노드 간 config 일관성

pmxcfs 구조상 config는 5노드에 자동 복제. 본 환경에 일시적 불일치가 있는가.

- 챕터 01의 "설정 변경 중인 신호"(config_version 변동)와 교차 확인

---

## 5. 정찰 ↔ 테스트 단계 역방향 매핑

| 수행하려는 액션                        | 선행 정찰 (본 챕터)                     | 추가 선행            |
| -------------------------------------- | --------------------------------------- | -------------------- |
| VM 처분(삭제/정지)                     | §2.6 test 포함 여부 + §0.1 규칙         | **소유자 확인 필수** |
| VM 마이그레이션 (챕터 04 연계)         | §2.5 네트워크 평면 + §2.9 스토리지 제약 | 챕터 03 storage      |
| VM 생성 (테스트)                       | §2.4 템플릿 선택                        | 챕터 02 노드 부하    |
| HA 등록                                | §2.3 현재 HA 목록                       | 챕터 01 정족수       |
| VM 내부 작업 (예: Postgres 업그레이드) | §2.12 snapshot 상태                     | —                    |

---

## 6. 정찰 결과를 산출물로 정리하는 양식

### 6.1 산출물 — VM 인벤토리 카드 (주간 갱신)

```markdown
# VM 인벤토리 카드 — YYYY-MM-DD HH:MM

## 5노드 VM 개수 요약
| 노드 | 실행 중 | 정지 | 템플릿 | 합계 |

## test 규칙 분류
- 처분 가능 (test 포함): N건
- 보존 (test 없음): N건
- 확인 필요: N건

## HA 등록 VM
| VMID | 상태 | 작성자 | state |

## 이번 주 새 VM / 삭제 VM
- 생성: VMID, 이름, 노드, 작성자
- 삭제: VMID, 이름, 사유

## 이상 상태
- 유령 VM (process 있고 config 없음): 
- 마이그레이션 중단 방치: 
- snapshot 오래 방치:
```

### 6.2 VM 처분 제안서 양식 (소유자 확인용)

```markdown
# VM 처분 제안 — YYYY-MM-DD

## 대상 VM
- VMID: ___
- 이름: ___
- 현재 상태: ___

## 처분 근거
- test 규칙: [포함 / 없음]
- 작성자: [확인됨 / 미상]
- 마지막 활동: [___ 일 전]
- 리소스 사용: CPU ___, Mem ___, Disk ___

## 제안 조치
- [ ] 즉시 삭제
- [ ] 정지 후 1주 대기 (소유자 반응 없으면 삭제)
- [ ] 다른 스토리지로 이전 (사유: ___)
- [ ] 보류 (사유: ___)

## 격자 평가
- Blast Radius: L___
- Reversibility: R___

## 소유자 확인
- 문의 경로: [Slack 전체 / 개별 DM / 대면]
- 답변 기한: YYYY-MM-DD
```

---

## 7. 본 챕터에서 발견된 잔여 정비·추적 항목

| #   | 발견 항목                                       | 인계                  | 우선순위 | 상태                             |
| --- | ----------------------------------------------- | --------------------- | -------- | -------------------------------- |
| 1   | **VM 802 (nd03) 마이그레이션 중단 8일 방치**    | 본 챕터 정비 대상     | **P0**   | 프로세스 종료 + 디스크 정리 권고 |
| 2   | **VM 809 유령 VM — orphaned disk 2건**          | 본 챕터 정비 대상     | **P1**   | qemu-img info 확인 후 정리       |
| 3   | VM 112 작성자 추적 필요                         | 챕터 07 + 팀 합의     | P1       | 로그 분석 + Slack 질의           |
| 4   | VM 100015 (PostgresDB) node03-dir 이전 검토     | 개발팀 협의           | P2       | testerA 소유                     |
| 5   | VM 101 (bani) 작성자 확인 필요                  | 팀 합의               | P2       | USB 매핑 포함                    |
| 6   | 같은 이름 Prom01 (100020 vs 10020001) 중복      | 개발팀 협의           | P2       | 정리 판단                        |
| 7   | 같은 이름 PromAgent01 (100021 vs 10021001) 중복 | 개발팀 협의           | P2       | 정리 판단                        |
| 8   | ciuser에 `corp` (회사명) 14건 VM                | 개발팀 협의 + 챕터 08 | P2       | CMP 프로비저닝 관행              |
| 9   | VM description에 HTML 태그 + PVE rendering 여부 | 챕터 08 보안 검토     | P2       | XSS 가능성 실측                  |
| 10  | 14개 VM이 mgmt 평면(vmbr0)에 연결               | 챕터 05 연계          | P1       | 평면 이전                        |
| 11  | Pool `test` 비어있음                            | 본 챕터               | P3       | 단독 삭제 가능                   |
| 12  | VM 702의 3 snapshot (3월 실험 종료)             | 본 챕터 or 팀         | P2       | 소유자 확인 후 정리              |
| 13  | HA state `ignored`인 VM 9503                    | 본 챕터               | P3       | HA에서 제거 권고                 |
| 14  | HA comment의 HTML 태그 (`<h6>`)                 | 챕터 08               | P2       | XSS 항목                         |
| 15  | tag 시스템 거의 미사용                          | 챕터 04               | P3       | 명명 규약 통합 논의              |
| 16  | 템플릿 `-tp` 접미사 관행                        | 챕터 04               | P3       | 규약화 여부                      |
| 17  | VM 111069 "74-disk" 수집 시점 107초 전 생성     | —                     | —        | 기록만 (정상 활동)               |

### 7.1 본 챕터에서 단독 처리 가능한 항목

| 항목                                    | 격자  | 조건                                                    |
| --------------------------------------- | ----- | ------------------------------------------------------- |
| Pool `test` 삭제                        | L1×R1 | 즉시 가능 (비어있음)                                    |
| VM 802 프로세스 강제 종료               | L2×R3 | **소유자 확인 후** (프로세스만 종료, 디스크 보존)       |
| VM 809 디스크 내용 확인 (qemu-img info) | L1×R1 | 즉시 가능 (read-only 확인)                              |
| VM 702 snapshot 정리                    | L2×R3 | **소유자 확인 필수** (작성자가 여전히 사용 중일 가능성) |

### 7.2 본 수집 명령의 결함

1. **nd03 `brctl show` 절단 (챕터 05 §7.1)** — 여전히 미해결
2. **`ls /etc/pve/nodes/*/qemu-server/`의 `head -60` 절단** — 본 챕터 §2.14에서 재수집 필요

재수집 명령:

```bash
for n in pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05; do
  echo "=== [$n] qemu-server/*.conf ==="
  ssh "$n" "ls -la /etc/pve/nodes/$n/qemu-server/*.conf 2>/dev/null | wc -l"
done

# 그리고 완전한 dump:
ssh pve-nd01 "find /etc/pve/nodes/ -name '*.conf' -printf '%p %TY-%Tm-%Td %TH:%TM\n' | sort"
```

### 7.3 작성자 추적 전략 종합

본 챕터에서 **작성자 미상 VM이 다수**다. 팀 내 암묵 규약만 있는 환경에서 작성자 추적의 실무 전략:

1. **HA comment가 있는 VM**: 즉시 확인 (6건)
2. **description에 이름 박혀있는 VM**: 확인 가능 (VM 100015 등)
3. **pmxcfs config mtime**: 가장 최근 편집 시각 기준 팀 전체 질의로 좁힘
4. **PVE access log**: 해당 시각 PVE WebUI 로그인 사용자 확인 (챕터 07)
5. **Slack 전체 질의**: "VMID N의 작성자 응답 요청" — 24시간 응답 없으면 처분 후보로 간주

5번은 마지막 수단이지만 가장 효율적. 본 환경 테스터 5명 + 개발팀 수 명 규모에서 Slack 메시지 1건으로 대부분 해결 가능.

---

## 부록 A. 명령 치트 시트

```bash
NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"

# === 5노드 VM 개수 빠른 체크 ===
for n in $NODES; do
  cnt=$(ssh "$n" "qm list 2>/dev/null | tail -n +2 | wc -l")
  echo "[$n] VM: $cnt"
done

# === 'test' 포함/미포함 분류 ===
ssh pve-nd01 "for n in $NODES; do \
                qm list 2>/dev/null | tail -n +2; \
              done | awk '{if (\$2 ~ /test/) test++; else notest++} END {print \"test:\", test, \"notest:\", notest}'"

# === 유령 VM 탐지 ===
for n in $NODES; do
  ssh "$n" "ls /var/run/qemu-server/*.pid 2>/dev/null | while read pid; do \
              vmid=\$(basename \$pid .pid); \
              [ ! -f /etc/pve/nodes/\$(hostname)/qemu-server/\$vmid.conf ] && echo '[GHOST] '\$vmid; \
            done"
done

# === 마이그레이션 중단 상태 탐지 ===
for n in $NODES; do
  ssh "$n" "ps -ef | grep -E 'kvm.*-incoming unix:.*migrate -S' | grep -v grep"
done
```

## 부록 B. 다음 챕터로의 인계

| 본 챕터 발견                       | 챕터 07 (로그 시스템) 처리                      |
| ---------------------------------- | ----------------------------------------------- |
| VM 112 작성자 추적                 | PVE access log에서 2026-04-22 mtime 시각 사용자 |
| VM 802 마이그레이션 실패 시점 로그 | 2026-04-16 13:18 전후 pvedaemon log             |

| 본 챕터 발견                  | 챕터 08 (위험 매트릭스) 처리 |
| ----------------------------- | ---------------------------- |
| VM description/comment의 HTML | XSS 가능성 실측              |
| `ciuser: corp` 관행           | 정보 노출 리스크             |
| VM 802 방치                   | 마이그레이션 timeout 정책    |

| 본 챕터 발견           | 챕터 09 (Pre-test 체크리스트) 처리 |
| ---------------------- | ---------------------------------- |
| 처분 대상 VM 24건      | STN 전 정리 체크                   |
| 평면 혼용 VM 14건      | 평면 이전 체크                     |
| orphaned disk (VM 809) | 스토리지 cleanup 체크              |

## 부록 C. 참고 자료

| 주제                  | URL                                                      |
| --------------------- | -------------------------------------------------------- |
| Proxmox VE qm command | https://pve.proxmox.com/pve-docs/qm.1.html               |
| PVE HA Manager        | https://pve.proxmox.com/pve-docs/chapter-ha-manager.html |
| Cloud-init in Proxmox | https://pve.proxmox.com/wiki/Cloud-Init_Support          |
| Proxmox pmxcfs        | https://pve.proxmox.com/pve-docs/chapter-pmxcfs.html     |
| VM Template vs Clone  | https://pve.proxmox.com/wiki/VM_Templates_and_Clones     |

---

> **다음 챕터**: `07-log-system-anatomy.md` — journald, PVE log 구조, access log, 그리고 본 챕터의 "작성자 추적" 실전 방법을 다룬다. 챕터 02 §7의 nd04 ROOT 12GiB 로그 축적 의심도 여기서 해소.
