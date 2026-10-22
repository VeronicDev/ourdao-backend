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

  it('paginates through member lists larger than limit with cursor and headers', async () => {
    const addrs = Array.from({ length: 5 }, () => Keypair.random().publicKey())
    for (let i = 0; i < addrs.length; i++) {
      await query(
        `INSERT INTO members (address, name, joined_ledger, contribution, stake, exited, voting_power)
         VALUES ($1, $2, $3, '1000', '1000', false, '1')`,
        [addrs[i], `Member ${i}`, 100 + i]
      )
    }

    const res1 = await app.inject({ method: 'GET', url: '/api/members?limit=2' })
    expect(res1.statusCode).toBe(200)
    expect(res1.headers['x-has-more']).toBe('true')
    const nextCursor = res1.headers['x-next-cursor'] as string
    expect(nextCursor).toBeDefined()

    const body1 = res1.json()
    expect(body1).toHaveLength(2)

    const res2 = await app.inject({ method: 'GET', url: `/api/members?limit=2&before=${encodeURIComponent(nextCursor)}` })
    expect(res2.statusCode).toBe(200)
    const body2 = res2.json()
    expect(body2.length).toBeGreaterThan(0)
  })

  it('rejects invalid limit or cursor with 400', async () => {
    const resLimit = await app.inject({ method: 'GET', url: '/api/members?limit=abc' })
    expect(resLimit.statusCode).toBe(400)

    const resCursor = await app.inject({ method: 'GET', url: '/api/members?before=invalid-cursor-format!!' })
    expect(resCursor.statusCode).toBe(400)
  })
})
