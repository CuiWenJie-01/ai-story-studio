const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let db = null;
let SQL = null;

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  all(...params) {
    const result = this.db.execWithParams(this.sql, params);
    if (result && result.length > 0 && result[0].values) {
      const columns = result[0].columns || [];
      return result[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });
    }
    return [];
  }

  get(...params) {
    const result = this.all(...params);
    return result.length > 0 ? result[0] : undefined;
  }

  run(...params) {
    const result = this.db.runWithParams(this.sql, params);
    return {
      changes: result.rowsAffected,
      lastInsertRowid: result.lastInsertRowid
    };
  }

  pluck() {
    return {
      all: (...params) => {
        const result = this.all(...params);
        return result.map(row => Object.values(row)[0]);
      }
    };
  }
}

class DatabaseWrapper {
  constructor(sqlDb) {
    this.db = sqlDb;
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  run(sql, ...params) {
    return this.db.run(sql, params);
  }

  execWithParams(sql, params) {
    try {
      if (params && params.length > 0) {
        const placeholders = sql.match(/\?/g) || [];
        if (placeholders.length !== params.length) {
          console.warn('Parameter count mismatch');
        }
        
        let processedSql = sql;
        params.forEach((param, i) => {
          if (typeof param === 'string') {
            processedSql = processedSql.replace(/\?/, `'${param.replace(/'/g, "''")}'`);
          } else if (param === null || param === undefined) {
            processedSql = processedSql.replace(/\?/, 'NULL');
          } else {
            processedSql = processedSql.replace(/\?/, param.toString());
          }
        });
        return this.db.exec(processedSql);
      }
      return this.db.exec(sql);
    } catch (err) {
      console.error('SQL error:', err.message, 'SQL:', sql);
      throw err;
    }
  }

  runWithParams(sql, params) {
    try {
      if (params && params.length > 0) {
        let processedSql = sql;
        params.forEach((param, i) => {
          if (typeof param === 'string') {
            processedSql = processedSql.replace(/\?/, `'${param.replace(/'/g, "''")}'`);
          } else if (param === null || param === undefined) {
            processedSql = processedSql.replace(/\?/, 'NULL');
          } else {
            processedSql = processedSql.replace(/\?/, param.toString());
          }
        });
        this.db.run(processedSql);
      } else {
        this.db.run(sql);
      }
      return {
        rowsAffected: this.db.getRowsModified(),
        lastInsertRowid: this.db.getLastInsertRowid()
      };
    } catch (err) {
      console.error('SQL error:', err.message, 'SQL:', sql);
      throw err;
    }
  }

  pragma(sql) {
    this.db.exec(`PRAGMA ${sql}`);
  }

  close() {
    this.db.close();
  }
}

async function initDb(config) {
  if (db) return db;
  
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: file => {
        const paths = [
          path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
          path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
          path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file)
        ];
        for (const p of paths) {
          if (fs.existsSync(p)) {
            return p;
          }
        }
        return `./node_modules/sql.js/dist/${file}`;
      }
    });
  }
  
  const dbPath = config.path;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  let dbBuffer;
  if (fs.existsSync(dbPath)) {
    dbBuffer = fs.readFileSync(dbPath);
  } else {
    dbBuffer = null;
  }
  
  const sqlDb = new SQL.Database(dbBuffer);
  db = new DatabaseWrapper(sqlDb);
  
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  
  return db;
}

function getDb(config) {
  return initDb(config);
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, closeDb };