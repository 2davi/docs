---
title: "마스킹 정책 (Masking Policy) v2"
date: 2026-04-23
lastmod: 2026-04-23
author: "Davi"
description: "CMP Pre-Test Reconnaissance Handbook 시리즈 전체에 일관 적용되는 데이터 마스킹 정책. v2에서 명령 블록과 출력 인용 블록의 분리 원칙을 추가한다."
slug: "masking-policy-v2"
section: "notes"
category: "linux/proxmox/cmp-test/data-snapshots"
tags: [handbook, masking, anonymization, policy]
order: 1
status: "active"
draft: false
search: false
toc: true
version: "v2"
---

## 0. 정책 목적

본 문서는 CMP Pre-Test Reconnaissance Handbook 시리즈 전체에 적용되는 마스킹 정책을 정의한다. 두 가지 동시 목표를 갖는다.

1. **사내 식별 정보 제거** — 회사 도메인, 사내 사용자 ID, 사설 IP, 인증서 fingerprint 등 외부 노출 시 불편을 야기할 수 있는 항목을 가린다.
2. **분석 가능성 + 실행 가능성 동시 보존** — 마스킹 후에도 자원과 자원, 노드와 노드, 사용자와 사용자가 서로 구분 가능해야 한다(분석). 동시에 핸드북 본문의 명령 코드는 마스킹 IP가 박혀 있어서는 안 된다(실행).

핸드북의 모든 챕터에 등장하는 명령 출력·설정 파일·자원명은 본 정책의 매핑을 따른다. 매핑이 변경되거나 신규 항목이 추가될 때 본 문서가 갱신된다.

---

## 1. 매핑 표 (출력 인용용)

본 절의 매핑은 **출력 인용 블록(quoted output)**에만 적용된다. 명령 블록의 처리 원칙은 §2 참조.

### 1.1 사용자 ID

| 원본 ID    | 마스킹 ID  | 비고                              |
| ---------- | ---------- | --------------------------------- |
| `jykim`    | `testerA`  | 작성 자원 5건 (iSCSI/LVM 다수)    |
| `ksy0724`  | `testerB`  | 작성 자원 7건 (다양한 타입)       |
| `pgw`      | `testerC`  | 작성 자원 3건                     |
| `lmh0423`  | `testerD`  | 작성 자원 1건                     |
| (작성자 미상, 자원명에 `0420` 형태 포함) | `testerE`  | 자원명만 식별 가능, 작성자 추적 불가 |
| `kcy0122`  | `testerSelf` | **본 핸드북 작성자**. CMP 테스트 자원 대량 보유 (`cmptest-*-node-target-kcy0122` 등) |

`testerA`~`testerE`는 본 핸드북 시리즈 전체에서 동일 인물을 가리킨다. `testerSelf`는 핸드북 작성자 본인으로, 다른 테스터들과 명시적으로 구별한다. 향후 신규 테스터 진입 시 `testerF` 이후로 순차 부여한다.

### 1.2 도메인

| 원본               | 마스킹              | 비고                                   |
| ------------------ | ------------------- | -------------------------------------- |
| `letech.kr`        | `corp.local`        | 사내 도메인                            |
| `rbauman.com`      | `example.com`       | 외부 NTP 서비스 도메인                 |
| `com.truenas`      | `com.example`       | iSCSI IQN 내 TrueNAS 식별자            |
| `org.freenas`      | `org.example`       | iSCSI IQN 내 FreeNAS 레거시 식별자     |

### 1.3 IP 대역

평면별 두 번째 옥텟을 보존하여 평면 식별 가능성을 유지한다. 첫 번째와 두 번째 옥텟만 변환.

| 평면          | 원본 대역         | 마스킹 대역 (출력 인용용) | 비고                              |
| ------------- | ----------------- | ------------------------ | --------------------------------- |
| **mgmt**      | `10.10.10.0/24`   | `10.99.10.0/24`          | Web UI, SSH, CMP API 진입점       |
| **corosync0** | `10.10.20.0/24`   | `10.99.20.0/24`          | corosync ring0 전용               |
| **corosync1** | `10.10.30.0/24`   | `10.99.30.0/24`          | corosync ring1 백업 + storage     |
| **vm**        | `10.10.40.0/24`   | `10.99.40.0/24`          | VM 게스트 + PBS                   |

> **중요**: 위 마스킹 대역은 **출력 인용 블록에만** 사용된다. 실행 가능 명령 블록에서는 §2의 원칙을 따른다.

### 1.4 호스트명

| 원본                  | 마스킹                | 비고                  |
| --------------------- | --------------------- | --------------------- |
| `pve-nd01` ~ `pve-nd05` | (그대로)              | 핵심 식별자 유지      |
| `pve-nd05.letech.kr`  | `pve-nd05.corp.local` | 도메인만 마스킹       |

### 1.5 인증서 / Hex 식별자

| 원본                                                                                                                                   | 마스킹                                                                                                                                   | 비고                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `ad:ac:6d:b6:cb:e9:5d:8e:9d:ca:5f:4c:44:98:4b:7a:7f:ee:bf:cc:8b:dc:89:80:08:f1:82:2d:8e:79:5c:83`                                       | `AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00`                                         | PBS TLS fingerprint        |
| `9EF7CA67`                                                                                                                              | `AABBCCDD`                                                                                                                                | chrony reference (hex IP)  |
| `36589cfc...`로 시작하는 iSCSI WWID                                                                                                     | (그대로 유지)                                                                                                                            | 자원 distinct 식별자, 보안 영향 미미 |

### 1.6 자원명 일괄 치환

자원명에 사용자 ID가 포함된 경우 §1.1의 매핑에 따라 부분 치환. 예시:

| 원본                                       | 마스킹                                       |
| ------------------------------------------ | -------------------------------------------- |
| `truenas-iscsi-jykim`                      | `truenas-iscsi-testerA`                      |
| `iscsi-test-lvm-ksy0724`                   | `iscsi-test-lvm-testerB`                     |
| `nfs-test-pgw`                             | `nfs-test-testerC`                           |
| `nfs-test-lmh0423`                         | `nfs-test-testerD`                           |
| `nfs-test-0420`                            | `nfs-test-testerE`                           |
| `cmptest-iscsi-node-target-kcy0122`        | `cmptest-iscsi-node-target-testerSelf`       |
| `cmptest-zfs-node-target-kcy0122`          | `cmptest-zfs-node-target-testerSelf`         |

### 1.7 마스킹 대상이 아닌 항목

다음 항목은 의도적으로 마스킹하지 않는다.

- **노드 호스트명 `pve-nd0X`**: 핸드북의 핵심 식별자. 회사 비밀이 아님.
- **노드 IP의 마지막 옥텟**: 노드 번호와의 매핑 직관 유지.
- **iSCSI WWID 본체 (36589cfc...)**: 자원 distinct 식별자로서 유지 가치 있음.
- **클러스터 이름 `pve-cl01`**: 일반적인 명명 패턴.
- **포트 번호 (8006, 8007 등)**: 표준 포트.

---

## 2. 명령 코드와 출력 인용의 분리 원칙 (v2 신규)

### 2.1 사고 사례 — 정책 v1의 빈틈

본 정책 v2는 챕터 01 §7.1의 정비 스크립트가 마스킹 IP(`10.99.10.X`)를 명령 블록에 그대로 박았다가, 핸드북 사용자가 그 명령을 실제 환경에서 실행할 때 작동하지 않은 사고에서 도출되었다.

해당 사례에서 명령은 두 가지 결함이 겹쳐 사고를 면했다.

1. **논리 결함**: `for line in $MULTI_LINE_VAR`이 word splitting으로 line 단위 분리에 실패하여 실제 echo가 한 번도 실행되지 않음
2. **정책 결함 (v1)**: 마스킹 IP `10.99.10.X`가 명령 블록에 박혀 있어, 만약 실행됐다면 의미 없는 fake IP가 실제 `/etc/hosts`에 들어갔을 것

논리 결함이 정책 결함을 가려준 우연이다. 정책 결함 자체는 v2에서 명시적으로 막는다.

### 2.2 원칙

본 핸드북 본문에는 두 종류의 IP가 등장한다.

1. **출력 인용 블록(quoted output)**: 명령 실행 결과를 본문에 그대로 박은 부분. §1.3의 매핑에 따라 마스킹된 IP가 표시된다.
2. **실행 가능 명령 블록(executable code)**: 핸드북 사용자가 그대로 복사하여 실행할 수 있는 스크립트. **마스킹된 IP를 사용해서는 안 된다.**

같은 IP가 같은 챕터의 인용 블록과 명령 블록에서 다르게 표현될 수 있다. 출력 인용에서는 `10.99.10.11`로 보이는 노드의 IP가, 명령 블록에서는 환경 변수나 동적 추출 결과로 표현된다. 이 비대칭은 정책상 의도된 것이며, 본 절이 그 비대칭의 근거다.

### 2.3 명령 블록의 IP 처리 방식

다음 세 가지 중 하나를 채택한다. 권장 우선순위는 **A > B > C**이다.

#### 방식 A: 동적 추출 (최우선 권장)

클러스터 메타에서 IP를 자동 추출한다. 사용자가 IP를 잘못 입력할 위험 자체가 없다.

```bash
# /etc/pve/.members에서 노드 IP 동적 추출 (mgmt 평면)
declare -A NODE_IPS
while IFS=$'\t' read -r name ip; do
  NODE_IPS[$name]=$ip
done < <(jq -r '.nodelist | to_entries[] | "\(.key)\t\(.value.ip)"' /etc/pve/.members)

# 추출 결과 확인
for k in "${!NODE_IPS[@]}"; do
  echo "  $k -> ${NODE_IPS[$k]}"
done
```

**전제 조건**: `jq` 설치, bash 4+ (associative array 지원), `/etc/pve` 마운트 정상.

#### 방식 B: 환경 변수 placeholder

스크립트 헤드에 변수 정의 블록을 두고, 사용자가 자기 환경 IP를 채워 넣는다.

```bash
# ====== 실행 전 환경 변수 설정 (실제 IP로 치환) ======
declare -A NODE_IPS=(
  [pve-nd01]="<실제 mgmt IP>"
  [pve-nd02]="<실제 mgmt IP>"
  [pve-nd03]="<실제 mgmt IP>"
  [pve-nd04]="<실제 mgmt IP>"
  [pve-nd05]="<실제 mgmt IP>"
)
# ====================================================
```

**전제 조건**: 사용자가 자기 환경 IP를 정확히 입력. placeholder를 그대로 두고 실행하면 즉시 명백한 에러로 실패하므로 사고로 이어지지 않는다.

#### 방식 C: 하드코딩 + 명시 주석 (단순 예시 한정)

단순 예시 명령(실제 실행을 의도하지 않는 것)에서는 마스킹 IP를 쓰되, 코드 블록 위에 명시 주석을 단다.

```bash
# === 아래 명령은 단순 예시 — 실행 시 IP를 실제 환경에 맞게 치환 필요 ===
ssh root@10.99.10.11 "uptime"
```

이 방식은 README 수준의 매우 단순한 예시에만 사용. 정비 스크립트 같은 다단계 작업에는 절대 사용하지 않는다.

### 2.4 본 정책 v2의 적용 범위

- **소급 적용**: v1 시점에 작성된 챕터 본문 중 명령 블록에 마스킹 IP가 박힌 곳은 일괄 정정. 챕터 01 §7.1이 첫 적용 사례.
- **신규 챕터**: 작성 시점부터 v2 원칙 준수.
- **출력 인용 블록**: §1의 매핑 그대로 적용 (변경 없음).

---

## 3. sed 일괄 치환 스크립트 (출력 인용용)

본 스크립트는 **수집된 출력 텍스트**를 마스킹할 때 사용한다. 명령 블록 작성 시에는 사용하지 않는다.

```bash
#!/bin/bash
# 사용: ./mask.sh <대상파일>
# 주의: 본 스크립트는 출력 인용 텍스트만 마스킹한다.
#       명령 블록에는 적용하지 말 것 (§2 참조).

TARGET="$1"
[ -z "$TARGET" ] && { echo "Usage: $0 <file>"; exit 1; }

# 1) 사용자 ID — unique 순 (충돌 방지)
sed -i 's/ksy0724/testerB/g' "$TARGET"
sed -i 's/lmh0423/testerD/g' "$TARGET"
sed -i 's/jykim/testerA/g'   "$TARGET"
sed -i 's/\bpgw\b/testerC/g' "$TARGET"
sed -i 's/nfs-test-0420/nfs-test-testerE/g' "$TARGET"
sed -i 's/storage-test-0420/storage-test-testerE/g' "$TARGET"

# 2) 도메인
sed -i 's/letech\.kr/corp.local/g' "$TARGET"
sed -i 's/rbauman\.com/example.com/g' "$TARGET"
sed -i 's/com\.truenas/com.example/g' "$TARGET"
sed -i 's/org\.freenas/org.example/g' "$TARGET"

# 3) IP 대역 (평면별 두 번째 옥텟 보존)
sed -i 's/10\.10\.10\./10.99.10./g' "$TARGET"
sed -i 's/10\.10\.20\./10.99.20./g' "$TARGET"
sed -i 's/10\.10\.30\./10.99.30./g' "$TARGET"
sed -i 's/10\.10\.40\./10.99.40./g' "$TARGET"

# 4) Hex 인코딩 IP (chrony reference)
sed -i 's/9EF7CA67/AABBCCDD/g' "$TARGET"

# 5) PBS fingerprint
sed -i 's/ad:ac:6d:b6:cb:e9:5d:8e:9d:ca:5f:4c:44:98:4b:7a:7f:ee:bf:cc:8b:dc:89:80:08:f1:82:2d:8e:79:5c:83/AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00/g' "$TARGET"

# 검증
echo "=== 마스킹 누락 검증 ==="
grep -nE 'jykim|ksy0724|pgw|lmh0423|letech\.kr|rbauman|9EF7CA67' "$TARGET" \
  && echo "[FAIL] 누락 항목 발견" \
  || echo "[OK] 모든 항목 마스킹됨"
```

---

## 4. 정책 갱신 이력

| 버전 | 일시            | 변경 내용                                                                  | 작성자 |
| ---- | --------------- | -------------------------------------------------------------------------- | ------ |
| v1   | 2026-04-23      | 최초 작성. 5명 테스터 + 5노드 + 4평면 매핑                                 | Davi   |
| v2   | 2026-04-23      | §2 추가: 명령 블록과 출력 인용 분리 원칙. 챕터 01 §7.1 사고 사례 반영      | Davi   |

---

## 5. 신규 항목 추가 절차

새로운 사용자가 추가되거나, 신규 자원명에 식별 가능 패턴이 발견되면 다음 절차로 본 정책을 갱신한다.

1. §1의 매핑 표에 신규 항목 추가 (다음 알파벳 순 또는 다음 번호 부여)
2. §3의 sed 스크립트에 치환 규칙 추가
3. §4의 갱신 이력에 변경 내용 기록 (버전 증가)
4. 기존에 작성된 모든 챕터 파일에 신규 치환 규칙 일괄 적용
5. **§2 원칙 위반 여부 검증**: grep으로 명령 블록 안에 마스킹 IP가 박힌 곳이 없는지 확인
6. 검증 후 핸드북 시리즈 전체 push

이 절차는 핸드북의 일관성을 유지하기 위해 반드시 따른다.
