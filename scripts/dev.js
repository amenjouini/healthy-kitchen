/** Runs the API server and the Vite dev server together (npm run dev:all). */
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'server'], { stdio: 'inherit', shell: true }),
  spawn('npm', ['run', 'dev'], { stdio: 'inherit', shell: true }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) stop(); });
