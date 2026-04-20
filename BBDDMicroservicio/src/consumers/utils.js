import { getDB } from '../db/connection.js';

/**
 * Log de operaciones en la BD
 */
export async function logOperation(operation, entityType, entityId, status, message = null) {
  try {
    const db = getDB();
    await db.run(
      'INSERT INTO OperationLogs (operation, entity_type, entity_id, status, message) VALUES (?, ?, ?, ?, ?)',
      [operation, entityType, entityId, status, message]
    );
  } catch (error) {
    console.warn('Failed to log operation:', error.message);
    // No fallar si el log no funciona
  }
}
