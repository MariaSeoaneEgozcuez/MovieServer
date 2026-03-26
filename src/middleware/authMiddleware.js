// Middleware para manejar la autenticación con JWT
import jwt from 'jsonwebtoken';
import { isTokenRevoked } from '../models/User.js';

// Middleware para verificar el token JWT (si existe o si es válido)
export function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Acceso no autorizado' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token inválido' });
        }
        const revoked = await isTokenRevoked(token);
        if (revoked) {
            return res.status(403).json({ message: 'Token revocado' });
        }
        req.user = user;
        next();
    });
}