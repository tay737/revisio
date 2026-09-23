const { Pool } = require('pg');
const url = new URL(process.env.DATABASE_URL);
const pool = new Pool({
  host: url.hostname,
  port: Number(url.port || 5432),
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.replace(/^\//, '') || 'postgres',
  ssl: { rejectUnauthorized: false, servername: url.hostname },
  max: 2,
});
pool.query('SELECT current_user, count(*) AS users FROM users')
  .then(r => { console.log('PG OK', JSON.stringify(r.rows[0])); return pool.end(); })
  .catch(e => { console.error('PG FAIL', e.message); process.exit(1); });
