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

  it('paginates through member lists larger than limit using before cursor', async () => {
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
    const page1 = res1.json() as Array<{ address: string; joined_at: string }>
    expect(page1).toHaveLength(2)

    const last = page1[1]
    expect(last).toBeDefined()
    const cursorStr = `${last!.joined_at},${last!.address}`

    const res2 = await app.inject({ method: 'GET', url: `/api/members?limit=2&before=${encodeURIComponent(cursorStr)}` })
    expect(res2.statusCode).toBe(200)
    const page2 = res2.json() as Array<{ address: string; joined_at: string }>
    expect(page2.length).toBeGreaterThan(0)

    for (const m of page2) {
      expect(page1.some((p) => p.address === m.address)).toBe(false)
    }
  })

  it('rejects invalid before cursor with 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/members?before=invalid-cursor-format' })
    expect(res.statusCode).toBe(400)
  })
})
