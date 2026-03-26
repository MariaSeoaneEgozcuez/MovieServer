// Controlador de autenticación para manejar el registro e inicio de sesión de usuarios
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getUserbyUsername, createUser, revokeToken } from '../models/User.js';
import config from 'config';

// Función para manejar el registro de un nuevo usuario
export async function register(req, res) {
    const { username, email, password } = req.body;
    try {
        const existingUser = await getUserbyUsername(username);
        if (existingUser) {
            return res.status(400).send({ message: 'El nombre de usuario ya está en uso' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await createUser(username, email, hashedPassword);
        res.status(201).send({ message: 'Usuario creado exitosamente' });
    } catch (error) {
        console.error('Error al registrar usuario:', error);
        res.status(500).send({ message: 'Error interno del servidor' });
    }
}

//  Función para manejar el inicio de sesión de un usuario
export async function login(req, res) {
    const { username, password } = req.body;
    try {
        const user = await getUserbyUsername(username);
        if (!user) {
            return res.status(400).send({ message: 'Credenciales inválidas' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).send({ message: 'Credenciales inválidas' });
        }
        const token = jwt.sign({ id: user.id, username: user.username }, config.get('jwt.secret'), { expiresIn: '1h' });
        res.send({ token, user });
    } catch (error) {
        console.error('Error al iniciar sesión:', error);
        res.status(500).send({ message: 'Error interno del servidor' });
    }
}

// Función para manejar el cierre de sesión
export async function logout(req, res) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        await revokeToken(token);
    }
    res.send({ message: 'Sesión cerrada' });
}

