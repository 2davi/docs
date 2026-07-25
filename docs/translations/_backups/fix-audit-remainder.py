#!/usr/bin/env python3
"""translations 감사 잔여 4항목 일괄 교정.

교정 항목:
  1. translation_fidelity 선언 교정 (12편: restructured→faithful)
  2. attribution 문단2 재구성 — 변경 표시 문구를 fidelity에 맞추고,
     남아 있던 코드 라이선스 잔재를 제거하며, 자율 고지 2문장을 삽입
  3. 경험 슬롯 비렌더화 (가시 blockquote → HTML 주석 내부로)
  4. ai_assistance.model 식별자 표기 통일 (Claude Opus 4.8 → claude-opus-4.8)

근거: DOCS-CDR-0001 §2.2·§2.3·§2.5, DOCS-ADR-0004 §2.2

전제: 이 스크립트는 attribution 블록이 normalize-attribution.py로
      표준형(5줄, 문단3개)으로 정규화된 뒤에 돌린다.

사용 (git bash / PowerShell / cmd 공통):
  python fix-audit-remainder.py <대상디렉터리>          # 미리보기
  python fix-audit-remainder.py <대상디렉터리> --apply   # 실제 수정
되돌리려면 git checkout .
"""
import sys, re, pathlib

# fidelity가 restructured로 남아야 하는 3편 (집약 절 보유). 나머지는 faithful로 교정
KEEP_RESTRUCTURED = {'kubeadm-init-phase', 'kubeadm-join-phase', 'kubeadm-upgrade-phase'}

# 변경 표시 문구 (body-template.md 대조표와 일치)
NOTICE = {
    'faithful':     '원문의 절 순서와 계층을 보존해 옮기고 역자 주를 더했다.',
    'restructured': '원문을 한국어로 옮기며 두괄식으로 재구성하고 역자 주를 더했다.',
}
# 자율 고지 2문장 (DOCS-CDR-0001 §2.3)
DISCLAIMER = ('비공식 번역이며 원저작자와 프로젝트의 공인을 받지 않았다. '
              '원문과 번역이 어긋날 경우 원문이 우선한다.')


def split_frontmatter(raw):
    m = re.match(r'^(---\n.*?\n---\n)(.*)$', raw, re.S)
    return m.group(1), m.group(2)


def fix_fidelity_field(fm_text, target):
    return re.sub(r'(translation_fidelity:\s*)"[^"]*"',
                  rf'\1"{target}"', fm_text, count=1)


def fix_model_id(fm_text):
    # "Claude Opus 4.8" → "claude-opus-4.8" (대소문자·공백 → 소문자 하이픈)
    def repl(m):
        ident = m.group(1)
        norm = ident.lower().replace(' ', '-')
        return f'"{norm}"'
    return re.sub(r'"(Claude[^"]*)"', repl, fm_text)


def rebuild_attribution(body, fidelity):
    """표준형 attribution 블록의 문단2를 재구성한다.

    문단1(원문:)과 문단3(원문 시점)은 보존한다.
    문단2를 [변경표시 문구 + 라이선스 한 줄 + 자율고지]로 재작성한다.
    라이선스 표기는 CC BY 4.0 단일로 통일한다.
    """
    lines = body.split('\n')
    # 표준형 블록 위치: 첫 '> **원문:**'부터 연속 '>' 구간
    start = next((i for i, l in enumerate(lines) if l.startswith('> **원문:**')), None)
    if start is None:
        return body, False
    end = start
    while end < len(lines) and lines[end].startswith('>'):
        end += 1

    block = lines[start:end]
    # 문단 경계(빈 인용 줄 '>')로 3분할
    paras, cur = [], []
    for l in block:
        if l.strip() == '>':
            if cur:
                paras.append(cur); cur = []
        else:
            cur.append(l)
    if cur:
        paras.append(cur)
    if len(paras) != 3:
        return body, False

    para1, _, para3 = paras
    # 라이선스 표기: 문단1에 이미 원문 라이선스 링크가 있으므로 문단2는 본문 CC BY 4.0만 명시
    new_para2 = [
        f'> 이 문서는 {NOTICE[fidelity]} '
        f'문서 본문은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)을 따른다. '
        f'{DISCLAIMER}'
    ]
    new_block = para1 + ['>'] + new_para2 + ['>'] + para3
    lines[start:end] = new_block
    return '\n'.join(lines), True


def fix_experience_slot(body):
    """가시 경험 슬롯을 HTML 주석 안으로 넣는다.

    대상 패턴(정규화 전제):
      <!-- REVIEW-REQUIRED: ... -->
      > **역자 주 · 적용(경험)**
      > (직접 실습·검증한 결과가 있을 때만 1인칭으로 기록)

    → 슬롯 전체를 단일 HTML 주석으로 대체.
    """
    pat = re.compile(
        r'<!-- REVIEW-REQUIRED:.*?-->\n'            # 여는 주석 (여러 줄 가능)
        r'> \*\*역자 주 · 적용\(경험\)\*\*\n'
        r'> \([^\n]*\)',
        re.S)
    replacement = (
        '<!-- REVIEW-REQUIRED · 경험 슬롯\n'
        '     직접 실습·검증한 결과가 있으면 아래 블록의 주석을 풀고 1인칭으로 채운다.\n'
        '     없으면 이 주석 블록째로 삭제한다. 채우지 않은 채 draft를 해제하지 않는다.\n'
        '> **역자 주 · 적용(경험)**\n'
        '> <1차 경험을 1인칭으로>\n'
        '-->')
    new, n = pat.subn(replacement, body)
    return new, n


def process(path):
    with open(path, 'r', encoding='utf-8', newline='') as f:
        raw = f.read()
    nl = '\r\n' if '\r\n' in raw else '\n'
    raw = raw.replace('\r\n', '\n')

    fm_text, body = split_frontmatter(raw)
    stem = path.stem
    report = []

    target_fid = 'restructured' if stem in KEEP_RESTRUCTURED else 'faithful'
    cur_fid = re.search(r'translation_fidelity:\s*"([^"]*)"', fm_text)
    cur_fid = cur_fid.group(1) if cur_fid else None
    if cur_fid != target_fid:
        fm_text = fix_fidelity_field(fm_text, target_fid)
        report.append(f'fidelity {cur_fid}→{target_fid}')

    fm2 = fix_model_id(fm_text)
    if fm2 != fm_text:
        report.append('model-id 정규화')
        fm_text = fm2

    body2, ok = rebuild_attribution(body, target_fid)
    if ok and body2 != body:
        report.append('attribution 문단2 재구성(+자율고지)')
        body = body2

    body3, n = fix_experience_slot(body)
    if n:
        report.append(f'경험 슬롯 비렌더화({n})')
        body = body3

    return nl.join((fm_text + body).split('\n')), report, nl


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
        if apply:
            with open(p, 'w', encoding='utf-8', newline='') as f:
                f.write(new)

    print(f'\n{"-"*60}')
    print(f'교정 {total}편{"  [적용 완료]" if apply else "  [미리보기, 미적용]"}')


if __name__ == '__main__':
    main()
