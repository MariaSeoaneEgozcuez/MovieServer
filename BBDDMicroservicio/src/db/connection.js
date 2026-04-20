import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import config from 'config';

let dbInstance = null;

/**
 * Conectar a la base de datos SQLite
 * Crea las tablas si no existen
 */
export async function connectDB() {
  try {
    const dbPath = config.get('db.filename');

    dbInstance = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    console.log(`✓ Connected to SQLite: ${dbPath}`);

    // Crear tabla de usuarios
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS Usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de tokens revocados
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS RevokedTokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
      )
    `);

    // Crear tabla de logs de operaciones (para auditoría)
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS OperationLogs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        status TEXT,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✓ Tables verified/created');
  } catch (error) {
    console.error('✗ Error connecting to SQLite:', error.message);
    throw error;
  }
}

/**
 * Obtener instancia de la BD
 */
export function getDB() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return dbInstance;
}

/**
 * Cerrar conexión a la BD
 */
export async function closeDB() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    console.log('✓ Database connection closed');
  }
}

/**
 * Health check de BD
 */
export async function checkDBHealth() {
  try {
    const db = getDB();
    await db.get('SELECT 1');
    return { status: 'up', database: config.get('db.filename') };
  } catch (error) {
    return {
      status: 'down',
      error: error.message
    };
  }
}
