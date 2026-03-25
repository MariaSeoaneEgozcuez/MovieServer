// src/controllers/models/user.js -- Funciones para interactuar con la base de datos de usuarios
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import config from 'config';

// Función para buscar un usuario por su nombre de usuario
export async function getUserbyUsername(username) {
    try {
        const db = await open({
            filename: config.get('db.filename'),
            driver: sqlite3.Database
        });
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
        await db.close();
        return user;
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
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        await db.close();
        return user;
    } catch (error) {
        console.error('Error buscando usuario:', error);
        return null;
    }
}

// Funcion para crear un nuevo usuario en la base de datos
export async function createUser(username, email, password) {
    try {
        const db = await open({
            filename: config.get('db.filename'),
            driver: sqlite3.Database
        });
        const result = await db.run(
            'INSERT INTO Usuarios (username, email, password) VALUES (?, ?, ?)', 
            [username, email, password]
        );
        await db.close();
        return { id: result.lastID, username, email };
    } catch (error) {
        console.error('Error creando usuario:', error);
        throw error;
    }
}