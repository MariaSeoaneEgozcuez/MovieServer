import { getDB } from '../db/connection.js';

/**
 * Revocar un token
 */
export async function revokeToken(token, expiresAt = null) {
  try {
    const db = getDB();

    const result = await db.run(
      'INSERT INTO RevokedTokens (token, expires_at) VALUES (?, ?)',
      [token, expiresAt || null]
    );

    return {
      id: result.lastID,
      token,
      revoked_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error revoking token:', error.message);
    throw {
      status: 500,
      message: 'Error revoking token',
      error: error.message
    };
  }
}

/**
 * Verificar si un token está revocado
 */
export async function isTokenRevoked(token) {
  try {
    const db = getDB();

    const revoked = await db.get(
      'SELECT id FROM RevokedTokens WHERE token = ?',
      [token]
    );

    return !!revoked;
  } catch (error) {
    console.error('Error checking token revocation:', error.message);
    throw {
      status: 500,
      message: 'Error checking token',
      error: error.message
    };
  }
}

/**
 * Limpiar tokens expirados
 */
export async function cleanExpiredTokens() {
  try {
    const db = getDB();

    const result = await db.run(
      'DELETE FROM RevokedTokens WHERE expires_at IS NOT NULL AND expires_at < datetime("now")'
    );

    console.log(`Cleaned ${result.changes} expired tokens`);
    return { cleaned: result.changes };
  } catch (error) {
    console.error('Error cleaning expired tokens:', error.message);
    throw {
      status: 500,
      message: 'Error cleaning tokens',
      error: error.message
    };
  }
}

/**
 * Obtener información de tokens revocados
 */
export async function getRevokedTokensStats() {
  try {
    const db = getDB();

    const totalRevoked = await db.get('SELECT COUNT(*) AS count FROM RevokedTokens');
    const activeRevoked = await db.get(
      'SELECT COUNT(*) AS count FROM RevokedTokens WHERE expires_at IS NULL OR expires_at > datetime("now")'
    );

    return {
      total_revoked: totalRevoked?.count || 0,
      active_revoked: activeRevoked?.count || 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting token stats:', error.message);
    return {
      total_revoked: 0,
      active_revoked: 0,
      timestamp: new Date().toISOString()
    };
  }
}
