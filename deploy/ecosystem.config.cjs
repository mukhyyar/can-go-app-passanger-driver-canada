/** PM2 process file — run from /opt/cango */
module.exports = {
  apps: [
    {
      name: 'cango-api',
      cwd: '/opt/cango/backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      time: true,
    },
    {
      name: 'cango-admin',
      cwd: '/opt/cango/apps/admin',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001 -H 127.0.0.1',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      time: true,
    },
    {
      name: 'cango-web',
      cwd: '/opt/cango/apps/web-passenger',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3002 -H 127.0.0.1',
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
