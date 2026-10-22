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

  it('paginates through member lists larger than limit using before cursor and metadata/headers', async () => {
    const addrs = []
    for (let i = 0; i < 5; i++) {
      const kp = Keypair.random()
      addrs.push(kp.publicKey())
      await query(
        `INSERT INTO members (address, joined_ledger, contribution, stake, exited, joined_at)
         VALUES ($1, $2, '1000', '100', false, to_timestamp(1700000000 + $2))`,
        [kp.publicKey(), 100 + i]
      )
    }

    const res1 = await app.inject({ method: 'GET', url: '/api/members?limit=2' })
    expect(res1.statusCode).toBe(200)
    const body1 = res1.json() as { members: Array<{ address: string; joined_at: string }>; nextCursor?: string }
    expect(body1.members).toHaveLength(2)
    expect(body1.nextCursor).toBeDefined()
    expect(res1.headers['x-next-cursor']).toBe(body1.nextCursor)

    const last = body1.members[1]
    expect(last).toBeDefined()
    const cursorVal = body1.nextCursor!

    const res2 = await app.inject({ method: 'GET', url: `/api/members?limit=2&before=${encodeURIComponent(cursorVal)}` })
    expect(res2.statusCode).toBe(200)
    const body2 = res2.json() as { members: Array<{ address: string; joined_at: string }>; nextCursor?: string }
    expect(body2.members.length).toBeGreaterThan(0)

    for (const m of body2.members) {
      expect(body1.members.some((p) => p.address === m.address)).toBe(false)
    }
  })

  it('rejects invalid before cursor with 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/members?before=invalid-cursor-format' })
    expect(res.statusCode).toBe(400)
  })
})
