/**
 * redirects.config.ts
 * 이사의 정본 대장. 구주소('/'로 시작, 확장자 없음) → 신주소.
 * 소비자: config.mts buildEnd(스텁 생성), docLint redirect-integrity(예정).
 * 순수 데이터 모듈로 유지한다. 근거: DOCS-ADR-0002 §2.8
 */
export const SITE_ORIGIN = 'https://docs.the2davi.dev'

export const REDIRECTS: Readonly<Record<string, string>> = {
  // ── decisions 섹션 이관 (DOCS-ADR-0002 §2.9) ──
  '/deep-dive/rest-domain-state-manager/adr-0000-alignment': '/decisions/rdsm/rdsm-adr-0000-alignment',
  '/deep-dive/rest-domain-state-manager/adr-0001-alignment': '/decisions/rdsm/rdsm-adr-0001-alignment',
  '/deep-dive/rest-domain-state-manager/adr-0002-alignment': '/decisions/rdsm/rdsm-adr-0002-alignment',
  '/deep-dive/rest-domain-state-manager/adr-0003-alignment': '/decisions/rdsm/rdsm-adr-0003-alignment',
  '/notes/blog-ops/cdr-0001-save-strategy-pivot':            '/decisions/rdsm/rdsm-cdr-0001-save-strategy-pivot',

  // ── 계보 발굴: 조상 주소는 최종 주소로 직행 (체인 금지) ──
  '/notes/cdr-0001-save-strategy-pivot':                     '/decisions/rdsm/rdsm-cdr-0001-save-strategy-pivot',
  '/deep-dive/async-cancellation/03-composition':            '/deep-dive/async-cancellation/03-composition-concurrency',
}