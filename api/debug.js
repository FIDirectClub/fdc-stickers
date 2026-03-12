// /api/debug.js - Temporary diagnostic endpoint (DELETE AFTER DEBUGGING)
const { neon } = require('@neondatabase/serverless');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  var info = {};

  // Check which env vars exist (names only, not values)
  var dbVars = Object.keys(process.env).filter(function(k) {
    return k.indexOf('POSTGRES') >= 0 || k.indexOf('DATABASE') >= 0 || k.indexOf('NEON') >= 0 || k.indexOf('DB') >= 0;
  });
  info.envVarNames = dbVars;

  var url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.NEON_DATABASE_URL;
  info.hasUrl = !!url;
  if (url) {
    info.urlPrefix = url.substring(0, 20) + '...';
    info.urlLength = url.length;
  }

  // Try to connect
  try {
    var sql = neon(url, { fullResults: true });
    info.neonCreated = true;
    var result = await sql`SELECT 1 as test`;
    info.queryOk = true;
    info.rows = result.rows;
  } catch (err) {
    info.error = err.message;
    info.errorName = err.name;
    info.errorStack = (err.stack || '').substring(0, 500);
  }

  info.nodeVersion = process.version;
  return res.status(200).json(info);
};