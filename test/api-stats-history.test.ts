import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../src/api/server.js'
import { query } from '../src/db/index.js'
import { closeDb, resetDb } from './db.js'

describe('API: historical loan stats', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    await resetDb()
    app = await buildServer()
    await app.ready()
  })
  afterAll(closeDb)

  it('returns daily aggregates and cumulative default rates for charting', async () => {
    await query(
      `INSERT INTO daily_loan_stats
         (day, loans_originated, principal_lent, principal_repaid, defaults_count, value_defaulted)
       VALUES
         ('2026-01-01', 2, 1500, 0, 0, 0),
         ('2026-01-03', 1, 500, 250, 1, 300)`
    )

    const response = await app.inject({ method: 'GET', url: '/api/stats/history' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toMatch(/max-age=/)
    expect(response.json().data).toEqual(expect.arrayContaining([
      {
        date: '2026-01-01',
        principalLent: '1500',
        principalRepaid: '0',
        defaults: 0,
        valueDefaulted: '0',
        cumulativeDefaultRatePercent: 0,
      },
      {
        date: '2026-01-02',
        principalLent: '0',
        principalRepaid: '0',
        defaults: 0,
        valueDefaulted: '0',
        cumulativeDefaultRatePercent: 0,
      },
      {
        date: '2026-01-03',
        principalLent: '500',
        principalRepaid: '250',
        defaults: 1,
        valueDefaulted: '300',
        cumulativeDefaultRatePercent: 33.3333,
      },
    ]))
  })

  it('does not cache empty stats array for 1 hour on cold start and invalidates on cache/reindex', async () => {
    // Cold start with no stats
    const res1 = await app.inject({ method: 'GET', url: '/api/stats/history' })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().data).toEqual([])

    // Now insert stats (simulating loan origination / reindex)
    await query(
      `INSERT INTO daily_loan_stats
         (day, loans_originated, principal_lent, principal_repaid, defaults_count, value_defaulted)
       VALUES
         ('2026-02-01', 1, 1000, 0, 0, 0)`
    )

    // Invalidate history cache as handlers/reindex do
    const { createHistoryCache } = await import('../src/api/history-cache.js')
    const hc = createHistoryCache()
    await hc.invalidate()
    await hc.close()

    // Subsequent call should immediately reflect the new stats without waiting for 1 hour
    const res2 = await app.inject({ method: 'GET', url: '/api/stats/history' })
    expect(res2.statusCode).toBe(200)
    expect(res2.json().data).toHaveLength(1)
    expect(res2.json().data[0].date).toBe('2026-02-01')
    expect(res2.json().data[0].principalLent).toBe('1000')
  })
})
