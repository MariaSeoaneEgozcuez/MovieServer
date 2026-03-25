// src/controllers/models/user.js -- Funciones para interactuar con la base de datos de usuarios
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

// Función para buscar un usuario por su nombre de usuario
export async function getUserbyUsername(username) {
    const db = await open({
        filename: './bbdd.db',
        driver: sqlite3.Database
    });
    const user = await db.get('SELECT * FROM Usuarios WHERE username = ?', [username]);
    await db.close();
    return user;
}

// Funcion para crear un nuevo usuario en la base de datos
export async function createUser(username, email, password) {
    const db = await open({
        filename: './bbdd.db',
        driver: sqlite3.Database
    });
    const result = await db.run('INSERT INTO Usuarios (username, email, password) VALUES (?, ?, ?)', [username, email, password]);
    await db.close();
    return result;
}