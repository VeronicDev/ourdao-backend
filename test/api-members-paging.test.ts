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

  it('paginates through more than 200 members correctly using cursor', async () => {
    // Seed 250 members with incremental joined_at timestamps
    for (let i = 1; i <= 250; i++) {
      const addr = Keypair.random().publicKey()
      const joinedAt = 1000000 + i
      await query(
        'INSERT INTO members (address, joined_ledger, joined_at, contribution, stake, exited) VALUES ($1, $2, $3, \'0\', \'0\', false)',
        [addr, i, joinedAt]
      )
    }

    // Fetch first page of 100
    const page1Res = await app.inject({ method: 'GET', url: '/api/members?limit=100' })
    expect(page1Res.statusCode).toBe(200)
    const page1 = page1Res.json() as Array<{ address: string; joined_at: string }>
    expect(page1).toHaveLength(100)

    // Most recent should be first
    const lastItem1 = page1[page1.length - 1]
    expect(lastItem1).toBeDefined()

    const cursor = `${lastItem1!.joined_at},${lastItem1!.address}`
    const page2Res = await app.inject({ method: 'GET', url: `/api/members?limit=100&before=${encodeURIComponent(cursor)}` })
    expect(page2Res.statusCode).toBe(200)
    const page2 = page2Res.json() as Array<{ address: string; joined_at: string }>
    expect(page2.length).toBeGreaterThan(0)

    // Ensure no overlap
    const page1Addrs = new Set(page1.map((m) => m.address))
    for (const m of page2) {
      expect(page1Addrs.has(m.address)).toBe(false)
    }
  })
})
