import jwt from 'jsonwebtoken';
import config from 'config';
import { authService } from '../lib/serviceClient.js';

export async function authenticateToken(request, reply) {
  const authHeader = request.headers['authorization'] || request.headers['Authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return reply.code(401).send({ 
      error: 'Acceso no autorizado - token no proporcionado' 
    });
  }

  try {
    // Validar JWT localmente primero
    const decoded = jwt.verify(token, config.get('jwt.secret'));
    request.user = decoded;

    // Verificar en Auth Service si el token no está revocado
    try {
      const verification = await authService.get('/auth/verify', {
        'Authorization': `Bearer ${token}`
      });
      request.user = verification.user || decoded;
    } catch (error) {
      // Si Auth Service falla, permitir con JWT validado localmente
      console.warn('Auth Service unavailable, using JWT validation', error.message);
    }

  } catch (error) {
    console.error('JWT verification failed:', error.message);
    return reply.code(403).send({ 
      error: 'Token inválido o expirado' 
    });
  }
}

export async function optionalAuth(request, reply) {
  const authHeader = request.headers['authorization'] || request.headers['Authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, config.get('jwt.secret'));
      request.user = decoded;
    } catch (error) {
      // No requerido, continua sin usuario
    }
  }
}