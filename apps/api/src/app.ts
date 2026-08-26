import { calculateRates, priceToWorkSeconds, type SalaryProfile } from '@salary-flow/core'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { z } from 'zod'

const profileSchema = z.object({
  salary: z.number().nonnegative(),
  salaryType: z.enum(['monthly','annual','daily','hourly']),
  workStartTime: z.string(), workEndTime: z.string(), breakStartTime: z.string(), breakEndTime: z.string(),
  paidBreak: z.boolean(), monthlyWorkDays: z.number().positive(), workDaysPerWeek: z.number().min(1).max(7), currency: z.string().default('CNY')
})

const app = new Hono().basePath('/api')
app.use('*', cors({ origin: process.env.CORS_ORIGIN || '*', allowMethods: ['GET','POST','OPTIONS'], allowHeaders:['Content-Type'] }))
app.get('/health', c => c.json({ ok: true, service: 'salary-flow-api', version: '0.1.0', now: new Date().toISOString() }))
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
