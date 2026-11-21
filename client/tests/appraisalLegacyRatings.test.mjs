// Old appraisal records keep Oracle-generated RATING_IDs on their 20 rating
// rows. The legacy edit form (prfedit.php) pairs those rows with the criteria
// by position, so opening an old record must still show every rating.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createEmployeeServices } from '../src/features/hr-employee-services/hrEmployeeServicesService.js'

const oldRecord = () => ({
  headerId: 7,
  status: 'Approved',
  period: { year: 2026 },
  employee: { personId: '3204', number: '204', name: 'Eligible Employee' },
  appraiser: { evaluatedBy: 'Current Appraiser' },
  result: { rating: 3, grade: 'C' },
  // Legacy ids are large Oracle numbers, NOT 1..20. Ratings are in criteria order.
  criteria: Array.from({ length: 20 }, (_, index) => ({
    id: String(300000004800400 + index),
    name: `Competency ${index + 1}`,
    rating: index + 1 > 5 ? 5 : index + 1,
    justification: index === 0 ? 'Led the audit' : '',
  })),
  development: [],
  training: [],
  remarks: { employee: '-', appraiser: '-' },
  creationDate: '2020-10-29',
})

test('an old appraisal record shows its ratings by position, not by RATING_ID', async () => {
  const client = {
    get: async (path) => {
      if (path.endsWith('/hr/performance-appraisals/7')) return { data: oldRecord() }
      throw new Error(`Unexpected GET ${path}`)
    },
  }
  const services = createEmployeeServices({ client, appraisalClient: client })
  const record = await services.appraisals.getById('7')

  assert.equal(record.ratings.C01.rating, 1)
  assert.equal(record.ratings.C01.explanation, 'Led the audit')
  assert.equal(record.ratings.C02.rating, 2)
  assert.equal(record.ratings.C03.rating, 3)
  assert.equal(record.ratings.C04.rating, 4)
  assert.equal(record.ratings.C05.rating, 5)
  assert.equal(record.ratings.C20.rating, 5)
})

test('a new appraisal record still matches ratings by their 1..20 ids', async () => {
  const client = {
    get: async (path) => {
      if (path.endsWith('/hr/performance-appraisals/8')) {
        const data = oldRecord()
        return {
          data: {
            ...data,
            headerId: 8,
            criteria: data.criteria.map((line, index) => ({ ...line, id: index + 1, rating: 4 })),
          },
        }
      }
      throw new Error(`Unexpected GET ${path}`)
    },
  }
  const services = createEmployeeServices({ client, appraisalClient: client })
  const record = await services.appraisals.getById('8')

  for (const code of ['C01', 'C05', 'C20']) assert.equal(record.ratings[code].rating, 4)
})
