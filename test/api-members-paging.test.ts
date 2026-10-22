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
    expect(page1Res.headers['x-total-count']).toBe('250')
    const body1 = page1Res.json() as { members: Array<{ address: string; joined_at: string }>; nextCursor?: string }
    expect(body1.members).toHaveLength(100)
    expect(body1.nextCursor).toBeDefined()

    const page2Res = await app.inject({ method: 'GET', url: `/api/members?limit=100&before=${encodeURIComponent(body1.nextCursor!)}` })
    expect(page2Res.statusCode).toBe(200)
    const body2 = page2Res.json() as { members: Array<{ address: string; joined_at: string }>; nextCursor?: string }
    expect(body2.members.length).toBeGreaterThan(0)

    // Ensure no overlap
    const page1Addrs = new Set(body1.members.map((m) => m.address))
    for (const m of body2.members) {
      expect(page1Addrs.has(m.address)).toBe(false)
    }
  })
})
