// Reward Nomination service over /api/v1/hr/employee-of-the-month (the shared
// apiClient, or the in-memory demo adapter when VITE_HR_REWARD_NOMINATION_DEMO
// is 'true' in a development build).
import { apiClient } from '../../../services/api/apiClient.js'
import { employeeServicesFormsConfig } from '../employeeServicesFormsConfig.js'
import { createRewardDemoClient } from '../demo/rewardDemoClient.js'
import { invalidResponse, params, segment } from '../shared/formRecords.js'
import {
  readRewardCriteria, readRewardEmployee, readRewardListItem, readRewardRecord, readRewardRequestor, rewardBody,
} from './rewardContract.js'
import { monthRange } from './rewardModel.js'

export const REWARD_BASE = '/hr/employee-of-the-month'
const LIST_SORT = Object.freeze(['headerId', 'requestNo', 'employeeName', 'activityDate', 'status', 'createdAt'])

export function createRewardService({ client }) {
  const getById = async (id, { signal } = {}) => readRewardRecord((await client.get(`${REWARD_BASE}/${segment(id)}`, { signal })).data)
  const list = async ({ page = 1, pageSize = 25, search, status, department, date_from, date_to, employeeNumber, sort, order } = {}, { signal } = {}) => {
    const result = await client.get(REWARD_BASE, {
      params: params({
        page, pageSize, search, status, department, date_from, date_to, employeeNumber,
        ...(LIST_SORT.includes(sort) ? { sort, order: order === 'asc' ? 'asc' : 'desc' } : {}),
      }),
      signal,
    })
    if (!Array.isArray(result.data) || !result.pagination) throw invalidResponse('nomination list')
    return Object.freeze({ items: Object.freeze(result.data.map(readRewardListItem)), pagination: result.pagination })
  }
  return Object.freeze({
    async criteria(department, { signal } = {}) {
      return readRewardCriteria((await client.get(`${REWARD_BASE}/lookups/criteria`, { params: { department }, signal })).data)
    },
    async requestor({ signal } = {}) {
      return readRewardRequestor((await client.get(`${REWARD_BASE}/lookups/requestor`, { signal })).data)
    },
    // Search by number, name or email (the picker sends one term to all three when it is not a number).
    async searchEmployees(search = '', { signal } = {}) {
      const term = String(search).trim()
      const query = /^\d+$/.test(term) ? { empNo: term } : term.includes('@') ? { email: term } : { name: term }
      const { data } = await client.get(`${REWARD_BASE}/lookups/employees`, { params: params({ ...query, limit: 25 }), signal })
      if (!Array.isArray(data)) throw invalidResponse('employee list')
      const items = Object.freeze(data.map(readRewardEmployee))
      return Object.freeze({
        items,
        pagination: Object.freeze({ page: 1, limit: items.length, total: items.length, totalPages: items.length ? 1 : 0, hasNextPage: false, hasPreviousPage: false }),
      })
    },
    list,
    // Nominations of one employee in the month of `activityDate` that the user can see.
    async sameMonth(employeeNumber, activityDate, { signal } = {}) {
      const range = monthRange(activityDate)
      if (!range || !employeeNumber) return Object.freeze([])
      return (await list({ employeeNumber, date_from: range.from, date_to: range.to, pageSize: 100 }, { signal })).items
    },
    getById,
    async save(id, form, employee) {
      const body = rewardBody(form, employee)
      const { data } = id ? await client.put(`${REWARD_BASE}/${segment(id)}`, body) : await client.post(REWARD_BASE, body)
      return readRewardRecord(data)
    },
  })
}

export const rewardDemo = employeeServicesFormsConfig.demo.reward
export const rewardService = createRewardService({ client: rewardDemo ? createRewardDemoClient() : apiClient })
