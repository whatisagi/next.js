/* eslint-env jest */

import {
  assertHasRedbox,
  assertNoRedbox,
  fetchViaHTTP,
  findPort,
  getRedboxHeader,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')

let appPort: number
let app: Awaited<ReturnType<typeof launchApp>>

async function getSrc(
  browser: Awaited<ReturnType<typeof webdriver>>,
  id: string
) {
  const src = await browser.elementById(id).getAttribute('src')
  if (src) {
    const url = new URL(src, `http://localhost:${appPort}`)
    return url.href.slice(url.origin.length)
  }
}

function runTests(mode: 'dev' | 'server') {
  it('should load matching images', async () => {
    const browser = await webdriver(appPort, '/')
    if (mode === 'dev') {
      await assertNoRedbox(browser)
    }
    const ids = ['nested-assets', 'static-img']
    const urls = await Promise.all(ids.map((id) => getSrc(browser, id)))
    const responses = await Promise.all(
      urls.map((url) => fetchViaHTTP(appPort, url))
    )
    const statuses = responses.map((res) => res.status)
    expect(statuses).toStrictEqual([200, 200])
  })

  it.each([
    'does-not-exist',
    'nested-assets-query',
    'nested-blocked',
    'top-level',
  ])('should block unmatched image %s', async (id: string) => {
    const page = '/' + id
    const browser = await webdriver(appPort, page)
    if (mode === 'dev') {
      await assertHasRedbox(browser)
      expect(await getRedboxHeader(browser)).toMatch(
        /Invalid src prop (.+) on `next\/image` does not match `images.localPatterns` configured/g
      )
    } else {
      const url = await getSrc(browser, id)
      const res = await fetchViaHTTP(appPort, url)
      expect(res.status).toBe(400)
    }
  })
}

describe('Image localPatterns config', () => {
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('dev')
    }
  )
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests('server')
    }
  )
})
