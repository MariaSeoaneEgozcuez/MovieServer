import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import config from 'config';

function mapDbUser(user) {
    if (!user) return null; // Si no se encuentra el usuario, devuelve null
    //
    return {
        id: user.id,
        username: user.username,
        email: user.email
    };
}

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
        email
    };
}

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