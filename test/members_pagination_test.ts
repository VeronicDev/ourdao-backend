import test from 'node:test'
import assert from 'node:assert'
import { buildServer } from '../src/api/server.js'
import { query } from '../src/db/index.js'

test('GET /api/members cursor pagination with large member list', async () => {
  const app = await buildServer()
  await app.ready()

  try {
    await query('DELETE FROM members')

    const totalMembers = 5
    for (let i = 1; i <= totalMembers; i++) {
      const addr = 'G' + i.toString().padStart(55, 'A')
      const ledger = 1000 + i
      await query(
        `INSERT INTO members (address, name, joined_ledger, stake, contribution, exited)
         VALUES ($1, $2, $3, '100', '100', false)`,
        [addr, `Member ${i}`, ledger]
      )
    }

    const limitVal = 2
    let allRows: any[] = []
    let cursorVal: string | null = null
    let hasMore = true
    let safety = 0

    while (hasMore && safety < 10) {
      safety++
      const url: string = `/api/members?limit=${limitVal}${cursorVal ? `&before=${cursorVal}` : ''}`
      const res: import('light-my-request').Response = await app.inject({
        method: 'GET',
        url,
      })

      assert.strictEqual(res.statusCode, 200)
      const body = JSON.parse(res.payload)
      assert.ok(Array.isArray(body.rows))
      assert.ok(body.pagination)

      allRows = allRows.concat(body.rows)
      hasMore = body.pagination.has_more
      cursorVal = body.pagination.next_cursor
    }

    assert.strictEqual(allRows.length, totalMembers)
  } finally {
    await app.close()
  }
})
