import { calculateRates, priceToWorkSeconds, type SalaryProfile } from '@salary-flow/core'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'

const GITHUB_LATEST_RELEASE = 'https://api.github.com/repos/cshouuu/money-dance/releases/latest'
const RELEASE_ASSET_PREFIX = 'https://github.com/cshouuu/money-dance/releases/download/'

interface GitHubReleaseResponse {
  tag_name?: string
  name?: string | null
  body?: string | null
  html_url?: string
  published_at?: string | null
  assets?: Array<{
    name?: string
    browser_download_url?: string
  }>
}

const profileSchema = z.object({
  salary: z.number().nonnegative(),
  salaryType: z.enum(['monthly','annual','daily','hourly']),
  workStartTime: z.string(), workEndTime: z.string(), breakStartTime: z.string(), breakEndTime: z.string(),
  paidBreak: z.boolean(), monthlyWorkDays: z.number().positive(), workDaysPerWeek: z.number().min(1).max(7), currency: z.string().default('CNY')
})

const app = new Hono().basePath('/api')
app.use('*', cors({ origin: process.env.CORS_ORIGIN || '*', allowMethods: ['GET','POST','OPTIONS'], allowHeaders:['Content-Type'] }))
app.get('/health', c => c.json({ ok: true, service: 'salary-flow-api', version: '0.1.0', now: new Date().toISOString() }))
app.get('/app-release/latest', async c => {
  try {
    const response = await fetch(GITHUB_LATEST_RELEASE, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'money-dance-api',
      },
    })
    if (response.status === 404) return c.json({ ok: true, data: null })
    if (!response.ok) return c.json({ ok: false, error: `GITHUB_RELEASE_FAILED_${response.status}` }, 502)

    const release = await response.json() as GitHubReleaseResponse
    const tag = release.tag_name ?? ''
    const apk = release.assets?.find(asset => {
      const url = asset.browser_download_url ?? ''
      return asset.name?.endsWith('.apk') && url.startsWith(RELEASE_ASSET_PREFIX)
    })

    if (!tag || !apk?.name || !apk.browser_download_url) return c.json({ ok: true, data: null })

    c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600')
    return c.json({
      ok: true,
      data: {
        tag,
        version: tag.trim().replace(/^v/i, '').split('-')[0],
        title: release.name || `Money Dance ${tag}`,
        notes: release.body || '',
        apkName: apk.name,
        apkUrl: apk.browser_download_url,
        htmlUrl: release.html_url || 'https://github.com/cshouuu/money-dance/releases/latest',
        publishedAt: release.published_at || '',
      },
    })
  } catch (error) {
    console.error('app-release/latest failed', error)
    return c.json({ ok: false, error: 'RELEASE_PROXY_UNAVAILABLE' }, 502)
  }
})
app.post('/calculate/rates', async c => {
  try { const body = profileSchema.parse(await c.req.json()) as SalaryProfile; return c.json({ ok:true, data:calculateRates(body) }) }
  catch (error) { return c.json({ ok:false, error:error instanceof Error?error.message:'Invalid request' }, 400) }
})
app.post('/calculate/work-time', async c => {
  try { const body=z.object({price:z.number().nonnegative(), profile:profileSchema}).parse(await c.req.json()); const rates=calculateRates(body.profile as SalaryProfile); return c.json({ok:true,data:{seconds:priceToWorkSeconds(body.price,rates.second),secondRate:rates.second}}) }
  catch(error){return c.json({ok:false,error:error instanceof Error?error.message:'Invalid request'},400)}
})
app.notFound(c=>c.json({ok:false,error:'Not Found'},404))
export default app
