#!/usr/bin/env python3
"""translations series/review 필드 교정. 근거: DOCS-CDR-0002 §2.1·§2.3.

교정 항목:
  1. series_order 재부여 — 시리즈 내 순번(1부터)으로 복원
  2. 낱개 시리즈 해체 — 구성 1편인 시리즈는 series/series_order를 비운다
  3. reviewed → reviewing 재분류 — 어휘 밖 값 폐기

확정된 배치 (Davi 지정):
  Kube ADM: init 계열 → join 계열 → upgrade 계열 → reset 계열 → config → token
            각 계열은 본체 다음에 -phase
  Administer a Cluster: k8s-node-allocatable(1) → encrypting-data-at-rest(2)
  낱개 해체: authorization, static-pods, containerd-runtime-v2

사용 (git bash / PowerShell / cmd 공통):
  python fix-series-review.py <대상디렉터리>          # 미리보기
  python fix-series-review.py <대상디렉터리> --apply   # 실제 수정
되돌리려면 git checkout .
"""
import sys, re, pathlib

# ── 시리즈 내 순번 지정 (slug → series_order) ──
SERIES_ORDER = {
    # Kube ADM: 계열별 본체+phase, init→join→upgrade→reset→config→token
    'kubeadm-init':          1,
    'kubeadm-init-phase':    2,
    'kubeadm-join':          3,
    'kubeadm-join-phase':    4,
    'kubeadm-upgrade':       5,
    'kubeadm-upgrade-phase': 6,
    'kubeadm-reset':         7,
    'kubeadm-reset-phase':   8,
    'kubeadm-config':        9,
    'kubeadm-token':        10,
    # Administer a Cluster: 노드 → 보안
    'k8s-node-allocatable':      1,
    'encrypting-data-at-rest':   2,
}

# ── 낱개로 해체할 문서 (series/series_order 제거) ──
DISBAND = {'authorization', 'static-pods', 'containerd-runtime-v2'}

# ── review 어휘 교정 (어휘 밖 → reviewing) ──
REVIEW_FIX = {'reviewed': 'reviewing'}


def edit_scalar(fm, key, value):
    """frontmatter 텍스트에서 `key: <old>`를 `key: <value>`로. 들여쓰기 보존."""
    pat = re.compile(rf'^(\s*){re.escape(key)}:\s*.*$', re.M)
    def repl(m):
        return f'{m.group(1)}{key}: {value}'
    new, n = pat.subn(repl, fm, count=1)
    return new, n


def process(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        raw = f.read()
    nl = '\r\n' if '\r\n' in raw else '\n'
    raw = raw.replace('\r\n', '\n')

    m = re.match(r'^(---\n)(.*?)(\n---\n)(.*)$', raw, re.S)
    if not m:
        return None, [], nl
    head, fm, mid, body = m.groups()
    stem = path.stem
    report = []

    # 1. review 어휘 교정
    cur_review = re.search(r'^\s*review:\s*"?([\w-]+)"?', fm, re.M)
    cur_review = cur_review.group(1) if cur_review else None
    if cur_review in REVIEW_FIX:
        target = REVIEW_FIX[cur_review]
        fm, _ = edit_scalar(fm, 'review', f'"{target}"')
        report.append(f'review {cur_review}→{target}')

    # 2. 낱개 해체 (이미 비어 있으면 건너뛴다 → 멱등)
    if stem in DISBAND:
        cur_ser = re.search(r'^\s*series:\s*(\S+)', fm, re.M)
        cur_ser = cur_ser.group(1) if cur_ser else None
        cur_so = re.search(r'^\s*series_order:\s*(\S+)', fm, re.M)
        cur_so = cur_so.group(1) if cur_so else None
        need = (cur_ser not in (None, '~')) or (cur_so not in (None, '~'))
        if need:
            fm, _ = edit_scalar(fm, 'series', '~')
            fm, _ = edit_scalar(fm, 'series_order', '~')
            report.append(f'낱개 해체(series {cur_ser}→~, series_order {cur_so}→~)')
    # 3. series_order 재부여
    elif stem in SERIES_ORDER:
        target = SERIES_ORDER[stem]
        cur = re.search(r'^\s*series_order:\s*(\S+)', fm, re.M)
        cur = cur.group(1) if cur else None
        if str(cur) != str(target):
            fm, _ = edit_scalar(fm, 'series_order', str(target))
            report.append(f'series_order {cur}→{target}')

    return head + fm + mid + body, report, nl


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    root = pathlib.Path(sys.argv[1])
    apply = '--apply' in sys.argv

    total = 0
    for p in sorted(root.rglob('*.md')):
        if p.name == 'index.md':
            continue
        new, report, nl = process(p)
        if not report:
            continue
        total += 1
        print(f'\n[{p.stem}]')
        for r in report:
            print(f'  · {r}')
        if apply and new is not None:
            with open(p, 'w', encoding='utf-8', newline='') as f:
                f.write(nl.join(new.split('\n')))

    print(f'\n{"-"*60}')
    print(f'교정 {total}편{"  [적용 완료]" if apply else "  [미리보기, 미적용]"}')


if __name__ == '__main__':
    main()
