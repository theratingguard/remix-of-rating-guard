const { readFileSync } = require("node:fs");
// PM2 requires CommonJS configuration in this ESM repository.
const env = {};
for (const file of [
  "/opt/rating-guard/.env",
  "/opt/rating-guard/.env.production",
  "/etc/ratingguard-worker.env",
]) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
Object.assign(env, {
  NODE_ENV: "production",
  MULTI_WORKER_ENABLED: "true",
  REDIS_URL: "redis://127.0.0.1:6379",
  PUPPETEER_CACHE_DIR: "/opt/ratingguard-chromium",
  HOME: "/opt/ratingguard-chromium-runtime",
  XDG_CONFIG_HOME: "/opt/ratingguard-chromium-runtime/config",
  XDG_CACHE_HOME: "/opt/ratingguard-chromium-runtime/cache",
});
const base = {
  cwd: "/opt/rating-guard",
  interpreter: "node",
  exec_mode: "cluster",
  uid: "ratingguard",
  gid: "ratingguard",
  out_file: "/opt/ratingguard-worker-logs/output.log",
  error_file: "/opt/ratingguard-worker-logs/error.log",
  log_date_format: "YYYY-MM-DDTHH:mm:ss.SSSZ",
  autorestart: true,
  min_uptime: "10s",
  max_restarts: 10,
  exp_backoff_restart_delay: 1000,
  kill_timeout: 300000,
  env,
};
module.exports = {
  apps: [
    {
      ...base,
      name: "ratingguard-api",
      script: ".output/server/index.mjs",
      instances: 1,
      max_memory_restart: "512M",
      kill_timeout: 10000,
    },
    {
      ...base,
      name: "scanner-worker",
      script: ".worker-dist/scanner.worker.js",
      instances: 2,
      max_memory_restart: "384M",
    },
    {
      ...base,
      name: "analyzer-worker",
      script: ".worker-dist/analyzer.worker.js",
      instances: 3,
      max_memory_restart: "256M",
    },
    {
      ...base,
      name: "legal-worker",
      script: ".worker-dist/legal.worker.js",
      instances: 2,
      max_memory_restart: "384M",
    },
    {
      ...base,
      name: "seo-worker",
      script: ".worker-dist/seo.worker.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "256M",
    },
  ],
};
