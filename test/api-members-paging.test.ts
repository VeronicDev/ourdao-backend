import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Keypair } from '@stellar/stellar-sdk'
import { buildServer } from '../src/api/server.js'
import { query } from '../src/db/index.js'
import { closeDb, resetDb } from './db.js'

describe('API: GET /api/members pagination', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    await resetDb()
    app = await buildServer()
    await app.ready()
  })
  afterAll(closeDb)

  it('paginates through member lists larger than limit correctly using before cursor', async () => {
    for (let i = 1; i <= 5; i++) {
      const kp = Keypair.random()
      await query(
        `INSERT INTO members (address, joined_ledger, contribution, stake, exited, voting_power)
         VALUES ($1, $2, '1000', '100', false, '1')`,
        [kp.publicKey(), 100 + i]
      )
    }

    const res1 = await app.inject({ method: 'GET', url: '/api/members?limit=2' })
    expect(res1.statusCode).toBe(200)
    const body1 = res1.json()
    expect(body1.items).toHaveLength(2)
    expect(body1.pagination.has_more).toBe(true)
    expect(body1.pagination.next_cursor).not.toBeNull()
    expect(res1.headers['x-pagination-limit']).toBe('2')
    expect(res1.headers['x-pagination-next']).toBe(body1.pagination.next_cursor)

    const nextCursor = body1.pagination.next_cursor
    const res2 = await app.inject({ method: 'GET', url: `/api/members?limit=2&before=${nextCursor}` })
    expect(res2.statusCode).toBe(200)
    const body2 = res2.json()
    expect(body2.items).toHaveLength(2)
    expect(body2.pagination.has_more).toBe(true)

    const nextCursor2 = body2.pagination.next_cursor
    const res3 = await app.inject({ method: 'GET', url: `/api/members?limit=2&before=${nextCursor2}` })
    expect(res3.statusCode).toBe(200)
    const body3 = res3.json()
    expect(body3.items).toHaveLength(1)
    expect(body3.pagination.has_more).toBe(false)
    expect(body3.pagination.next_cursor).toBeNull()
  })
})
