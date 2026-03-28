// src/controllers/models/user.js -- Funciones para interactuar con la base de datos de usuarios
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import config from 'config';

function mapDbUser(user) {
    if (!user) return null;
    return {
        id: user.id ?? user.IDUser ?? user.IDUSER ?? null,
        username: user.username,
        email: user.email,
        password: user.password
    };
}

// Función para buscar un usuario por su nombre de usuario
export async function getUserbyUsername(username) {
    try {
        const db = await open({
            filename: config.get('db.filename'),
            driver: sqlite3.Database
        });
        const user = await db.get('SELECT * FROM Usuarios WHERE username = ?', [username]);
        await db.close();
        return mapDbUser(user);
    } catch (error) {
        console.error('Error buscando usuario:', error);
        return null;
    }
}

// Función para buscar un usuario por su email
export async function getUserbyEmail(email) {
    try {
        const db = await open({
            filename: config.get('db.filename'),
            driver: sqlite3.Database
        });
        const user = await db.get('SELECT * FROM Usuarios WHERE email = ?', [email]);
        await db.close();
        return mapDbUser(user);
    } catch (error) {
        console.error('Error buscando usuario:', error);
        return null;
    }
}

// Función para obtener estadísticas básicas del sistema
export async function getSystemStats() {
    try {
        const db = await open({
            filename: config.get('db.filename'),
            driver: sqlite3.Database
        });
        const totalUsers = await db.get('SELECT COUNT(*) AS totalUsers FROM Usuarios');
        const revokedTokens = await db.get('SELECT COUNT(*) AS revokedTokens FROM RevokedTokens');
        await db.close();
        return {
            total_users: totalUsers?.totalUsers ?? 0,
            revoked_tokens: revokedTokens?.revokedTokens ?? 0
        };
    } catch (error) {
        console.error('Error obteniendo estadísticas del sistema:', error);
        return {
            total_users: 0,
            revoked_tokens: 0
        };
    }
}

// Funcion para crear un nuevo usuario en la base de datos
export async function createUser(username, email, password) {
    const db = await open({
        filename: config.get('db.filename'),
        driver: sqlite3.Database
    });
    const result = await db.run('INSERT INTO Usuarios (username, email, password) VALUES (?, ?, ?)', [username, email, password]);
    await db.close();
    return {
        id: result.lastID,
        username,
        email,
        password
    };
}

// Función para revocar un token
export async function revokeToken(token) {
    try {
        const db = await open({
            filename: config.get('db.filename'),
            driver: sqlite3.Database
        });
        await db.run('INSERT INTO RevokedTokens (token) VALUES (?)', [token]);
        await db.close();
    } catch (error) {
        console.error('Error revocando token:', error);
    }
}

// Función para verificar si un token está revocado
export async function isTokenRevoked(token) {
    try {
        const db = await open({
            filename: config.get('db.filename'),
            driver: sqlite3.Database
        });
        const result = await db.get('SELECT id FROM RevokedTokens WHERE token = ?', [token]);
        await db.close();
        return !!result;
    } catch (error) {
        console.error('Error verificando token:', error);
        return false;
    }
}