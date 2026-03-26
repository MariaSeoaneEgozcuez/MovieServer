import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import config from 'config';

// Creamos una variable global para almacenar la conexión
let dbInstance;

export async function connectDB() {
    try {
        const dbPath = config.get('db.filename');
        
        // Abrimos la conexión con el archivo SQLite
        dbInstance = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        
        console.log('Conectado a la base de datos SQLite con éxito.');

        // Creamos la tabla de usuarios si no existe
        // Guardaremos el username, email y la contraseña (que luego encriptaremos)
        await dbInstance.exec(`
            CREATE TABLE IF NOT EXISTS Usuarios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        `);
        console.log('Tabla de usuarios verificada/creada.');

    } catch (error) {
        console.error('Error conectando a SQLite:', error.message);
        process.exit(1);
    }
}

// Exportamos esta función para poder pedirle la base de datos desde otros archivos
export function getDB() {
    if (!dbInstance) {
        throw new Error('La base de datos no está inicializada.');
    }
    return dbInstance;
}