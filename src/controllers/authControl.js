// Controlador de autenticación para manejar el registro e inicio de sesión de usuarios
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getUserbyUsername, createUser, revokeToken } from '../models/user.js';
import config from 'config';

// Función para manejar el registro de un nuevo usuario
export async function register(request, reply) {
    const { username, email, password } = request.body;

    if (!username || !email || !password) {
        return reply.code(400).send({ message: 'Faltan campos obligatorios: username, email y password.' });
    }

    try {
        const existingUser = await getUserbyUsername(username);
        if (existingUser) {
            return reply.code(400).send({ message: 'El nombre de usuario ya está en uso' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await createUser(username, email, hashedPassword);
        return reply.code(201).send({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        console.error('Error al registrar usuario:', error);
        return reply.code(500).send({ message: 'Error interno del servidor' });
    }
}

// Función para manejar el inicio de sesión de un usuario
export async function login(request, reply) {
    const { username, password } = request.body;

    if (!username || !password) {
        return reply.code(400).send({ message: 'Faltan campos obligatorios: username y password.' });
    }

    try {
        const user = await getUserbyUsername(username);
        if (!user) {
            return reply.code(400).send({ message: 'Credenciales inválidas' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return reply.code(400).send({ message: 'Credenciales inválidas' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, config.get('jwt.secret'), { expiresIn: '1h' });
        return reply.send({ token, user });
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        return reply.code(500).send({ message: 'Error interno del servidor' });
    }
}

// Función para manejar el cierre de sesión
export async function logout(request, reply) {
    const authHeader = request.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            await revokeToken(token);
        } catch (error) {
            console.error('Error al revocar token:', error);
            return reply.code(500).send({ message: 'No se pudo cerrar la sesión correctamente' });
        }
    }

    return reply.send({ message: 'Sesión cerrada' });
}

