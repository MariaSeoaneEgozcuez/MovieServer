// Middleware para manejar la autenticación con JWT
import jwt from 'jsonwebtoken';
import config from 'config';
import { isTokenRevoked } from '../models/user.js';

// Middleware para verificar el token JWT con Fastify
export async function authenticateToken(request, reply) {
    const authHeader = request.headers['authorization'] || request.headers['Authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return reply.code(401).send({ message: 'Acceso no autorizado' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, config.get('jwt.secret'));
    } catch (err) {
        return reply.code(403).send({ message: 'Token inválido' });
    }

    const revoked = await isTokenRevoked(token);
    if (revoked) {
        return reply.code(403).send({ message: 'Token revocado' });
    }

    request.user = decoded;
}