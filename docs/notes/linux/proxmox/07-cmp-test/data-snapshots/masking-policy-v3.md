---
title: "마스킹 정책 (Masking Policy) v3"
date: 2026-04-25
lastmod: 2026-04-25
author: "Davi"
description: "v2에서 회사 식별성이 일부 남아있던 `corp`·`corp.local` 계열을 일반 예약 도메인 기반으로 대체한다. v3 정책은 챕터 09 이후 신규 작성 문서 및 WorkLog 시리즈에 적용하며, 기존 챕터 00~08은 v2 상태로 보존한다."
slug: "masking-policy-v3"
section: "notes"
category: "proxmox/cmp-test/data-snapshots"
tags: [handbook, masking, anonymization, policy, v3]
order: 1
status: "active"
draft: true
search: false
toc: true
version: "v3"
---

## 0. 정책 목적과 v2로부터의 변경

본 문서는 CMP Pre-Test Reconnaissance Handbook 시리즈에 적용되는 마스킹 정책의 **v3 개정판**이다. v2와의 본질적 차이는 단 하나: **"사내 도메인 파생 식별자"의 추상화 강화**.

v2의 남은 약점은 다음과 같이 식별되었다(챕터 08 §6.1):

1. **`corp`** — v2에서 ciuser 값을 이 단어로 마스킹했으나, 단어 자체가 "회사 소유 자원"이라는 맥락을 여전히 전달한다. 회사 식별성 완전 제거 실패
2. **`corp.local`** — 사내 도메인 `letech.kr`의 마스킹 값으로 사용했으나, 실제로 `.local` 확장자는 mDNS 예약 도메인이라 일반 사내 DNS 구성과 의미가 어긋나는 2차 부작용
3. **외부 유출 방어 부족** — 핸드북이 회사 보안 경계를 넘어서는 상황에서 `corp` 계열은 여전히 "어느 회사인가"를 좁히는 단서 제공 가능

v3은 이 세 문제를 **RFC 6761 예약 도메인(`example`, `internal`)**으로 일괄 해소한다.

---

## 1. 변경 매핑 (v2 → v3)

v3에서 변경되는 항목만 정리. **나머지는 v2와 동일**하므로 §2에서 교차 참조만 유지한다.

### 1.1 도메인

| v2                  | v3                        | 근거                                   |
| ------------------- | ------------------------- | -------------------------------------- |
| `corp.local`        | **`internal.example`**    | RFC 6761 예약 도메인 활용. mDNS 충돌 회피. |
| (신규 마스킹 대상)  | (신규 항목 추가 시 `*.example` 또는 `*.internal.example` 사용) | v3 신규 원칙 |

### 1.2 사용자명 (ciuser 값 등)

| v2      | v3                 | 근거                                   |
| ------- | ------------------ | -------------------------------------- |
| `corp`  | **`internal-user`**| 회사 식별성 완전 제거. 일반 테스트 환경 명명. |

### 1.3 유지되는 항목 (v2와 동일)

| 대상                | 마스킹                       | 변경 없음 이유                    |
| ------------------- | ---------------------------- | --------------------------------- |
| 사용자 ID (`jykim` 등) | `testerA`~`testerE`, `testerSelf` | 이미 일반화. 더 바꿀 필요 없음      |
| `rbauman.com`       | `example.com`                | 이미 example 도메인. 변경 불필요    |
| `com.truenas`       | `com.example`                | 동상                                |
| `org.freenas`       | `org.example`                | 동상                                |
| 원본 실명 (한글)    | `testerX-real`               | 이미 일반화된 형태                  |
| IP 대역             | `10.99.XX.X/24` (평면별)     | v2 대역 유지. `10.99`는 사내 식별성 없음 |
| PVE 노드 호스트명   | `pve-nd0X` (마스킹 안 함)    | 핸드북 핵심 식별자                  |
| iSCSI WWID 본체     | (마스킹 안 함)               | 자원 distinct 식별자                |

---

## 2. v2 정책 조항의 계승

다음 v2 조항은 **v3에서도 그대로 유효**하며, 본 문서에서 중복 작성하지 않는다. v2 문서(`masking-policy-v2.md`)의 해당 섹션을 참조.

| 조항 | v2 위치 | 계승 여부 |
| --- | --- | --- |
| 명령 블록과 출력 인용의 분리 원칙 | v2 §2 | **그대로 계승** |
| 동적 IP 추출 (방식 A) | v2 §2.3 방식 A | **그대로 계승 (권장 유지)** |
| 환경 변수 placeholder (방식 B) | v2 §2.3 방식 B | **그대로 계승** |
| 하드코딩 + 명시 주석 (방식 C) | v2 §2.3 방식 C | **그대로 계승 (단순 예시 한정)** |
| 마스킹 대상이 아닌 항목 | v2 §1.7 | **그대로 계승** |
| 신규 항목 추가 절차 | v2 §5 | **그대로 계승** |

특히 **명령 블록의 마스킹 IP 금지 원칙**은 v3에서 더욱 강조된다. v2에서 처음 도입된 이 원칙이 v3 적용 문서들에서 체화되어야 한다.

---

## 3. 적용 범위 — v2와 v3의 경계

### 3.1 소급 적용하지 않음

v3는 **소급 적용하지 않는다**. 이유는 다음과 같다.

1. **v2로 작성된 챕터 00~08은 이미 외부 공개 준비가 된 상태** — 재검증·재배포 비용이 크다
2. **변경 범위가 크지 않음** — 문서 품질상 치명적 개선이 아니며, v2가 이미 "실질 사용 가능한 수준의 마스킹"을 달성
3. **핸드북의 이력 가치 보존** — v2 시점의 판단 근거가 갱신 이력과 함께 보존되는 것이 학습 자료로 가치

따라서 챕터 00~08은 **v2 상태로 보존**하며, 본 정책 v3는 **2026-04-25 이후 신규 작성 문서에만 적용**.

### 3.2 v3 적용 문서 목록

| 문서 | 유형 | 적용 시점 |
| --- | --- | --- |
| `09-pretest-checklist.md` | 핸드북 신규 | v3 적용 |
| `10-recon-output-templates.md` | 핸드북 신규 | v3 적용 |
| WorkLog 시리즈 (전체) | 보조 시리즈 | **v3 소급 적용 가능** |
| `04-storage-resource-management.md` | 핸드북 보류 → 작성 시 | v3 적용 (아직 미작성) |

### 3.3 WorkLog 시리즈의 특수 처리

WorkLog는 개별 작업 단위의 종적 기록이라 **외부 공유 가능성이 핸드북보다 높다**. 따라서 v3 소급 적용 대상.

이미 작성된 `worklog-2026-04-24-iscsi-multi-storage-provisioning.md`는 **v2 기준으로 작성**되었으나, 실제 검토 결과 v2·v3 경계 표현이 거의 없음이 확인됨. 따라서 해당 워크로그도 현 상태에서 크게 수정 필요 없음. 필요 시 §4의 추가 치환 1건만 적용.

---

## 4. sed 일괄 치환 스크립트 (v3)

v2 스크립트를 기반으로 §1의 변경 2건을 추가한다. 나머지는 동일.

```bash
#!/bin/bash
# 사용: ./mask-v3.sh <대상파일>
# v3 적용 대상: 챕터 09 이후 핸드북 + WorkLog 전체
# v2 적용 대상은 그대로 보존 (재처리하지 않음)

TARGET="$1"
[ -z "$TARGET" ] && { echo "Usage: $0 <file>"; exit 1; }

# === [1] 사용자 ID (v2 동일) ===
sed -i 's/ksy0724/testerB/g' "$TARGET"
sed -i 's/lmh0423/testerD/g' "$TARGET"
sed -i 's/jykim/testerA/g'   "$TARGET"
sed -i 's/\bpgw\b/testerC/g' "$TARGET"
sed -i 's/kcy0122/testerSelf/g' "$TARGET"
sed -i 's/nfs-test-0420/nfs-test-testerE/g' "$TARGET"
sed -i 's/storage-test-0420/storage-test-testerE/g' "$TARGET"

# === [2] 실명 (v2 동일) ===
sed -i 's/김승연/testerB-real/g' "$TARGET"
sed -i 's/JiyoungKim/testerA-real/g' "$TARGET"

# === [3] 도메인 (★ v3 변경) ===
sed -i 's/letech\.kr/internal.example/g' "$TARGET"       # v3: corp.local → internal.example
sed -i 's/\bletech\b/internal-user/g' "$TARGET"          # v3: corp → internal-user (단어 경계 주의)
sed -i 's/rbauman\.com/example.com/g' "$TARGET"
sed -i 's/com\.truenas/com.example/g' "$TARGET"
sed -i 's/org\.freenas/org.example/g' "$TARGET"

# === [4] IP 대역 (v2 동일) ===
sed -i 's/10\.10\.10\./10.99.10./g' "$TARGET"
sed -i 's/10\.10\.20\./10.99.20./g' "$TARGET"
sed -i 's/10\.10\.30\./10.99.30./g' "$TARGET"
sed -i 's/10\.10\.40\./10.99.40./g' "$TARGET"

# === [5] Hex 인코딩 IP (v2 동일) ===
sed -i 's/9EF7CA67/AABBCCDD/g' "$TARGET"

# === [6] PBS fingerprint (v2 동일) ===
sed -i 's/ad:ac:6d:b6:cb:e9:5d:8e:9d:ca:5f:4c:44:98:4b:7a:7f:ee:bf:cc:8b:dc:89:80:08:f1:82:2d:8e:79:5c:83/AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00/g' "$TARGET"

# === 검증 (v3 강화: corp·corp.local 잔재도 검출) ===
echo "=== v3 마스킹 누락 검증 ==="
FAILED=0
for pattern in 'jykim' 'ksy0724' 'pgw' 'lmh0423' 'kcy0122' \
               '김승연' 'JiyoungKim' \
               'letech' 'rbauman' \
               '9EF7CA67' \
               '\bcorp\b' 'corp\.local'; do
  if grep -qE "$pattern" "$TARGET"; then
    echo "[FAIL] pattern '$pattern' still present"
    FAILED=1
  fi
done

if [ $FAILED -eq 0 ]; then
  echo "[OK] v3 정책 완전 적용됨"
fi
```

### 4.1 v3 검증 리스트 확장

v2 검증 pattern에 **`\bcorp\b`와 `corp\.local`이 추가**되었다. 이는 v3 문서가 실수로 v2 마스킹 값을 남기지 않도록 하는 **자기 방어**.

- v2 문서 → v3 검증 통과 불가 (정상 — v3 적용 대상 아님)
- v3 문서 → v3 검증 통과 필수

---

## 5. 적용 검증 체크리스트

v3 정책을 신규 문서에 적용한 후 수행할 확인:

```bash
# [1] v3 치환 스크립트 실행
./mask-v3.sh 09-pretest-checklist.md

# [2] 명령 블록 안의 마스킹 IP 교차 검증 (v2 §2 원칙 계승)
awk '/^```bash/{flag=1; next} /^```/{flag=0} flag' 09-pretest-checklist.md \
  | grep -nE '10\.99\.' \
  && echo "[FAIL] 명령 블록에 마스킹 IP" \
  || echo "[OK] 명령 블록 깨끗"

# [3] v3 신규 패턴 노출 여부 (internal-user, internal.example이 과도하게 박혔나)
grep -cE 'internal-user|internal\.example' 09-pretest-checklist.md

# [4] 원본 잔재 (v3 강화 검증)
grep -nE '\bcorp\b|corp\.local|letech|9EF7CA67' 09-pretest-checklist.md \
  && echo "[FAIL] 원본 잔재" \
  || echo "[OK] v3 완전 적용"
```

---

## 6. 정책 갱신 이력

| 버전 | 일시            | 변경 내용                                                                             | 작성자 |
| ---- | --------------- | ------------------------------------------------------------------------------------- | ------ |
| v1   | 2026-04-23      | 최초 작성. 5명 테스터 + 5노드 + 4평면 매핑                                            | Davi   |
| v2   | 2026-04-23      | §2 추가: 명령 블록과 출력 인용 분리 원칙. 챕터 01 §7.1 사고 사례 반영                 | Davi   |
| v3   | 2026-04-25      | §1.1·§1.2 변경: `corp.local`→`internal.example`, `corp`→`internal-user`. 챕터 09부터 적용 | Davi   |

---

## 7. 향후 정책 갱신 시 고려 사항

v4가 필요해질 가능성 있는 시나리오:

1. **신규 테스터 `testerF` 이후 진입**: §1.1 매핑에 단순 추가 → 정책 변경 아닌 항목 추가로 v3 유지 가능
2. **핸드북 외부 공개 결정**: 현재 대역 `10.99.X`가 **우연히 실제 공인 IP**와 겹칠 경우 v4에서 다른 예약 대역(예: `192.168.99.X`)으로 재이동 검토
3. **CMP 프로덕션 배포**: CMP 관련 식별자(IQN 등)가 프로덕션에서 유지되는 경우, 프로덕션 문서 분리 체계 필요
4. **개별 테스터 실명 공개 철회 요청**: 현재 `testerX-real`까지 제거된 상태라 추가 조치 불요. 다만 v1 문서에 흔적이 남아있다면 소급 제거

본 정책은 **방어적 갱신**을 지향한다. "이미 충분히 익명화됐다"는 판단은 외부 공유 시점마다 재검증이 필요하며, 재검증 결과 필요 시 v4로 이어진다.

---

> **v3가 적용되는 첫 문서**: `09-pretest-checklist.md` (챕터 09). 본 정책 공표 이후 작성되는 모든 핸드북 챕터·워크로그·보조 문서에 본 정책이 기본 적용된다.
