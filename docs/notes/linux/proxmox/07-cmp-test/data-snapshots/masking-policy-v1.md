---
title: "마스킹 정책 (Masking Policy) v1"
date: 2026-04-23
lastmod: 2026-04-23
author: "Davi"
description: "CMP Pre-Test Reconnaissance Handbook 시리즈 전체에 일관 적용되는 데이터 마스킹 정책. 사내 정보 비식별화와 동시에 자원 간 식별 가능성을 보존한다."
slug: "masking-policy-v1"
section: "notes"
category: "proxmox/cmp-test/data-snapshots"
tags: [handbook, masking, anonymization, policy]
order: 1
status: "active"
draft: false
search: false
toc: true
version: "v1"
---

## 0. 정책 목적

본 문서는 CMP Pre-Test Reconnaissance Handbook 시리즈 전체에 적용되는 마스킹 정책을 정의한다. 두 가지 동시 목표를 갖는다.

1. **사내 식별 정보 제거** — 회사 도메인, 사내 사용자 ID, 사설 IP, 인증서 fingerprint 등 외부 노출 시 불편을 야기할 수 있는 항목을 가린다.
2. **분석 가능성 보존** — 마스킹 후에도 자원과 자원, 노드와 노드, 사용자와 사용자가 서로 구분 가능해야 한다. 즉 1:1 매핑을 유지한다. 단순히 모두 "X"로 가리는 방식은 핸드북의 분석 가치를 무너뜨리므로 금지한다.

핸드북의 모든 챕터에 등장하는 명령 출력·설정 파일·자원명은 본 정책의 매핑을 따른다. 매핑이 변경되거나 신규 항목이 추가될 때 본 문서가 갱신된다.

---

## 1. 매핑 표

### 1.1 사용자 ID

| 원본 ID    | 마스킹 ID  | 비고                              |
| ---------- | ---------- | --------------------------------- |
| `jykim`    | `testerA`  | 작성 자원 5건 (iSCSI/LVM 다수)    |
| `ksy0724`  | `testerB`  | 작성 자원 7건 (다양한 타입)       |
| `pgw`      | `testerC`  | 작성 자원 3건                     |
| `lmh0423`  | `testerD`  | 작성 자원 1건                     |
| (작성자 미상, 자원명에 `0420` 형태 포함) | `testerE`  | 자원명만 식별 가능, 작성자 추적 불가 |

`testerA`~`testerE`는 본 핸드북 시리즈 전체에서 동일 인물을 가리킨다. 향후 신규 테스터 진입 시 `testerF` 이후로 순차 부여한다.

### 1.2 도메인

| 원본               | 마스킹              | 비고                                   |
| ------------------ | ------------------- | -------------------------------------- |
| `letech.kr`        | `corp.local`        | 사내 도메인                            |
| `rbauman.com`      | `example.com`       | 외부 NTP 서비스 도메인                 |
| `com.truenas`      | `com.example`       | iSCSI IQN 내 TrueNAS 식별자            |
| `org.freenas`      | `org.example`       | iSCSI IQN 내 FreeNAS 레거시 식별자     |

### 1.3 IP 대역

평면별 두 번째 옥텟을 보존하여 평면 식별 가능성을 유지한다. 첫 번째와 두 번째 옥텟만 변환.

| 평면          | 원본 대역         | 마스킹 대역       | 비고                              |
| ------------- | ----------------- | ----------------- | --------------------------------- |
| **mgmt**      | `10.10.10.0/24`   | `10.99.10.0/24`   | Web UI, SSH, CMP API 진입점       |
| **corosync0** | `10.10.20.0/24`   | `10.99.20.0/24`   | corosync ring0 전용               |
| **corosync1** | `10.10.30.0/24`   | `10.99.30.0/24`   | corosync ring1 백업 + storage     |
| **vm**        | `10.10.40.0/24`   | `10.99.40.0/24`   | VM 게스트 + PBS                   |

마지막 옥텟(노드 번호 `.11`~`.15`, TrueNAS `.16`, PBS `.100`)은 그대로 보존된다.

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
| `36589cfc...`로 시작하는 iSCSI WWID (예: `36589cfc000000b79878caaecee9e8b00`)                                                            | (그대로 유지)                                                                                                                            | 자원 distinct 식별자, 보안 영향 미미하므로 보존 |

### 1.6 자원명 일괄 치환 규칙

스토리지·VM·잡 자원명에 사용자 ID가 포함된 경우, 위 §1.1의 매핑에 따라 부분 치환한다. 예시:

| 원본                                       | 마스킹                                       |
| ------------------------------------------ | -------------------------------------------- |
| `truenas-iscsi-jykim`                      | `truenas-iscsi-testerA`                      |
| `iscsi-test-lvm-ksy0724`                   | `iscsi-test-lvm-testerB`                     |
| `cmptest-iscsi-window-jykim`               | `cmptest-iscsi-window-testerA`               |
| `nfs-test-pgw`                             | `nfs-test-testerC`                           |
| `nfs-test-lmh0423`                         | `nfs-test-testerD`                           |
| `nfs-test-0420`                            | `nfs-test-testerE`                           |
| `storage-test-0420` (NFS export path 일부) | `storage-test-testerE`                       |

자원명 외의 부분(prefix/suffix)은 그대로 유지한다.

### 1.7 마스킹 대상이 아닌 항목

다음 항목은 의도적으로 마스킹하지 않는다.

- **노드 호스트명 `pve-nd0X`**: 핸드북의 핵심 식별자. 회사 비밀이 아님.
- **노드 IP의 마지막 옥텟**: 노드 번호와의 매핑 직관 유지.
- **iSCSI WWID 본체 (36589cfc...)**: 자원 distinct 식별자로서 유지 가치 있음.
- **클러스터 이름 `pve-cl01`**: 일반적인 명명 패턴.
- **포트 번호 (8006, 8007 등)**: 표준 포트.

---

## 2. sed 일괄 치환 스크립트

신규 출력을 본문에 인용할 때 다음 스크립트로 일괄 치환한다.

```bash
#!/bin/bash
# 사용: ./mask.sh <대상파일>
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

## 3. 정책 갱신 이력

| 버전 | 일시            | 변경 내용                                | 작성자 |
| ---- | --------------- | ---------------------------------------- | ------ |
| v1   | 2026-04-23      | 최초 작성. 5명 테스터 + 5노드 + 4평면 매핑 | Davi   |

---

## 4. 신규 항목 추가 절차

새로운 사용자가 추가되거나, 신규 자원명에 식별 가능 패턴이 발견되면 다음 절차로 본 정책을 갱신한다.

1. §1의 매핑 표에 신규 항목 추가 (다음 알파벳 순 또는 다음 번호 부여)
2. §2의 sed 스크립트에 치환 규칙 추가
3. §3의 갱신 이력에 변경 내용 기록 (버전 증가)
4. 기존에 작성된 모든 챕터 파일에 신규 치환 규칙 일괄 적용
5. 검증 후 핸드북 시리즈 전체 push

이 절차는 핸드북의 일관성을 유지하기 위해 반드시 따른다. 임의로 한 챕터에서만 다르게 마스킹하면 시리즈 전체 분석이 무너진다.
