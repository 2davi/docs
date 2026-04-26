---
title: "09. Pre-test 체크리스트 — STN 당일의 실행 문서"
date: 2026-04-25
lastmod: 2026-04-25
author: "Davi"
description: "핸드북 01~08장에서 도출된 모든 판단을 STN 당일 실제로 수행 가능한 체크리스트로 변환한다. 팀 회의 공표용 붉은 선 1페이지, STN 시작 3단계 체크, 진행 중 30분 주기 체크, 종료 후 복기 템플릿으로 구성된다."
slug: "pretest-checklist"
section: "notes"
category: "linux/proxmox/cmp-test"
tags: [proxmox, checklist, pretest, stn, healthcheck, cmp]
order: 9
series: "CMP Pre-Test Reconnaissance Handbook"
series_order: 9
status: "active"
draft: false
search: true
toc: true
difficulty: intermediate
version: "Proxmox VE 9.1.1"
masking_policy: "v3"
---

## 0. 이 챕터의 성격

본 챕터는 **읽는 문서가 아니라 쓰는 문서**다. 01~08장이 분석·해부·판정 중심이었다면, 09는 그 결과를 **실제 STN 당일 손에 들고 움직일 때 참조하는 짧은 지시서**.

구성:

| 절                                 | 용도                                     | 예상 소요 |
| ---------------------------------- | ---------------------------------------- | --------- |
| §1 팀 회의 공표 1페이지 (붉은 선)  | STN 시작 전 회의에서 5명 테스터에게 공표 | 회의 3분  |
| §2 STN 진입 3단계 체크             | 당일 아침 → 진입 직전 → 진입 첫 30분     | 총 20분   |
| §3 STN 진행 중 30분 주기 체크      | 테스트 진행 중 정기 헬스 체크            | 매회 3분  |
| §4 STN 종료 후 복기 템플릿         | 당일 종료 후 익일 회고                   | 30분      |
| §5 비상 상황 즉시 중단 판단 플로우 | 문제 발생 시 의사결정 트리               | 즉시      |

**본 챕터는 v3 마스킹 정책이 처음 적용된 문서**다(`masking-policy-v3.md` §3.2 참조). 명령 블록의 IP는 실제 환경 IP를 써야 작동하므로, 본문 명령 블록은 **placeholder 또는 동적 추출** 방식을 엄격히 준수한다.

### 0.1 본 챕터의 전제

본 체크리스트는 **챕터 08 §5.1의 P0 5건이 STN 전에 해소되었다는 전제**로 작성된다. P0 미해소 상태로 STN 진입하면 본 체크리스트의 상당 부분이 의미 없다(예: iSCSI 에러가 45만 건/일 그대로면 §3의 "ERROR 레이트 확인"이 의미 없음).

P0가 미해소된 채 STN이 강행되는 경우, §5의 비상 판단 플로우로 즉시 이동.

---

## 1. 팀 회의 공표 1페이지 — 붉은 선

**이 섹션은 출력해서 회의실 벽에 붙이거나, 구글 슬라이드 한 장으로 옮겨 팀 회의에서 공표**.

```markdown
╔════════════════════════════════════════════════════════════════════════╗
║                                                                        ║
║              STN 기간 중 5명 테스터 공통 준수 사항                    ║
║                    (CMP Pre-Test Handbook 08장 요약)                  ║
║                                                                        ║
╠════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  🚫 전면 금지 (L5 또는 R4 영역)                                       ║
║  ───────────────────────────────────────────────────────               ║
║    • TrueNAS 측 자원 직접 변경 (zVol·Target·Extent)                   ║
║    • `pvecm delnode` 또는 클러스터 탈퇴 명령                          ║
║    • `/etc/corosync/corosync.conf` 직접 편집                          ║
║    • shared storage 삭제 (pve-nd06-nfs, prom-lvm, vg-prom)            ║
║    • `qm template` 변환 (비가역)                                      ║
║    • 다른 테스터의 VM·스토리지 직접 삭제                              ║
║    • BIOS 업데이트, 커널 설치·업그레이드                              ║
║    • PVE 주요 패키지 `apt upgrade` (단일 노드)                        ║
║    • `iscsiadm -o delete` 타 테스터 target                            ║
║                                                                        ║
║  ⚠  사전 합의 필수 (L3~L4 영역)                                       ║
║  ───────────────────────────────────────────────────────               ║
║    • 노드 reboot (본인 노드 제외)                                     ║
║    • `storage.cfg` 편집 (pvesm set/add/remove)                        ║
║    • HA config 변경 (ha-manager state/node 변경)                      ║
║    • VM 마이그레이션 (특히 local-zfs VM)                              ║
║    • 네트워크 평면 이전 (NFS mgmt→storage 등)                         ║
║    • PVE firewall 활성화                                              ║
║    • VM 처분 (test 포함이라도 작성자 불명이면 합의)                   ║
║                                                                        ║
║  ✓ 단독 수행 가능 (L1~L2 영역)                                        ║
║  ───────────────────────────────────────────────────────               ║
║    • 본인 VM·스토리지·iSCSI target의 모든 조작                        ║
║    • 본인 VM snapshot 생성·삭제                                        ║
║    • 모든 조회 명령 (qm config, pvesm list, 로그 조회 등)             ║
║                                                                        ║
╠════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  새 VM 생성 시 권장 규약                                              ║
║  ─────────────────────────                                              ║
║    • 이름 형식: {VMID}-test-{testerID}-{용도}                         ║
║    • 네트워크 기본값: bridge=vmbr1 (vm 평면)                          ║
║    • 스토리지 기본값: pve-nd06-nfs 또는 본인 iSCSI target              ║
║    • ciuser: 회사명 파생값 금지. {testerID} 또는 용도별 이름           ║
║    • description: HTML 태그 사용 금지. 평문만                         ║
║    • tags: 최소한 test-YYYY-MM-DD 또는 {testerID} 포함                 ║
║                                                                        ║
╠════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  🚨 문제 발생 시 즉시 중단 신호                                        ║
║  ───────────────────────────────────────────────────────               ║
║    • 클러스터 정족수 이탈 (pvecm status 이상)                         ║
║    • OOM Killer 발동 (journalctl | grep oom-killer)                   ║
║    • 커널 Call Trace 발생                                             ║
║    • TrueNAS 응답 없음 (어느 평면도)                                  ║
║    • 5노드 중 1개 이상 mgmt·corosync 평면 DOWN                        ║
║                                                                        ║
║    ⇒ 위 신호 발견 시 즉시 "STOP" Slack 공유 + 추가 조작 전면 중단      ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝
```

---

## 2. STN 진입 3단계 체크

STN 시작 당일 수행. 아침 ~ 진입 첫 30분의 **순차 체크**.

### 2.1 STAGE 1 — 당일 아침 (STN 시작 1시간 전)

목적: **P0 5건 실제 해소 여부 확인**. 미해소 시 STN 지연 또는 부분 진행 판단.

```markdown
┌─ STAGE 1: 아침 체크 (약 15분) ──────────────────────────────────────┐
│                                                                      │
│ □ P0-A: nd02 storage 평면 링크 속도 2.5 Gbps 복구 확인                │
│          → 운영팀 완료 공유 받음 + 본인 실측                           │
│                                                                      │
│ □ P0-B: CMP 요청 라우팅 설계 의도 개발팀 답변 확인                    │
│          → "설계된 분산" / "미구현 분산" / "의도된 집중" 중 택일        │
│                                                                      │
│ □ P0-C: NFS alias chaos 매핑 팀 전원에게 공유 완료                    │
│          → 챕터 03 §2.7.1 매트릭스 Slack 채널 pinned 확인              │
│                                                                      │
│ □ P0-D: iSCSI 유령 LUN testerA 영역 정리 답변 확인                    │
│          → WorkLog §5.2 문의에 대한 testerA 답변                       │
│          → 답변 없으면 pvesm set --disable 임시 우회 예고              │
│                                                                      │
│ □ P0-E: VM 112 작성자 확인                                            │
│          → Slack 질의 답변 수령 또는 24시간 경과 → 처분 보류 유지       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### 2.1.1 P0-A 링크 속도 실측 명령

```bash
# === 본인 환경의 실제 IP 또는 노드명을 사용 ===
# (v3 정책: 명령 블록은 실제 값)

NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"

for n in $NODES; do
  speed=$(ssh "$n" "ethtool enp10s0 2>/dev/null | grep Speed || \
                     ethtool enp9s0 2>/dev/null | grep Speed")
  echo "[$n] $speed"
done
```

**기대 출력**: 5노드 모두 `Speed: 2500Mb/s`. nd02가 `100Mb/s`면 STN 지연 판단.

#### 2.1.2 P0-D 답변 없을 때 임시 우회

testerA 응답이 없을 경우 WorkLog §5.3의 `pvesm set --disable`로 임시 우회. 단 **testerA에 사전 고지 후 실행**.

```bash
# storage.cfg 백업 후 disable
cp /etc/pve/storage.cfg /root/storage.cfg.bak-$(date +%Y%m%d-%H%M)
pvesm set truenas-iscsi-testerA --disable
pvesm set cmptest-iscsi-window-testerA --disable
pvesm set cmptest-truenas-iscsi-filebrowser-testerA --disable
```

### 2.2 STAGE 2 — STN 진입 직전 (시작 10분 전)

목적: **클러스터 자체의 현재 상태가 건강한가**. 5분 내 실행 가능한 헬스 체크.

```bash
# === STN 진입 직전 헬스 체크 (약 5분) ===

echo "============================================"
echo "  STN PRE-ENTRY HEALTH CHECK  $(date +%Y-%m-%d\ %H:%M)"
echo "============================================"

NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"

# [1] 클러스터 정족수
echo ""
echo "--- [1/6] Cluster Quorum ---"
ssh pve-nd01 "pvecm status | grep -E 'Quorate|Nodes|Activity|Total votes'"

# [2] 5노드 링크 속도
echo ""
echo "--- [2/6] Physical Link Speed ---"
for n in $NODES; do
  spd=$(ssh "$n" "ethtool enp10s0 2>/dev/null | grep Speed || \
                   ethtool enp9s0 2>/dev/null | grep Speed")
  echo "[$n] $spd"
done

# [3] 5노드 간 mgmt 평면 ping
echo ""
echo "--- [3/6] Inter-node Ping (mgmt) ---"
for src in $NODES; do
  for dst in $NODES; do
    [ "$src" = "$dst" ] && continue
    loss=$(ssh "$src" "ping -c 3 -W 1 -q $dst 2>/dev/null | grep 'packet loss' | awk -F'[,%]' '{print \$3}'")
    if [ "$loss" != " 0" ] && [ -n "$loss" ]; then
      echo "[!] $src → $dst  loss=$loss%"
    fi
  done
done
echo "(이상 보고 없으면 모두 0% loss)"

# [4] iSCSI 에러 레이트 (10분간)
echo ""
echo "--- [4/6] iSCSI ERROR rate (last 10min) ---"
for n in $NODES; do
  cnt=$(ssh "$n" "journalctl --since '10 minutes ago' -p err --no-pager | wc -l")
  echo "[$n] ERROR last 10min: $cnt"
done
echo "(정비 후 기대: 각 노드 100 이하)"

# [5] HA 상태
echo ""
echo "--- [5/6] HA Manager ---"
ssh pve-nd01 "ha-manager status | head -15"

# [6] 실행 중 VM 개수
echo ""
echo "--- [6/6] Running VM count ---"
for n in $NODES; do
  run=$(ssh "$n" "qm list 2>/dev/null | awk 'NR>1 && \$3==\"running\"' | wc -l")
  echo "[$n] running VMs: $run"
done

echo ""
echo "============================================"
echo "  STAGE 2 COMPLETE — review above output"
echo "============================================"
```

**판단 기준**:

| 항목        | PASS                                           | FAIL (STN 지연 판단)              |
| ----------- | ---------------------------------------------- | --------------------------------- |
| 정족수      | `Quorate: Yes`, `Total votes: 5`               | 그 외                             |
| 링크 속도   | 5노드 모두 2.5 Gbps (`enp10s0`/`enp9s0`)       | nd02 또는 타 노드 < 2.5 Gbps      |
| Ping        | 모든 쌍 0% loss                                | 어느 쌍이든 loss 발생             |
| iSCSI ERROR | 정비 후 10분 100건 이하                        | 10분 1000건 이상 (정비 미완 판정) |
| HA          | master 정상 + 모든 lrm active/idle             | master 없음 또는 lrm dead         |
| VM running  | 기대 개수와 일치 (챕터 06 §2.1 기준 20개 근처) | 급격한 감소                       |

### 2.3 STAGE 3 — STN 진입 후 첫 30분

목적: **테스트 시작 후 이상 신호가 즉시 올라오지 않는가**. 첫 CMP 작업 후 상태 재확인.

```markdown
┌─ STAGE 3: 진입 후 30분 체크 (약 5분) ──────────────────────────────┐
│                                                                      │
│ □ CMP UI 접근 가능 (5노드 모두 :18080 응답)                           │
│ □ 첫 CMP 테스트 작업 1건 실행 (낮은 위험도 — 예: VM list 조회)        │
│ □ pvedaemon 로그에 해당 작업 ERROR 없이 기록됨                        │
│ □ 5노드 로드 평균 (load avg) 5분 대비 급증 없음                       │
│ □ 5노드 rx_drop 증가율 정상 (이전 대비 분당 <100)                     │
│ □ TrueNAS nd06, nd07 mgmt + storage 평면 모두 REACHABLE               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**1건 이상 FAIL 시**: §5 비상 판단 플로우로 즉시 이동.

#### 2.3.1 STAGE 3 검증 명령

```bash
# === STAGE 3 검증 (약 3분) ===

# CMP UI 응답
for n in pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05; do
  IP=$(ssh "$n" "hostname -I | awk '{print \$1}'")
  http_code=$(ssh "$n" "curl -s -o /dev/null -w '%{http_code}' -m 5 http://$IP:18080/ 2>/dev/null")
  echo "[$n] CMP :18080 → HTTP $http_code"
done

# 5노드 load average
for n in pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05; do
  la=$(ssh "$n" "uptime | awk -F'load average:' '{print \$2}'")
  echo "[$n] load: $la"
done

# rx_drop 증가율 (60초 전후 비교)
for n in pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05; do
  before=$(ssh "$n" "cat /sys/class/net/vmbr2/statistics/rx_dropped")
  sleep 60
  after=$(ssh "$n" "cat /sys/class/net/vmbr2/statistics/rx_dropped")
  diff=$((after - before))
  echo "[$n] vmbr2 rx_drop (60s): +$diff"
done

# TrueNAS ARP 상태
ssh pve-nd01 "ip neigh show | grep -E '10\.99\.(10|30)\.1[67]'"
```

---

## 3. STN 진행 중 — 30분 주기 체크

STN 수 시간 진행 중 **30분마다 자동 또는 수동 실행**. 짧게 유지하여 테스트 흐름 방해 최소화.

### 3.1 30분 주기 헬스 체크 (3분 소요)

```bash
#!/bin/bash
# === STN 30-minute health check ===
# Usage: 매 30분 cron 또는 수동 실행

TS=$(date +%Y-%m-%d\ %H:%M)
LOG="/tmp/stn-healthcheck-$(date +%Y%m%d).log"

{
  echo "=========================================="
  echo "  STN 30min CHECK — $TS"
  echo "=========================================="

  NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"

  # [1] 정족수 (3초)
  q=$(ssh pve-nd01 "pvecm status 2>/dev/null | grep -c 'Quorate: Yes'")
  [ "$q" = "1" ] && echo "✓ Quorum OK" || echo "🚨 QUORUM LOST"

  # [2] 30분간 ERROR 레이트 (iSCSI 노이즈 제외)
  for n in $NODES; do
    cnt=$(ssh "$n" "journalctl --since '30 minutes ago' -p err --no-pager \
      | grep -vE 'iscsid.*target not found|iscsid.*Kernel reported' \
      | wc -l")
    if [ "$cnt" -gt 50 ]; then
      echo "🚨 [$n] non-iSCSI ERROR last 30min: $cnt"
    fi
  done

  # [3] OOM 이력
  for n in $NODES; do
    oom=$(ssh "$n" "journalctl --since '30 minutes ago' 2>&1 | grep -icE 'oom-killer|Out of memory'")
    [ "$oom" -gt 0 ] && echo "🚨 [$n] OOM events: $oom"
  done

  # [4] load 급증 (>5 지속)
  for n in $NODES; do
    la5=$(ssh "$n" "uptime | awk -F'load average:' '{print \$2}' | awk -F, '{print \$2}' | tr -d ' '")
    if awk "BEGIN{exit !($la5 > 5)}"; then
      echo "⚠ [$n] load avg(5min): $la5"
    fi
  done

  # [5] TrueNAS 응답
  # ※ 본 스크립트 사용 전, 아래 환경 변수를 실제 환경 IP로 치환할 것 (v3 §2.3 방식 B)
  TRUENAS_IPS="${TRUENAS_IPS:-<nd06-mgmt-IP> <nd06-storage-IP> <nd07-mgmt-IP> <nd07-storage-IP>}"
  for tn in $TRUENAS_IPS; do
    # placeholder를 그대로 두고 실행하면 ping이 즉시 실패하여 사고로 이어지지 않음
    ssh pve-nd01 "ping -c 1 -W 1 -q $tn >/dev/null 2>&1"
    [ $? -ne 0 ] && echo "🚨 TrueNAS $tn unreachable"
  done

  echo "=========================================="
} | tee -a "$LOG"
```

**플래그 해석**:

- `✓` / 아무 메시지 없음 → 정상
- `⚠` → 관찰 대상 (아직 비상 아님)
- `🚨` → **비상 판단 트리거** (§5로 이동)

### 3.2 진행 중 수동 확인 사항

자동 체크 외에 테스터 자체 수행:

```markdown
□ 본인 수행 중인 작업의 UPID를 Slack 채널에 공유 중인가
□ 본인 작업 전 대상 VM·자원의 현재 상태 스냅샷 기록했는가
□ 작업 결과(성공/실패/부분성공)를 WorkLog로 진행 중에 기록하는가
□ 다른 테스터가 수행 중인 작업과 자원 충돌 우려 없는가
```

### 3.3 자원 상태 drift 감지 (선택적, 1시간 주기 권장)

STN 중 누군가 의도치 않게 붉은 선을 넘지 않는지:

```bash
# storage.cfg, /etc/pve/nodes/*/qemu-server/ 의 변화 추적

# 시작 시점 스냅샷 저장
mkdir -p /tmp/stn-drift
cp /etc/pve/storage.cfg /tmp/stn-drift/storage.cfg.initial
cp -r /etc/pve/nodes /tmp/stn-drift/nodes.initial

# 중간 확인
diff /etc/pve/storage.cfg /tmp/stn-drift/storage.cfg.initial && echo "storage.cfg unchanged" || echo "⚠ storage.cfg CHANGED"
diff -r /etc/pve/nodes /tmp/stn-drift/nodes.initial | head -20
```

---

## 4. STN 종료 후 복기 템플릿

당일 STN 종료 후 또는 익일 아침 수행. **WorkLog로 작성**하는 것이 권고.

### 4.1 복기 문서 템플릿

```markdown
---
title: "WorkLog — STN Day-N 복기"
date: YYYY-MM-DD
author: "Davi"
series: "CMP Pre-Test WorkLogs"
category: "linux/proxmox/cmp-test/worklog/stn-review"
tags: [stn, review, postmortem]
---

## 0. STN 기본 정보
- 일자: YYYY-MM-DD
- 시간: HH:MM ~ HH:MM (총 NhN분)
- 참여 테스터: ___
- 테스트 영역: ___

## 1. 계획 대비 실제

### 1.1 계획한 것
- (Pre-test 체크리스트에서 예정했던 작업)

### 1.2 실제로 한 것
- (실제 수행한 작업)

### 1.3 차이
- (변경 사유)

## 2. P0 5건의 해소 상태

| 항목            | 당일 아침 | 진입 시 | 종료 시 |
| --------------- | --------- | ------- | ------- |
| P0-A 링크 속도  |           |         |         |
| P0-B CMP 라우팅 |           |         |         |
| P0-C NFS alias  |           |         |         |
| P0-D iSCSI 유령 |           |         |         |
| P0-E VM 112     |           |         |         |

## 3. 헬스 체크 이상 발견

### 3.1 STAGE 2 / STAGE 3 이상 신호
- (있다면 무엇, 언제, 해소되었는지)

### 3.2 30분 주기 체크에서의 이상
- (이상 플래그 발생 로그)

## 4. 새로 발견된 리스크

핸드북 01~08에 박제되지 않은 새 리스크:

| #   | 발견 | 격자 (L×R) | 우선순위 | 인계 |
| --- | ---- | ---------- | -------- | ---- |
| 1   |      |            |          |      |

## 5. 붉은 선 위반 여부

- [ ] 전면 금지 항목 위반 없음
- [ ] 합의 필수 항목은 모두 사전 합의 거침
- [ ] 사전 합의 없이 수행된 중요 작업:

## 6. CMP 기능 검증 결과

### 6.1 성공한 시나리오
- 

### 6.2 실패한 시나리오
- 
- 원인:
- 재현 가능 여부:

### 6.3 설계 제안 도출
- (CMP가 어떤 기능을 가져야 하는지에 대한 제안)

## 7. 다음 STN까지의 조치

| #   | 항목 | 담당 | 기한 |
| --- | ---- | ---- | ---- |

## 8. 핸드북 갱신 필요 항목

- 챕터 ___ §___: (어떻게 갱신할 것인가)
```

### 4.2 복기 문서의 가치

복기 템플릿의 핵심은 **"계획과 실제의 차이"와 "새 리스크 발견"** 두 축. 이 두 축이 누적되면:

1. 핸드북이 점점 현실에 가까워진다 (갱신 근거 축적)
2. 다음 STN의 예측 정확도가 올라간다
3. 유사 프로젝트 시 학습 자료가 된다

각 STN 당 복기 문서 1건이 WorkLog 시리즈에 누적되는 구조. 한 주에 5~10건의 STN이 이루어진다면 **주간 50건 규모의 복기 자산 축적**.

---

## 5. 비상 판단 플로우 — 즉시 중단 신호 발생 시

### 5.1 Level 1 — 경미한 이상 (`⚠`)

```markdown
발생 예: load avg 일시 상승, 특정 VM 1개 qga timeout

조치:
  1. 원인 VM 또는 노드 식별
  2. 최근 5분 내 본인 수행 작업과의 인과 확인
  3. 다른 테스터의 작업과 연관 여부 확인 (Slack 채널 체크)
  4. 5분 내 자동 해소되면 경과 관찰
  5. 5분 지나도 지속되면 Level 2로 격상
```

### 5.2 Level 2 — 중대한 이상 (`🚨` 비-클러스터 수준)

```markdown
발생 예: non-iSCSI ERROR 30분간 100건 이상, 특정 노드 load > 5 지속

조치:
  1. Slack 채널에 "WATCH: [현상] 보고" 공유
  2. 본인 진행 중 작업 일시 정지
  3. 다른 테스터에게 30분 내 동일 영역 작업 자제 요청
  4. 원인 진단 시작 (해당 노드 journalctl, dmesg, ps 순)
  5. 15분 내 원인 파악 실패 시 Level 3로 격상
```

### 5.3 Level 3 — STN 중단 (`🚨🚨` 클러스터 수준)

```markdown
발생 예: 정족수 이탈, TrueNAS 응답 없음, OOM 발생, Call Trace

조치:
  1. 🛑 Slack "STOP" 공유 — 모든 테스터 즉시 조작 중단
  2. 현재 상태 스냅샷 수집 (명령은 §5.4)
  3. 진행 중 모든 테스트 작업 기록 (UPID 목록)
  4. PL 또는 팀 리더 호출
  5. 운영팀 개입 요청 여부 결정 (TrueNAS·네트워크 장애 시)
  6. 복구 절차는 본 챕터 범위 밖 — 운영팀·개발팀과 현장 공조
```

### 5.4 비상 상태 스냅샷 수집 명령

Level 3 발생 시 사후 분석을 위해 즉시 수집:

```bash
# === EMERGENCY SNAPSHOT ===
# 사고 직후 수행. 이후 상태가 변해도 본 스냅샷이 기준점.

DUMP_DIR="/tmp/stn-emergency-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DUMP_DIR"
cd "$DUMP_DIR"

NODES="pve-nd01 pve-nd02 pve-nd03 pve-nd04 pve-nd05"

for n in $NODES; do
  # 각 노드별 덤프
  {
    echo "=== [$n] pvecm status ==="
    ssh "$n" "pvecm status"
    echo ""
    echo "=== [$n] corosync-quorumtool ==="
    ssh "$n" "corosync-quorumtool -s"
    echo ""
    echo "=== [$n] qm list ==="
    ssh "$n" "qm list"
    echo ""
    echo "=== [$n] last 100 journal lines ==="
    ssh "$n" "journalctl --no-pager -n 100"
    echo ""
    echo "=== [$n] dmesg tail ==="
    ssh "$n" "dmesg -T | tail -50"
    echo ""
    echo "=== [$n] ha-manager status ==="
    ssh "$n" "ha-manager status"
  } > "$n-emergency.log" 2>&1
done

# 클러스터 단위
ssh pve-nd01 "cat /etc/pve/storage.cfg" > storage.cfg.snapshot
ssh pve-nd01 "cat /etc/pve/corosync.conf" > corosync.conf.snapshot
ssh pve-nd01 "ha-manager config" > ha-config.snapshot

echo "Emergency snapshot saved to: $DUMP_DIR"
```

### 5.5 비상 상황 복기 필수 항목

§4의 복기 템플릿에 다음 섹션 추가:

```markdown
## 비상 상황 복기

### 감지 경로
- 누가 / 언제 / 어떤 체크에서 발견

### 근본 원인
- (사고 원인 요약)

### 파급 범위
- 영향받은 VM / 노드 / 데이터
- 실제 데이터 손실 여부

### 복구 과정
- HH:MM - HH:MM  (시간대별 조치 기록)

### 재발 방지
- 붉은 선 목록 갱신 필요 항목
- 체크리스트 §2 또는 §3에 추가할 항목
- 핸드북 챕터 08 리스크 매트릭스 갱신 제안
```

---

## 6. 체크리스트 사용 지침

### 6.1 출력 및 배포

- §1 붉은 선 1페이지: **A4 인쇄 → 회의실 벽** 또는 **구글 슬라이드 표지 페이지**
- §2 STAGE 1/2/3: Slack 채널 pinned 메시지 또는 팀 wiki
- §3 30분 주기 스크립트: cron 등록 또는 터미널 tmux 세션에 대기
- §4 복기 템플릿: WorkLog 시리즈 신규 문서의 초안

### 6.2 개인화 지점

다음 항목은 각 테스터 환경에 맞게 수정:

- §2.1.2 임시 우회 시 disable 대상 스토리지 이름
- §2.2 및 §3.1 bash 스크립트의 노드 이름 (본 환경은 고정이나 향후 확장 시)
- §5.4 DUMP_DIR 경로

### 6.3 버전 관리

본 챕터는 STN 경험이 누적되면서 계속 갱신될 것. 각 STN 복기 후:

1. §2, §3, §5의 체크 항목 중 "누락으로 문제 발생한 것" 추가
2. 이미 해소된 리스크는 §1 붉은 선에서 제거 검토
3. 변경 이력을 챕터 00의 "변경 이력" 섹션에 기록

---

## 7. 본 챕터에서 발견된 추가 항목

체크리스트 작성 과정에서 드러난 소소한 개선 여지:

| #   | 항목                                         | 우선순위 |
| --- | -------------------------------------------- | -------- |
| 7.1 | 매 30분 체크 자동화의 cron 정식 배포         | P3       |
| 7.2 | §5.4 비상 스냅샷의 저장소(장기 보존) 결정    | P3       |
| 7.3 | §4 복기 템플릿의 JSON 버전 (기계 판독용)     | P3       |
| 7.4 | 팀 리더가 당일 STN 지휘자 역할을 맡는 공식화 | P2       |

7.4는 **조직 합의 영역**이라 본 핸드북에서 결정할 수 없다. 팀 내 제안만 기록.

---

## 부록 A. 체크리스트 한 장 요약 (Quick Reference)

```markdown
 STAGE 1 (아침) : P0 5건 해소 확인                    [15분]
 STAGE 2 (진입) : 클러스터 헬스 6항목 스크립트         [5분]
 STAGE 3 (30분) : CMP UI + load + rx_drop + TrueNAS    [5분]
                                                       ─────
                                                       25분
 
 진행 중 30분 주기 : 자동 스크립트 (non-iSCSI ERROR,
                     OOM, load, TrueNAS 응답)           [3분]
 
 비상 Level 1 : 5분 관찰 → 해소 / 격상
        Level 2 : 15분 진단 → 해소 / 격상
        Level 3 : STOP → 스냅샷 → PL 호출
 
 종료 후 복기 : WorkLog 1건 작성                       [30분]
```

## 부록 B. 참고 자료

| 주제                | 본 핸드북 참조                                      |
| ------------------- | --------------------------------------------------- |
| 붉은 선 근거        | 챕터 08 §3                                          |
| P0 5건 상세         | 챕터 08 §5.1                                        |
| 격자 매트릭스       | 챕터 08 §1 / 부록 A                                 |
| 자원 격리 원칙      | 챕터 08 §4                                          |
| 헬스 체크 기초 명령 | 챕터 02~07 각 §A(명령 치트 시트)                    |
| 로그 해석 가이드    | 챕터 07 §1 / §3                                     |
| iSCSI 유령 LUN 정리 | WorkLog 2026-04-24-iscsi-multi-storage-provisioning |

| 주제                              | 외부 링크                                       |
| --------------------------------- | ----------------------------------------------- |
| Proxmox VE Admin Guide            | https://pve.proxmox.com/pve-docs/               |
| SRE Workbook — Postmortem Culture | https://sre.google/workbook/postmortem-culture/ |

---

> **다음 챕터**: `10-recon-output-templates.md` — 본 챕터의 §4 복기 템플릿, 자원 생성 요청서, VM 처분 제안서, 작성자 추적 리포트 등 핸드북에서 반복 참조되는 산출물 양식을 통합 정리한다.
