delete process.env.ELECTRON_RUN_AS_NODE
const { spawn } = require('child_process')
const path = require('path')

const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  env: { ...process.env },
  cwd: path.resolve(__dirname, '..'),
  shell: true
})
child.on('close', code => process.exit(code))
