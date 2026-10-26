import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ATTENTION_ITEMS,
  BOOK_PAGES,
  BUSINESS_SPACES,
  DOMAIN_DEFINITIONS,
  FOOTER_COUNTS,
  MODULES,
  MODULES_PER_PAGE,
  MODULE_TOPICS,
  PREVIEW_PROFILE,
  PROFILE_FIELDS,
  QUICK_CATEGORY_IDS,
  QUICK_DEFINITIONS,
  WORKFLOW_BARS,
  displayName,
  filterModules,
  formatDateLabel,
  initialsOf,
  profileAvatarUrl,
  profileRows,
  resolveProfile,
} from '../src/features/dashboard/dashboardExperience.js'

// ------------------------------------------------------------ catalogue model

test('the catalogue has twelve domains with eighteen unique modules each', () => {
  assert.equal(DOMAIN_DEFINITIONS.length, 12)
  for (const domain of DOMAIN_DEFINITIONS) {
    const topics = MODULE_TOPICS[domain.name]
    assert.ok(Array.isArray(topics), domain.name)
    assert.equal(topics.length, 18, domain.name)
    assert.equal(new Set(topics).size, 18, domain.name)
  }
  assert.equal(MODULES.length, 216)
  assert.equal(new Set(MODULES.map((module) => `${module.domain}:${module.name}`)).size, 216)
  assert.ok(MODULES.every((module) => !('view' in module)))
  assert.equal(MODULES_PER_PAGE, 32)
})

test('catalogue filtering searches names and domains', () => {
  assert.equal(filterModules().length, 216)
  assert.ok(filterModules({ domain: 'Finance' }).every((module) => module.domain === 'Finance'))
  assert.deepEqual(
    filterModules({ query: 'bank reconciliation' }).map((module) => module.name),
    ['Bank Reconciliation'],
  )
  assert.equal(filterModules({ domain: 'Finance', query: 'credit' }).length, 1)
  assert.equal(filterModules({ domain: 'Not a domain' }).length, 0)
})

// ------------------------------------------------------------ dashboard content

test('the folio and quick links keep the approved dashboard content', () => {
  assert.deepEqual(BOOK_PAGES.map((page) => page.name), ['People', 'Finance', 'Approvals', 'Insights', 'Explore'])
  assert.equal(BOOK_PAGES.find((page) => page.id === 'explore').view, 'atlas')
  assert.ok(BOOK_PAGES.filter((page) => page.id !== 'explore').every((page) => !('view' in page)))
  assert.deepEqual(QUICK_CATEGORY_IDS, ['HR', 'Finance', 'Supply', 'Projects'])
  for (const id of QUICK_CATEGORY_IDS) {
    assert.equal(QUICK_DEFINITIONS[id].forms.length, 4, id)
    assert.ok(QUICK_DEFINITIONS[id].forms.every((form) => !('view' in form)), id)
  }
  assert.equal(BUSINESS_SPACES.length, 6)
  assert.equal(ATTENTION_ITEMS.length, 3)
  assert.equal(WORKFLOW_BARS.length, 9)
  assert.deepEqual(FOOTER_COUNTS, { modules: 216, views: 1 })
})

// ------------------------------------------------------------ profile helpers

test('profile helpers preserve real values and isolate preview values', () => {
  const real = resolveProfile({
    fullName: 'Amina Khan',
    employeeNumber: '42',
    username: 'amina',
    email: 'a@example.com',
    jobTitle: 'Engineer',
    department: 'Ops',
  }, 'ready')
  assert.equal(real.isPreview, false)
  assert.equal(displayName(real), 'Amina Khan')
  assert.equal(initialsOf(displayName(real)), 'AK')
  assert.deepEqual(
    profileRows(real).map((field) => field.value),
    ['Amina Khan', '42', 'amina', 'a@example.com', 'Engineer', 'Ops'],
  )

  const preview = resolveProfile(null, 'preview')
  assert.equal(preview.isPreview, true)
  assert.equal(preview.fullName, PREVIEW_PROFILE.fullName)
  assert.equal(preview.avatarUrl, '')
  assert.equal(profileRows(preview).length, PROFILE_FIELDS.length)
  assert.equal(displayName({}), 'Your workspace')
  assert.equal(initialsOf(''), 'ZW')
  assert.equal(typeof formatDateLabel(new Date('2026-10-24T00:00:00Z')), 'string')
})

test('profile avatar paths are optional and limited to same-origin sources', () => {
  const input = {
    fullName: 'Amina Khan',
    employeeNumber: '42',
    avatarUrl: '/avatars/42.png',
  }
  assert.equal(resolveProfile(input, 'ready').avatarUrl, '/avatars/42.png')
  assert.equal(
    resolveProfile({ ...input, avatarUrl: '/api/v1/users/42/avatar?v=2' }, 'ready').avatarUrl,
    '/api/v1/users/42/avatar?v=2',
  )
  assert.equal(
    profileAvatarUrl({ profileImageUrl: '/avatars/42.png' }),
    '/avatars/42.png',
  )
  for (const avatarUrl of [
    'javascript:alert(1)',
    'https://cdn.example.com/avatars/42.png',
    'http://cdn.example.com/avatars/42.png',
    '//cdn.example.com/avatars/42.png',
    'data:image/png;base64,AAAA',
    'C:\\avatars\\42.png',
    '',
    null,
    42,
  ]) {
    assert.equal(profileAvatarUrl({ avatarUrl }), '', String(avatarUrl))
  }
})
