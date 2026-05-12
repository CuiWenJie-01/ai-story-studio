const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let db = null;
let SQL = null;
let dbFilePath = null;

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

function saveDb() {
  if (!db || !dbFilePath) return;
  try {
    const raw = db.db.export();
    fs.writeFileSync(dbFilePath, Buffer.from(raw));
  } catch (err) {
    console.error('Failed to persist SQLite database:', err);
  }
}

class DatabaseWrapper {
  constructor(sqlDb) {
    this.db = sqlDb;
  }

  exec(sql) {
    const result = this.db.exec(sql);
    saveDb();
    return result;
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  run(sql, ...params) {
    if (params && params.length > 0) {
      return this.runWithParams(sql, params);
    }
    const result = this.db.run(sql);
    saveDb();
    return {
      changes: this.db.getRowsModified ? this.db.getRowsModified() : 0,
      lastInsertRowid: 0
    };
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
        const result = this.db.exec(processedSql);
        saveDb();
        return result;
      }
      const result = this.db.exec(sql);
      saveDb();
      return result;
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
      const rowsAffected = this.db.getRowsModified();
      const lastInsertResult = this.db.exec('SELECT last_insert_rowid() AS id');
      const lastInsertRowid = lastInsertResult && lastInsertResult.length > 0 && lastInsertResult[0].values && lastInsertResult[0].values.length > 0
        ? lastInsertResult[0].values[0][0]
        : 0;
      saveDb();
      return {
        rowsAffected,
        lastInsertRowid
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
    saveDb();
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
  
  const dbPath = path.isAbsolute(config.path) ? config.path : path.join(process.cwd(), config.path);
  dbFilePath = dbPath;
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