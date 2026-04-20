import { getDB } from '../db/connection.js';
import bcrypt from 'bcrypt';

/**
 * Obtener usuario por username
 */
export async function getUserbyUsername(username) {
  try {
    const db = getDB();
    const user = await db.get(
      'SELECT id, username, email, password FROM Usuarios WHERE username = ?',
      [username]
    );
    
    return user || null;
  } catch (error) {
    console.error('Error getting user by username:', error.message);
    throw {
      status: 500,
      message: 'Error getting user',
      error: error.message
    };
  }
}

/**
 * Obtener usuario por email
 */
export async function getUserbyEmail(email) {
  try {
    const db = getDB();
    const user = await db.get(
      'SELECT id, username, email, password FROM Usuarios WHERE email = ?',
      [email]
    );
    
    return user || null;
  } catch (error) {
    console.error('Error getting user by email:', error.message);
    throw {
      status: 500,
      message: 'Error getting user',
      error: error.message
    };
  }
}

/**
 * Obtener usuario por ID
 */
export async function getUserById(userId) {
  try {
    const db = getDB();
    const user = await db.get(
      'SELECT id, username, email FROM Usuarios WHERE id = ?',
      [userId]
    );
    
    return user || null;
  } catch (error) {
    console.error('Error getting user by ID:', error.message);
    throw {
      status: 500,
      message: 'Error getting user',
      error: error.message
    };
  }
}

/**
 * Crear nuevo usuario
 */
export async function createUser(username, email, password) {
  try {
    const db = getDB();

    // Verificar que no existe
    const existing = await db.get(
      'SELECT id FROM Usuarios WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existing) {
      throw {
        status: 400,
        message: 'El nombre de usuario o email ya está en uso'
      };
    }

    // Hash de contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar
    const result = await db.run(
      'INSERT INTO Usuarios (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    // Log
    await db.run(
      'INSERT INTO OperationLogs (operation, entity_type, entity_id, status) VALUES (?, ?, ?, ?)',
      ['CREATE', 'USER', result.lastID, 'SUCCESS']
    );

    return {
      id: result.lastID,
      username,
      email,
      created_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error creating user:', error.message);
    if (error.status) throw error;
    throw {
      status: 500,
      message: 'Error creating user',
      error: error.message
    };
  }
}

/**
 * Actualizar usuario
 */
export async function updateUser(userId, updates) {
  try {
    const db = getDB();

    const { username, email, password } = updates;

    // Construir query dinámicamente
    const fields = [];
    const values = [];

    if (username) {
      fields.push('username = ?');
      values.push(username);
    }
    if (email) {
      fields.push('email = ?');
      values.push(email);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push('password = ?');
      values.push(hashedPassword);
    }

    if (fields.length === 0) {
      throw { status: 400, message: 'No fields to update' };
    }

    values.push(userId);

    const result = await db.run(
      `UPDATE Usuarios SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    if (result.changes === 0) {
      throw { status: 404, message: 'User not found' };
    }

    // Log
    await db.run(
      'INSERT INTO OperationLogs (operation, entity_type, entity_id, status) VALUES (?, ?, ?, ?)',
      ['UPDATE', 'USER', userId, 'SUCCESS']
    );

    return { id: userId, message: 'User updated successfully' };
  } catch (error) {
    console.error('Error updating user:', error.message);
    if (error.status) throw error;
    throw {
      status: 500,
      message: 'Error updating user',
      error: error.message
    };
  }
}

/**
 * Obtener estadísticas
 */
export async function getSystemStats() {
  try {
    const db = getDB();

    const totalUsers = await db.get('SELECT COUNT(*) AS count FROM Usuarios');
    const revokedTokens = await db.get('SELECT COUNT(*) AS count FROM RevokedTokens');
    const recentOperations = await db.get('SELECT COUNT(*) AS count FROM OperationLogs WHERE created_at >= datetime("now", "-24 hours")');

    return {
      total_users: totalUsers?.count || 0,
      revoked_tokens: revokedTokens?.count || 0,
      operations_24h: recentOperations?.count || 0,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error getting system stats:', error.message);
    return {
      total_users: 0,
      revoked_tokens: 0,
      operations_24h: 0,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Eliminar usuario (soft delete)
 */
export async function deleteUser(userId) {
  try {
    const db = getDB();

    const result = await db.run(
      'DELETE FROM Usuarios WHERE id = ?',
      [userId]
    );

    if (result.changes === 0) {
      throw { status: 404, message: 'User not found' };
    }

    // Log
    await db.run(
      'INSERT INTO OperationLogs (operation, entity_type, entity_id, status) VALUES (?, ?, ?, ?)',
      ['DELETE', 'USER', userId, 'SUCCESS']
    );

    return { message: 'User deleted successfully' };
  } catch (error) {
    console.error('Error deleting user:', error.message);
    if (error.status) throw error;
    throw {
      status: 500,
      message: 'Error deleting user',
      error: error.message
    };
  }
}
