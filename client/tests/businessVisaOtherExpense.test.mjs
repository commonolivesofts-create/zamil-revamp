import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  REQUIRED,
  blankRequest,
  requestBody,
  validateRequest,
} from '../src/features/hr-employee-services/businessVisa/businessVisaService.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

const validRequest = () => {
  const form = { ...blankRequest('2026-11-21'), visaSingle: true }
  for (const key of REQUIRED) {
    form[key] = ['requestDate', 'issueDate', 'expiryDate', 'arrivalDate'].includes(key)
      ? '2026-11-21'
      : 'valid'
  }
  return form
}

test('business visa requires, saves and returns the other expense details', () => {
  const form = validRequest()
  assert.deepEqual(validateRequest(form), {})

  const otherExpense = { ...form, travelOther: true }
  assert.equal(validateRequest(otherExpense).otherDetails, 'Specify the other expenses.')

  otherExpense.otherDetails = 'Airport transfer'
  assert.deepEqual(validateRequest(otherExpense), {})
  assert.equal(requestBody(otherExpense).otherDetails, 'Airport transfer')
})

test('business visa only renders the specification field for an Other expense', async () => {
  const page = await read('../src/features/hr-employee-services/businessVisa/BusinessVisaPage.jsx')
  assert.match(page, /const hasOtherExpense = Boolean\(form\.travelOther \|\| form\.hotelOther\)/)
  assert.match(
    page,
    /\{hasOtherExpense && \([\s\S]*?field\('otherDetails', 'If Other, Please Specify'/,
  )
  assert.match(page, /required: hasOtherExpense/)
  assert.match(
    page,
    /if \(\s*\(key === 'travelOther' && !checked && !form\.hotelOther\) \|\|\s*\(key === 'hotelOther' && !checked && !form\.travelOther\)\s*\)\s*\{\s*changes\.otherDetails = ''/,
  )
})
