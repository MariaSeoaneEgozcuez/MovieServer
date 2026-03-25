// Middleware para manejar la autenticación con JWT
import jwt from 'jsonwebtoken';
import config from 'config';

// Middleware para verificar el token JWT (si existe o si es válido)
export async function authenticateToken(request, reply) {
    const authHeader = request.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return reply.status(401).send({ error: 'Acceso no autorizado' });
    }

    try {
        const secret = config.get('jwt.secret');
        const user = jwt.verify(token, secret);
        request.user = user;
    } catch (error) {
        return reply.status(403).send({ error: 'Token inválido' });
    }
}