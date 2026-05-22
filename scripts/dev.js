delete process.env.ELECTRON_RUN_AS_NODE
const { execSync } = require('child_process')
execSync('electron-vite dev', { stdio: 'inherit', env: process.env })
