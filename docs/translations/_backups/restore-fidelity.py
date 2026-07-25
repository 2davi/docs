#!/usr/bin/env python3
"""translations 15편 fidelity를 restructured로 복원.

근거: DOCS-CDR-0001 §2.2 개정(2026-07-25). 판정 축이 "절 배치"에서
     "절 배치 + 내용 추가" 둘로 확장됨. 15편 전부 원문에 없는
     다이어그램·학습 인사이트·종합 결론을 더했으므로 restructured다.

교정 항목:
  1. translation_fidelity 를 "restructured"로 (15편)
  2. attribution 변경 표시 문구를 새 §2.3 restructured 문구로 통일

배경: 이전 fix-audit-remainder.py가 12편을 faithful로 뒤집고
     faithful 문구로 바꿔 놓았다. 이 스크립트는 그 역전이다.
     당시 판정은 절 순서만 본 오판이었고, CDR-0001 §2.2 개정으로
     판정 기준 자체가 바로잡혔다.

새 변경 표시 문구 (CDR-0001 §2.3):
  restructured: "원문을 학습 목적으로 재구성하고 역자 주와 다이어그램을 더했다"

주의: §2.3은 "실제 변경의 종류는 문구 뒤에 이어 적어 구체화한다"고 규정한다.
     이 스크립트는 공통 문구로 통일만 하며, 문서별 세부 구체화(무엇을
     추가했는지)는 원문 대조가 필요하므로 별도 작업으로 남긴다.

사용 (git bash / PowerShell / cmd 공통):
  python restore-fidelity.py <대상디렉터리>          # 미리보기
  python restore-fidelity.py <대상디렉터리> --apply   # 실제 수정
되돌리려면 git checkout .
"""
import sys, re, pathlib

# 새 restructured 변경 표시 문구 (CDR-0001 §2.3, 2026-07-25 개정)
NEW_NOTICE = '원문을 학습 목적으로 재구성하고 역자 주와 다이어그램을 더했다.'

# 교체 대상 옛 문구 2종 (faithful 12편 + 구 restructured 3편)
OLD_NOTICES = [
    '원문의 절 순서와 계층을 보존해 옮기고 역자 주를 더했다.',
    '원문을 한국어로 옮기며 두괄식으로 재구성하고 역자 주를 더했다.',
]


def process(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        raw = f.read()
    nl = '\r\n' if '\r\n' in raw else '\n'
    raw = raw.replace('\r\n', '\n')

    m = re.match(r'^(---\n)(.*?)(\n---\n)(.*)$', raw, re.S)
    if not m:
        return None, [], nl
    head, fm, mid, body = m.groups()
    report = []

    # 1. fidelity 필드 → restructured (이미 restructured면 건너뜀 → 멱등)
    cur = re.search(r'translation_fidelity:\s*"([^"]*)"', fm)
    cur = cur.group(1) if cur else None
    if cur != 'restructured':
        fm = re.sub(r'(translation_fidelity:\s*)"[^"]*"',
                    r'\1"restructured"', fm, count=1)
        report.append(f'fidelity {cur}→restructured')

    # 2. attribution 변경 문구 통일 (이미 새 문구면 건너뜀 → 멱등)
    if NEW_NOTICE not in body:
        replaced = False
        for old in OLD_NOTICES:
            if old in body:
                body = body.replace(old, NEW_NOTICE, 1)
                replaced = True
                report.append('변경 문구 → restructured(§2.3)')
                break
        if not replaced and report:
            # fidelity는 바꿨는데 문구를 못 찾은 경우 경고
            report.append('⚠ 변경 문구 미발견(수동 확인 필요)')

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
