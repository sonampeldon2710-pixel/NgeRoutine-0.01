// const mysql = require('mysql2/promise');
// require('dotenv').config();

// const pool = mysql.createPool({
//   host:     process.env.DB_HOST,
//   port:     parseInt(process.env.DB_PORT),
//   user:     process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME,
//   waitForConnections: true,
//   connectionLimit: 10,
//   ssl: { rejectUnauthorized: false }
// });

// pool.getConnection()
//   .then(conn => { console.log('DB connected'); conn.release(); })
//   .catch(err => { console.error('DB connection failed:', err); process.exit(1); });

// module.exports = pool;

const pool = mysql.createPool({
  host:     process.env.MYSQLHOST,
  port:     parseInt(process.env.MYSQLPORT),
  user:     process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: { rejectUnauthorized: false }
});