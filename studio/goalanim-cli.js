// Child-process entry for goal recreations: node goalanim-cli.js <job.json>. The parent (server.js) spawns it so
// the frame loop (CPU-bound for many minutes on the 0.1-CPU instance) never blocks the HTTP server's event loop
// (Render restarts an instance whose health check stops answering) and its memory is released on exit.
import fs from 'node:fs'
import { renderGoalRecreation } from './goalanim.js'
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const phase = process.argv[3] || null   // 'frames' then 'finish', run as two processes so the frame loop's memory is gone before ffmpeg assembles
try {
  const r = await renderGoalRecreation({ ...job, phase })
  if (phase === 'frames') { process.exit(0) }
  fs.writeFileSync(job.out + '.json', JSON.stringify(r))
  process.exit(0)
} catch (e) {
  const msg = String((e && e.stack) || e).slice(0, 1500)
  console.error(`[goal-anim] ${phase || 'render'} FAILED:`, msg)   // stderr is inherited: the reason lands in the Render logs
  fs.writeFileSync(job.out + '.json', JSON.stringify({ error: msg, phase }))
  process.exit(1)
}
