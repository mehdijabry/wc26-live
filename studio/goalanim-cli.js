// Child-process entry for goal recreations: node goalanim-cli.js <job.json>. The parent (server.js) spawns it so
// the frame loop (CPU-bound for many minutes on the 0.1-CPU instance) never blocks the HTTP server's event loop
// (Render restarts an instance whose health check stops answering) and its memory is released on exit.
import fs from 'node:fs'
import { renderGoalRecreation } from './goalanim.js'
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
try {
  const r = await renderGoalRecreation(job)
  fs.writeFileSync(job.out + '.json', JSON.stringify(r))
  process.exit(0)
} catch (e) {
  fs.writeFileSync(job.out + '.json', JSON.stringify({ error: String(e && e.stack || e).slice(0, 1500) }))
  process.exit(1)
}
