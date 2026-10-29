// Shared HR form components (features/hr-recruitment/shared): options added for
// the employee-services screens. Every option defaults to the earlier
// behaviour, so the existing HR pages are unchanged except for title
// wrapping. Source and stylesheet checks; no DOM is used.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { titleWords } from '../src/features/hr-recruitment/shared/hrFormat.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')
const SHARED = '../src/features/hr-recruitment/shared/components/'
const CSS = '../src/styles/hr-recruitment.css'

test('titleWords: one group per word; the animation index counts the spaces, as before', () => {
  assert.deepEqual(titleWords('Personnel Record Change'), [
    { text: 'Personnel', start: 0 }, { text: 'Record', start: 10 }, { text: 'Change', start: 17 },
  ])
  assert.deepEqual(titleWords('Offer'), [{ text: 'Offer', start: 0 }])
  assert.deepEqual(titleWords(''), [{ text: '', start: 0 }])
  // The last character keeps the index it had when the title was split per character.
  const title = 'Periodwise Employees'
  const words = titleWords(title)
  const last = words.at(-1)
  assert.equal(last.start + last.text.length - 1, title.length - 1)
})

test('page titles wrap between words only, on every HR page (one shared header)', async () => {
  const shell = await read(`${SHARED}RecruitmentShell.jsx`)
  assert.match(shell, /titleWords\(title\)\.map\(\(word, index, words\) => \(/)
  assert.match(shell, /<span key=\{index\} className="zrv-hr-word" aria-hidden="true">/)
  assert.match(shell, /style=\{\{ '--i': word\.start \+ offset \}\}/)
  assert.doesNotMatch(shell, /title\.split\(''\)/, 'no per-character split across words')
  assert.match(shell, /<h1 className="zrv-hr-title" aria-label=\{title\}>/, 'the heading keeps its accessible name')
  const css = await read(CSS)
  assert.match(css, /\.zrv-hr-word \{ display: inline-block; white-space: nowrap; \}/)
  assert.match(css, /\.zrv-hr-word > span \{ display: inline-block; animation: zrv-hr-char/)
})

test('step track: one column per step (--n), defaulting to the earlier four', async () => {
  const shell = await read(`${SHARED}RecruitmentShell.jsx`)
  assert.match(shell, /style=\{\{ '--step': step, '--n': steps\.length \}\}/)
  const css = await read(CSS)
  assert.match(css, /\.zrv-hr-track \{[^}]*grid-template-columns: repeat\(var\(--n, 4\), minmax\(0, 1fr\)\);/)
  assert.match(css, /\.zrv-hr-track__fill \{[^}]*width: calc\(\(100% - 20px - \(var\(--n, 4\) - 1\) \* 10px\) \/ var\(--n, 4\)\);/)
  // With four steps the fill width equals the earlier (100% - 50px) / 4.
  const fillOffset = (n) => 20 + (n - 1) * 10
  assert.equal(fillOffset(4), 50)
  assert.equal(fillOffset(3), 40)
})

test('RecruitmentShell options: flow, compact and banner default to the earlier layout', async () => {
  const shell = await read(`${SHARED}RecruitmentShell.jsx`)
  assert.match(shell, /demo, flow = true, compact = false, banner = null, breadcrumb, children,/)
  assert.match(shell, /className=\{`zrv-hr zrv-hr--\$\{current\}\$\{compact \? ' zrv-hr--compact' : ''\}`\}/)
  assert.match(shell, /\{flow && <FlowNav current=\{current\} status=\{flowStatus\} \/>\}/)
  assert.match(shell, /\{ticket\}\n\s*\{banner\}\n/, 'the banner sits between the ticket strip and the step track')
  assert.match(shell, /<RecruitmentHeader title=\{title\} subtitle=\{subtitle\} demo=\{demo\} breadcrumb=\{breadcrumb\} \/>/)
  assert.match(shell, /breadcrumb = COMMON_TEXT\.breadcrumb, demo = false \}/, 'an undefined breadcrumb keeps the recruitment one')
  const css = await read(CSS)
  for (const rule of ['.zrv-hr--compact .zrv-hr-title', '.zrv-hr--compact .zrv-hr-track__fill', '.zrv-hr--compact .zrv-hr-panel', '.zrv-hr--compact .zrv-hr-input']) {
    assert.ok(css.includes(`${rule} {`), rule)
  }
  assert.match(css, /\.zrv-hr--compact \.zrv-hr-track__fill \{[^}]*width: calc\(\(100% - 12px - \(var\(--n, 4\) - 1\) \* 6px\) \/ var\(--n, 4\)\); transform: translateX\(calc\(var\(--step\) \* \(100% \+ 6px\)\)\);/)
  // Every compact rule is scoped to the opt-in class.
  const compactBlock = css.slice(css.indexOf('/* compact frame'), css.indexOf('/* tight employee picker'))
  const selectors = compactBlock.split('\n').filter((line) => line.includes('{')).map((line) => line.slice(0, line.indexOf('{')))
  assert.ok(selectors.length >= 20 && selectors.every((selector) => selector.startsWith('.zrv-hr--compact')))
})

test('RecruitmentLoader options: flow, identify and breadcrumb keep the recruitment defaults', async () => {
  const loader = await read(`${SHARED}RecruitmentLoader.jsx`)
  assert.match(loader, /flow = true, identify = identifyDemoUser, breadcrumb, children,/)
  assert.match(loader, /\{flow && <FlowNav current=\{current\} \/>\}/)
  assert.match(loader, /useEffect\(\(\) => identify\(user\?\.fullName\), \[identify, user\?\.fullName\]\)/)
  assert.match(loader, /<RecruitmentHeader title=\{title\} subtitle=\{subtitle\} demo=\{demo\} breadcrumb=\{breadcrumb\} \/>/)
})

test('EmployeePicker options: tight variant and a separate cache-key prefix', async () => {
  const picker = await read(`${SHARED}EmployeePicker.jsx`)
  assert.match(picker, /searchService, placeholder = PICKER_TEXT\.placeholder, tight = false, disabled = false, cacheKey = 'hr-employees' \}/)
  assert.match(picker, /pendingSearch = open && search !== query\.trim\(\)/, 'debounced input shows a pending search immediately')
  assert.match(picker, /pendingSearch \|\| results\.status === 'loading'.*PICKER_TEXT\.searching/, 'loading is visible in the result list')
  assert.match(picker, /useResource\(open \? `\$\{cacheKey\}:\$\{search\.toLowerCase\(\)\}` : null,/)
  assert.match(picker, /zrv-hr-combo\$\{tight \? ' zrv-hr-combo--tight' : ''\}/)
  assert.match(picker, /\{!tight && <span className="zrv-hr-combo__av" aria-hidden="true">/)
  // Listbox semantics are unchanged in both variants.
  assert.match(picker, /role="combobox"/)
  assert.match(picker, /role="listbox"/)
  const css = await read(CSS)
  assert.match(css, /\.zrv-hr-combo--tight \.zrv-hr-combo__list \{ left: 0; \}/)
})

test('existing HR pages do not opt into the new options', async () => {
  const pages = ['requisition/RequisitionPage.jsx', 'interview/InterviewPage.jsx', 'offer/OfferPage.jsx', 'orientation/OrientationPage.jsx', 'probation/ProbationPage.jsx']
  for (const page of pages) {
    const source = await read(`../src/features/hr-recruitment/${page}`)
    assert.doesNotMatch(source, /banner=|flow=\{false\}|\btight\b|cacheKey=/, page)
    const shellTags = source.match(/<RecruitmentShell\b[\s\S]*?>/g) ?? []
    assert.ok(shellTags.length > 0 && shellTags.every((tag) => !/\bcompact\b/.test(tag)), `${page}: RecruitmentShell is not compact`)
  }
})
