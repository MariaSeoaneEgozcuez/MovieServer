// Controlador de autenticación para manejar el registro e inicio de sesión de usuarios
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import config from 'config';
import { getUserbyEmail, createUser } from '../models/user.js';

// Función para manejar el registro de un nuevo usuario
export async function register(request, reply) {
    const { name, email, password } = request.body;
    try {
        // Validación básica
        if (!name || !email || !password) {
            return reply.status(400).send({ error: 'Faltan campos requeridos' });
        }

        const existingUser = await getUserbyEmail(email);
        if (existingUser) {
            return reply.status(400).send({ error: 'El email ya está registrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await createUser(name, email, hashedPassword);
        
        return reply.status(201).send({ 
            message: 'Usuario registrado exitosamente', 
            user: { id: newUser.id, name: newUser.username, email: newUser.email } 
        });
    } catch (error) {
        console.error('Error al registrar usuario:', error);
        return reply.status(500).send({ error: 'Error interno del servidor' });
    }
}

// Función para manejar el inicio de sesión de un usuario
export async function login(request, reply) {
    const { email, password } = request.body;
    try {
        // Validación básica
        if (!email || !password) {
            return reply.status(400).send({ error: 'Faltan campos requeridos' });
        }

        const user = await getUserbyEmail(email);
        if (!user) {
            return reply.status(401).send({ error: 'Credenciales inválidas' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return reply.status(401).send({ error: 'Credenciales inválidas' });
        }

        const secret = config.get('jwt.secret');
        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username }, 
            secret, 
            { expiresIn: '24h' }
        );

        return reply.send({ 
            message: 'Inicio de sesión exitoso', 
            token 
        });
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        return reply.status(500).send({ error: 'Error interno del servidor' });
    }
}

