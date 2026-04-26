#!/bin/bash
# mask-v4.sh — 외부 공개 트랙 마스킹 스크립트 (masking-policy-v4.md §3)
# 사용: ./mask-v4.sh <대상파일>
# 적용 트랙: Yellow(외부 공개용 마스킹) + Red 일반화 시리즈
# 비적용: v3 적용 대상(핸드북 00~10, README) — 사내 보존본을 덮어쓰면 안 됨

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

# === [4] 노드 호스트명 (v4 신규 — 역순 처리) ===
sed -i 's/\bpve-nd07\b/storage-nodeB/g' "$TARGET"
sed -i 's/\bpve-nd06\b/storage-nodeA/g' "$TARGET"
sed -i 's/\bpve-nd05\b/pve-nodeE/g' "$TARGET"
sed -i 's/\bpve-nd04\b/pve-nodeD/g' "$TARGET"
sed -i 's/\bpve-nd03\b/pve-nodeC/g' "$TARGET"
sed -i 's/\bpve-nd02\b/pve-nodeB/g' "$TARGET"
sed -i 's/\bpve-nd01\b/pve-nodeA/g' "$TARGET"
sed -i 's/\bpve-cl01\b/pve-clusterX/g' "$TARGET"

# === [5] IP 대역 (v4 변경 — RFC 5737 + RFC 6598) ===
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

# === [7] 사후 검증 ===
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
