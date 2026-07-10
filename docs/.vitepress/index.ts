/**
 * docLint 실행기와 Vite 플러그인
 * ─────────────────────────────────────────────────────────────────────────
 * 시점: buildStart. dev 서버 기동과 build 양쪽에서 렌더 전에 1회 실행된다.
 * 모드: dev는 전 채널 출력 전용, build는 error 발생 시 중단한다.
 *       (1차 파동의 직접 검사 규칙은 warn뿐이라 중단 경로는 배선만 살아 있다)
 * 시야: 로더가 아니라 파일 시스템을 직접 걷는다. glob 밖 문서도 보여야 한다.
 * 파서: VitePress가 내부에서 쓰는 gray-matter를 공용해 파싱 불일치를 차단한다.
 *
 * 배치 위치: docs/.vitepress/lint/index.ts
 * 근거 결정: DOCS-ADR-0003 §2.3(집행 매트릭스), §2.4(후킹 지점), §2.7(출력 계약)
 * ─────────────────────────────────────────────────────────────────────────
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import matter from 'gray-matter'
import type { Plugin } from 'vite'
import {
  RULES,
  EXCLUDED_DIR_NAMES,
  EXCLUDED_FILE_PREFIX,
  type DocFile,
} from './lint/rules'

// 스캐너의 보행 제외. 콘텐츠 제외(EXCLUDED_DIR_NAMES)에 시스템 디렉터리를 더한다.
const SKIP_DIRS = new Set<string>([...EXCLUDED_DIR_NAMES, '.vitepress', 'node_modules', 'public'])

// ── 스캐너 ─────────────────────────────────────────────────────────────────
function scan(srcDir: string): DocFile[] {
  const docs: DocFile[] = []

  const walk = (absDir: string, relDir: string): void => {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(absDir, entry.name), relPath)
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      if (entry.name.startsWith(EXCLUDED_FILE_PREFIX)) continue

      try {
        docs.push({ path: relPath, fm: matter(readFileSync(join(absDir, entry.name), 'utf-8')).data })
      } catch {
        // 파싱 자체가 불가능한 frontmatter는 목록화만 한다. 정식 규칙화는 2차 파동 후보.
        console.warn(`[docLint] frontmatter 파싱 실패: ${relPath}`)
      }
    }
  }

  walk(srcDir, '')
  return docs
}

// ── 실행기 ─────────────────────────────────────────────────────────────────
interface Finding { ruleId: string; path: string; msg: string }

export function runDocLint(srcDir: string, isBuild: boolean): void {
  const docs      = scan(srcDir)
  const active    = RULES.filter(r => r.enabled)
  const own       = active.filter(r => r.engine === 'doclint' && r.check)
  const delegated = active.filter(r => r.engine !== 'doclint')

  const findings: Finding[] = []
  for (const rule of own) {
    for (const doc of docs) {
      if (rule.applies && !rule.applies(doc)) continue
      // error 규칙은 발행 문서(draft: false)만 집행한다. draft 해제 = 게이트 통과 신청 (0003 §2.3)
      if (rule.severity === 'error' && doc.fm.draft === true) continue
      const msg = rule.check!(doc)
      if (msg) findings.push({ ruleId: rule.id, path: doc.path, msg })
    }
  }

  // ── 출력 계약: 헤더 → 규칙별 블록 → 위임 목록 → 요약 (0003 §2.7) ──────────
  const published = docs.filter(d => d.fm.draft !== true).length
  console.log(`\n[docLint] 문서 ${docs.length}건(발행 ${published}) · 규칙 ${active.length}개(위임 ${delegated.length})`)

  let errorCount = 0
  for (const rule of own) {
    const hits = findings.filter(f => f.ruleId === rule.id)
    if (hits.length === 0) continue
    console.log(`\n${rule.severity.toUpperCase().padEnd(5)}  ${rule.id} · ${rule.summary} · ${hits.length}건`)
    for (const hit of hits) console.log(`  · ${hit.path}  (${hit.msg})`)
    if (rule.severity === 'error') errorCount += hits.length
  }

  for (const rule of delegated) {
    console.log(`위임    ${rule.id} → ${rule.engine} · ${rule.summary}`)
  }

  if (errorCount > 0 && isBuild) throw new Error(`[docLint] build 중단: ERROR ${errorCount}건`)
  if (errorCount > 0) console.log(`\n[docLint] dev 모드: ERROR ${errorCount}건 (build에서 중단됩니다)\n`)
  else console.log(`[docLint] 중단 사유 없음\n`)
}

// ── Vite 플러그인 ───────────────────────────────────────────────────────────
export function docLint(srcDir: string): Plugin {
  let isBuild = false
  let active  = true

  return {
    name: 'doclint',
    configResolved(config) {
      isBuild = config.command === 'build'
      // VitePress build는 클라이언트·서버 번들을 각각 돌리므로 buildStart가 두 번 온다.
      // SSR 패스를 건너뛰어 정확히 1회만 실행한다.
      active = !config.build?.ssr
    },
    buildStart() {
      if (active) runDocLint(srcDir, isBuild)
    },
  }
}
