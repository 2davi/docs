---
title: "마스킹 정책 (Masking Policy) v4 — 외부 공개판"
date: 2026-04-26
lastmod: 2026-04-26
author: "Davi"
description: "v3는 사내 핸드북 보존용이며 외부 공개 기준에는 미달한다(노드명·사설 IP·비밀번호 잔재 위험). v4는 발행 검토 보고서(2026-04-26) §4.4·§6.3 권고를 반영해 외부 공개 트랙(Yellow 마스킹 + Red 일반화 시리즈)에만 적용되는 더 강한 마스킹 정책. v3와 별개 트랙으로 운영하며 핸드북 본 시리즈(00~10)는 v3 상태로 보존한다."
slug: "masking-policy-v4"
section: "notes"
category: "proxmox/cmp-test/data-snapshots"
tags: [handbook, masking, anonymization, policy, v4, public-release]
order: 1
status: "active"
draft: true
search: false
toc: true
version: "v4"
---

## 0. 정책 목적과 v3로부터의 변경

본 문서는 **외부 공개 트랙**에 적용되는 마스킹 정책의 v4 개정판이다. 적용 대상은 다음 두 트랙뿐이다.

- **Yellow 트랙** — 발행 검토 보고서 §5.3의 마스킹 후 공개 가능 자산 (`01-setup`~`06-references`의 일부)
- **Red 일반화 시리즈** — `docs/deep-dive/cmp-meta-handbook/` 신규 작성 메타 자산 시리즈

v3와의 본질적 차이 3가지:

1. **노드 호스트명 마스킹** — v3는 `pve-nd0X`를 "핵심 식별자"로 보존했으나, 5노드 + 한국어 운영 + 2026-04 시점 조합으로 회사 추정이 가능하다는 §4.4 평가에 따라 외부 공개판에서는 추상화한다 (`pve-nodeA`~`pve-nodeE`).
2. **IP 대역 RFC 5737로 이전** — v3는 `10.99.X.X` (사내 식별성 없음)이라 봤으나, 4 평면 + 마지막 옥텟 패턴(.11~.15)이 자주성 단서가 된다는 §4.4 평가에 따라 RFC 5737 + RFC 6598 예약 대역으로 옮긴다.
3. **계정명·비밀번호 grep 검사 의무화** — v3는 별도 정책 부재였으나, 4월 22일 CSV 5번 행 비밀번호 `Dpfdlxpzm08!` 평문 노출 사고에 따라 자동 grep 차단을 정책에 명시한다.

v3와 v4는 **대체 관계가 아닌 분리된 트랙**이다. 핸드북 본 시리즈(`07-cmp-test/00`~`10`)는 v3 상태로 사내 보존되며, v4는 그 시리즈를 직접 수정하지 않는다.

---

## 1. 마스킹 매핑 (v4)

### 1.1 노드 호스트명 (★ v3 변경)

| v3 (사내 보존) | v4 (외부 공개) | 비고 |
| --- | --- | --- |
| `pve-nd01` | `pve-nodeA` | 노드 1 |
| `pve-nd02` | `pve-nodeB` | 노드 2 |
| `pve-nd03` | `pve-nodeC` | 노드 3 |
| `pve-nd04` | `pve-nodeD` | 노드 4 |
| `pve-nd05` | `pve-nodeE` | 노드 5 |
| `pve-nd06`, `pve-nd07` | `storage-nodeA`, `storage-nodeB` | TrueNAS 백엔드 호스트 |
| `pve-cl01` | `pve-clusterX` | 클러스터 이름 |

순서 의존 매핑이라 `pve-nd0` 같은 부분 매칭 금지. sed에서 `pve-nd0([1-7])` 단위로만 치환.

### 1.2 IP 대역 (★ v3 변경 — RFC 5737 + RFC 6598)

| 평면 | v3 (사내 보존) | v4 (외부 공개) | 근거 |
| --- | --- | --- | --- |
| **mgmt** | `10.99.10.0/24` | `192.0.2.0/24` | RFC 5737 TEST-NET-1 |
| **corosync0** | `10.99.20.0/24` | `198.51.100.0/24` | RFC 5737 TEST-NET-2 |
| **corosync1** | `10.99.30.0/24` | `203.0.113.0/24` | RFC 5737 TEST-NET-3 |
| **vm** | `10.99.40.0/24` | `100.64.0.0/24` | RFC 6598 Shared Address Space |

마지막 옥텟(`.11`~`.15`)은 그대로 유지. 노드 번호와의 매핑 직관 보존.

> **주의**: RFC 5737 대역은 문서 예시 전용이며 실제 라우팅에 쓰이지 않는다. 본 문서를 보고 그대로 명령에 입력하면 작동하지 않는다 — 이는 의도된 안전장치다. v3 §2의 명령 블록 분리 원칙(동적 추출 / 환경변수 placeholder)을 v4에서도 그대로 계승한다.

### 1.3 사용자명·도메인 (v3 계승)

| 항목 | v3 마스킹 | v4 적용 |
| --- | --- | --- |
| 사용자 ID (`jykim`, `ksy0724`, `pgw`, `lmh0423`, `kcy0122`) | `testerA`~`testerE`, `testerSelf` | **그대로 계승** |
| `letech.kr` | `internal.example` | **그대로 계승** |
| `letech` (단어) | `internal-user` | **그대로 계승** |
| `rbauman.com` | `example.com` | **그대로 계승** |
| `com.truenas` | `com.example` | **그대로 계승** |
| `org.freenas` | `org.example` | **그대로 계승** |
| 한글 실명 | `testerX-real` | **그대로 계승** |

### 1.4 인증서·Hex 식별자 (v3 계승)

PBS TLS fingerprint, chrony reference hex IP는 v3 매핑 그대로 유지.

### 1.5 자원명 부분 치환 (v3 계승 + 노드명 추가)

자원명에 사용자 ID가 포함된 경우 §1.3에 따라 부분 치환. v4에서는 자원명에 노드 호스트명이 포함된 경우도 §1.1에 따라 부분 치환:

| 예시 | v3 | v4 |
| --- | --- | --- |
| `cmptest-iscsi-pve-nd01-target-kcy0122` | `cmptest-iscsi-pve-nd01-target-testerSelf` | `cmptest-iscsi-pve-nodeA-target-testerSelf` |

### 1.6 마스킹 대상이 아닌 항목

다음은 v4에서도 의도적으로 마스킹하지 않는다.

- iSCSI WWID 본체 (`36589cfc...`): 글로벌 unique지만 회사 식별엔 약함
- 표준 포트 (8006, 8007, 22 등)
- 공식 소프트웨어 버전 (Proxmox VE 9.1.1 등): 공개된 사실
- 일반 명령·옵션·설정 키

### 1.7 비밀번호·평문 자격증명 — 절대 등장 금지 (★ v4 신규)

다음은 마스킹이 아니라 **본문에 등장 자체 금지**다. 마스킹 적용이 아니라 문서 자체에서 제거한다.

- 운영 계정 비밀번호 (예: `Dpfdlxpzm08!`)
- API 토큰·시크릿
- 프라이빗 키·인증서 본문
- 데이터베이스 연결 문자열의 패스워드 부분
- 세션 쿠키·JWT 토큰

§3의 검증 스크립트가 이러한 패턴을 자동 탐지하여 적용 차단한다. 차단된 경우 본문에서 해당 줄을 직접 삭제하거나 placeholder(`<PASSWORD>`)로 대체.

---

## 2. 명령 블록과 출력 인용의 분리 원칙 (v2 계승)

v4도 v2 §2의 분리 원칙을 그대로 따른다. 핵심 요지:

- **출력 인용 블록**: §1의 v4 매핑 적용 (마스킹 IP `192.0.2.X` 등이 등장)
- **실행 가능 명령 블록**: 마스킹 IP를 사용하지 않음. 다음 3 방식 중 하나:
  - **방식 A 동적 추출** (권장): `/etc/pve/.members`에서 `jq`로 추출
  - **방식 B 환경변수 placeholder**: 헤드에 `<실제 mgmt IP>` 형태
  - **방식 C 하드코딩 + 명시 주석** (단순 예시 한정)

v4 외부 공개판에서는 방식 C 사용 시 마스킹 IP가 RFC 5737이라 실수로 실행해도 라우팅이 작동하지 않으므로 사고 방지 효과가 강화된다. 그러나 이는 부수 효과일 뿐 v2 §2의 원칙 자체는 동일하게 강제된다.

---

## 3. sed 일괄 치환 + 검증 스크립트 (v4)

`mask-v4.sh`로 별도 작성. 본 문서와 같은 디렉터리에 둔다.

```bash
#!/bin/bash
# 사용: ./mask-v4.sh <대상파일>
# v4 적용 트랙: Yellow(외부 공개용 마스킹) + Red 일반화 시리즈
# v3 적용 대상(핸드북 00~10)에는 사용하지 않음 — 사내 보존본을 덮어씀

set -euo pipefail

TARGET="${1:-}"
[ -z "$TARGET" ] && { echo "Usage: $0 <file>"; exit 1; }
[ ! -f "$TARGET" ] && { echo "[ERROR] file not found: $TARGET"; exit 1; }

# === [0] 사전 검사: 비밀번호·평문 자격증명 ===
echo "=== [0] 비밀번호·평문 자격증명 사전 검사 ==="
PASSWD_PATTERNS=(
  'Dpfdlxpzm'
  'password\s*[:=]\s*[^<\s][^\s]{6,}'
  'token\s*[:=]\s*[A-Za-z0-9]{20,}'
  'secret\s*[:=]\s*[A-Za-z0-9]{16,}'
  'BEGIN (RSA |EC )?PRIVATE KEY'
)
for p in "${PASSWD_PATTERNS[@]}"; do
  if grep -qE "$p" "$TARGET"; then
    echo "[BLOCK] 평문 자격증명 패턴 검출: '$p'"
    echo "        해당 줄을 직접 제거하거나 <REDACTED>로 대체 후 재실행하세요."
    exit 2
  fi
done
echo "[OK] 평문 자격증명 없음"

# === [1] 사용자 ID (v3 계승) ===
sed -i 's/ksy0724/testerB/g' "$TARGET"
sed -i 's/lmh0423/testerD/g' "$TARGET"
sed -i 's/jykim/testerA/g'   "$TARGET"
sed -i 's/\bpgw\b/testerC/g' "$TARGET"
sed -i 's/kcy0122/testerSelf/g' "$TARGET"
sed -i 's/nfs-test-0420/nfs-test-testerE/g' "$TARGET"
sed -i 's/storage-test-0420/storage-test-testerE/g' "$TARGET"

# === [2] 실명 (v3 계승) ===
sed -i 's/김승연/testerB-real/g' "$TARGET"
sed -i 's/JiyoungKim/testerA-real/g' "$TARGET"

# === [3] 도메인 (v3 계승) ===
sed -i 's/letech\.kr/internal.example/g' "$TARGET"
sed -i 's/\bletech\b/internal-user/g' "$TARGET"
sed -i 's/rbauman\.com/example.com/g' "$TARGET"
sed -i 's/com\.truenas/com.example/g' "$TARGET"
sed -i 's/org\.freenas/org.example/g' "$TARGET"

# === [4] 노드 호스트명 (★ v4 신규 — 순서 중요) ===
# 7→6→5→...→1 역순으로 처리하여 "pve-nd01"이 "pve-nodeA1" 같은 부산물로 변형되는 것을 막음
sed -i 's/\bpve-nd07\b/storage-nodeB/g' "$TARGET"
sed -i 's/\bpve-nd06\b/storage-nodeA/g' "$TARGET"
sed -i 's/\bpve-nd05\b/pve-nodeE/g' "$TARGET"
sed -i 's/\bpve-nd04\b/pve-nodeD/g' "$TARGET"
sed -i 's/\bpve-nd03\b/pve-nodeC/g' "$TARGET"
sed -i 's/\bpve-nd02\b/pve-nodeB/g' "$TARGET"
sed -i 's/\bpve-nd01\b/pve-nodeA/g' "$TARGET"
sed -i 's/\bpve-cl01\b/pve-clusterX/g' "$TARGET"

# === [5] IP 대역 (★ v4 변경 — RFC 5737 + RFC 6598) ===
# v3 마스킹 대역(10.99.X.X)이 이미 적용된 경우와, 원본 대역(10.10.X.X)이 그대로인 경우 모두 대응
sed -i 's/10\.10\.10\./192.0.2./g'    "$TARGET"
sed -i 's/10\.99\.10\./192.0.2./g'    "$TARGET"
sed -i 's/10\.10\.20\./198.51.100./g' "$TARGET"
sed -i 's/10\.99\.20\./198.51.100./g' "$TARGET"
sed -i 's/10\.10\.30\./203.0.113./g'  "$TARGET"
sed -i 's/10\.99\.30\./203.0.113./g'  "$TARGET"
sed -i 's/10\.10\.40\./100.64.0./g'   "$TARGET"
sed -i 's/10\.99\.40\./100.64.0./g'   "$TARGET"

# === [6] Hex IP·PBS fingerprint (v3 계승) ===
sed -i 's/9EF7CA67/AABBCCDD/g' "$TARGET"
sed -i 's/ad:ac:6d:b6:cb:e9:5d:8e:9d:ca:5f:4c:44:98:4b:7a:7f:ee:bf:cc:8b:dc:89:80:08:f1:82:2d:8e:79:5c:83/AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00/g' "$TARGET"

# === [7] 사후 검증 (v4 강화) ===
echo "=== [7] v4 마스킹 누락 검증 ==="
FAILED=0
LEFTOVER_PATTERNS=(
  'jykim' 'ksy0724' '\bpgw\b' 'lmh0423' 'kcy0122'
  '김승연' 'JiyoungKim'
  'letech' 'rbauman' 'com\.truenas' 'org\.freenas'
  '\bcorp\b' 'corp\.local'
  '9EF7CA67'
  '\bpve-nd0[1-7]\b' '\bpve-cl01\b'
  '10\.10\.[1-4]0\.' '10\.99\.[1-4]0\.'
)
for pattern in "${LEFTOVER_PATTERNS[@]}"; do
  if grep -qE "$pattern" "$TARGET"; then
    echo "[FAIL] pattern '$pattern' still present"
    grep -nE "$pattern" "$TARGET" | head -3
    FAILED=1
  fi
done

# === [8] 명령 블록 안 마스킹 IP 검사 (v2 §2 원칙 강제) ===
echo "=== [8] 명령 블록 안 마스킹 IP 검사 ==="
if awk '/^```bash|^```sh/{flag=1; next} /^```/{flag=0} flag' "$TARGET" \
   | grep -qE '192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|100\.64\.0\.'; then
  echo "[WARN] 명령 블록에 마스킹 IP 등장 — v2 §2 위반 가능. 동적 추출 또는 placeholder로 대체 권장"
  echo "       (단순 예시 명령에 명시 주석이 있는 경우는 허용)"
fi

if [ $FAILED -eq 0 ]; then
  echo "[OK] v4 정책 완전 적용됨"
else
  echo "[FAIL] 누락 항목 존재 — 본문 수동 검토 필요"
  exit 3
fi
```

### 3.1 v4 검증 패턴 추가

v3 검증 패턴에 더해 v4에서 다음이 추가된다.

- `\bpve-nd0[1-7]\b`, `\bpve-cl01\b` — v4 노드명 마스킹 누락 검출
- `10\.99\.[1-4]0\.` — v3 마스킹 대역이 v4에 잔존하는 경우 검출
- 평문 자격증명 5종 — 사후가 아닌 사전 차단 (검증 실패 시 sed 진행 자체 중단)

---

## 4. 적용 절차 (Yellow 트랙)

§5.3 Yellow 자산에 v4 적용 시 권장 절차:

1. **백업** — `cp <file> <file>.v3-bak` (롤백 대비)
2. **사전 검사** — `./mask-v4.sh <file>` 실행. 비밀번호 등장 시 즉시 본문 정정
3. **마스킹 자동 적용** — 사전 검사 통과 시 §3 스크립트가 [1]~[6] 일괄 치환
4. **사후 검증** — [7][8] 자동 수행. FAIL 발생 시 본문 수동 검토
5. **명령 블록 가독성 확인** — 마스킹 IP가 명령 안에 박혀 있다면 환경변수 placeholder로 재작성
6. **frontmatter 갱신** — `masking_policy: "v4"` 필드 추가. `lastmod` 갱신
7. **diff 검토** — `git diff --stat` + 본문 한 번 더 통독
8. **커밋** — `chore(mask): apply v4 to <file>` 같은 메시지

---

## 5. 적용 절차 (Red 일반화 시리즈)

Red 일반화 시리즈(`docs/deep-dive/cmp-meta-handbook/`)는 마스킹이 아닌 **재작성**이다. v4 정책의 역할은 다음으로 한정된다.

- **사전 차단** — 일반화 작성 중 회사 식별 정보가 우발 유입되는 것을 §3 스크립트로 검출
- **예시 표준** — 가상 환경 예시 작성 시 v4 매핑(`pve-nodeA`, `192.0.2.X`)을 표준 placeholder로 사용
- **검증 게이트** — 일반화 시리즈 커밋 전 `mask-v4.sh` 실행해 누락 0 보장

일반화 시리즈에는 **v3 잔재 패턴이 등장하면 안 된다** (`testerA`, `internal-user`, `internal.example` 등). 이는 v4 검증에서 직접 잡히지 않으므로 별도 grep 권장:

```bash
grep -nE 'testerA|testerB|testerC|testerD|testerE|testerSelf|internal-user|internal\.example' \
  docs/deep-dive/cmp-meta-handbook/*.md
# 결과가 0건이어야 함
```

---

## 6. 정책 갱신 이력

| 버전 | 일시 | 변경 내용 | 적용 트랙 |
| --- | --- | --- | --- |
| v1 | 2026-04-23 | 최초 작성. 5명 테스터 + 5노드 + 4평면 매핑 | 핸드북 사내 |
| v2 | 2026-04-23 | §2 추가: 명령/인용 분리 원칙 | 핸드북 사내 |
| v3 | 2026-04-25 | `corp.local`→`internal.example`, `corp`→`internal-user` | 핸드북 사내 (09 이후) |
| v4 | 2026-04-26 | 노드명·IP RFC 5737 이전, 비밀번호 grep 사전 차단 | **외부 공개 트랙 신설 (v3와 별개)** |

---

## 7. 트랙 분리 원칙

v4 도입의 핵심은 **단일 정책의 점진 강화가 아닌 트랙 분리**다.

| 트랙 | 적용 정책 | 대상 | 목적 |
| --- | --- | --- | --- |
| **사내 보존** | v3 | `07-cmp-test/00`~`10`, `README.md`, `data-snapshots/` | 핸드북 학습 자료 가치 보존 |
| **외부 공개** | **v4** | Yellow 마스킹 자산 + Red 일반화 시리즈 | 회사 식별성 완전 제거 |

이 분리는 다음을 보장한다.

- 핸드북 본 시리즈는 사내에서 본래 가치(노드명·IP 평면 식별성) 유지
- 외부 공개판은 마스킹 누락이 핸드북에 역류하지 않음
- v4 정책 갱신이 핸드북 본문 재정비를 강제하지 않음

> **본 정책의 권한 범위**: v4는 외부 공개 트랙에만 적용된다. 핸드북 사내 보존본(v3 적용)을 v4로 재마스킹하지 않는다 — 핸드북의 학습 가치는 환경 식별성에 결부되어 있고, 사내에서는 이를 유지하는 것이 정당하다.
