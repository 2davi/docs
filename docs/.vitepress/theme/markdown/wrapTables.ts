import type MarkdownIt from 'markdown-it'

/** renderer.rules 함수 시그니처를 @types 버전 무관하게 추출 */
type RenderRule = NonNullable<MarkdownIt['renderer']['rules'][string]>

/**
 * ── 표 래핑 플러그인 ─────────────────────────────────────────────
 * <table>…</table> → <div class="table-container"><table>…</table></div>
 *
 * 책임 분리의 렌더링 쪽 절반:
 *   - .table-container : 가로 스크롤 담당 (style.css에 이미 존재)
 *   - table 본체        : display: table + width: 100% (폭 담당)
 *
 * 리터럴 문자열 반환 대신 기존 렌더러에 위임하는 이유:
 * VitePress가 쓰는 markdown-it-attrs 등이 table_open 토큰에 심은
 * 속성(class, id …)을 renderToken이 살려서 출력한다.
 * 하드코딩하면 그 속성이 전부 증발한다.
 */
export function wrapTables(md: MarkdownIt): void {
  const renderDefault: RenderRule = (tokens, idx, options, _env, self) =>
    self.renderToken(tokens, idx, options)

  const origOpen  = md.renderer.rules.table_open  ?? renderDefault
  const origClose = md.renderer.rules.table_close ?? renderDefault

  md.renderer.rules.table_open = (tokens, idx, options, env, self) =>
    '<div class="table-container">' + origOpen(tokens, idx, options, env, self)

  md.renderer.rules.table_close = (tokens, idx, options, env, self) =>
    origClose(tokens, idx, options, env, self) + '</div>'
}