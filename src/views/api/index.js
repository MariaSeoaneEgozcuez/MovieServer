import Fastify from "fastify";
import { llmCall } from '../../controllers/llm/index.js';
import config from "config";
import { connectDB } from '../../models/db.js';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { register, login, logout } from '../../controllers/authControl.js'
import { authenticateToken } from '../../middleware/authMiddleware.js';
import { getSystemStats } from '../../models/user.js';

export async function startServer() {
    const fastify = Fastify();

    // Conectar base de datos primero
    try {
        await connectDB();
    } catch (e) {
        console.error('Error conectando BD:', e);
        process.exit(1);
    }

    // ==========================================
    // 0. HABILITAR CORS (para que el frontend pueda conectarse)
    // ==========================================
    await fastify.register(fastifyCors, {
        origin: true,
        credentials: true
    });

    // ==========================================
    // 1. CONFIGURACIÓN DE SWAGGER Y JWT
    // ==========================================
    await fastify.register(fastifySwagger, {
        openapi: {
            info: {
                title: 'MovieServer API',
                description: 'Documentación interactiva de nuestra API.',
                version: '1.0.0'
            }
        }
    });

    await fastify.register(fastifySwaggerUi, {
        routePrefix: '/api/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: false
        }
    });

    fastify.register(fastifyJwt, {
        secret: config.get('jwt.secret')
    });

    fastify.setErrorHandler((error, request, reply) => {
        console.error('Unhandled error:', error);
        const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
        const message = statusCode === 500 ? 'Error interno del servidor' : error.message;
        reply.code(statusCode).send({ error: message });
    });

    // ==========================================
    // 2. RUTAS DE TUS COMPAÑEROS
    // ==========================================
    fastify.get('/', function (request, reply) {
        reply.send('Hola');
    });

    fastify.get('/llm', async function (request, reply) {
        let msg = request.query.msg;
        let respuesta = await llmCall(msg);
        reply.send(respuesta);
    });
    
    // REVISAR SI SE HACE ASI PARA TELEGRAM
    fastify.get('/api/telegram', async function (request, reply) {
        return { status: "success", message: "¡Bienvenido a la API de Telegram!" };
    });

    // ==========================================
    // 3. TU PARTE: API REST PROPIA (Actividad 3.4)
    // ==========================================
    fastify.get('/api/status', async function (request, reply) {
        return { status: 'ok', message: 'El servidor funciona correctamente.' };
    });

    fastify.post('/api/query', {
        schema: {
            body: {
                type: 'object',
                required: ['query'],
                properties: {
                    query: { type: 'string', minLength: 1 }
                }
            }
        },
        preHandler: authenticateToken
    }, async function (request, reply) {
        try {
            const respuestaIA = await llmCall(request.body.query);
            return { success: true, data: respuestaIA };
        } catch (error) {
            console.error('Error en /api/query:', error);
            return reply.code(500).send({ error: "Error en la IA" });
        }
    });

    fastify.get('/api/stats', async function (request, reply) {
        try {
            const stats = await getSystemStats();
            return {
                status: "success",
                stats
            };
        } catch (error) {
            console.error('Error en /api/stats:', error);
            return reply.code(500).send({ error: 'No se pudieron obtener las estadísticas del sistema' });
        }
    });

    fastify.post('/api/external', {
        schema: {
            body: {
                type: 'object',
                required: ['solicitud'],
                properties: {
                    solicitud: { type: 'string', minLength: 1 }
                }
            }
        }
    }, async function (request, reply) {
        try {
            const respuestaIA = await llmCall(request.body.solicitud);
            return { origen: "MovieServer", respuesta: respuestaIA };
        } catch (error) {
            console.error('Error en /api/external:', error);
            return reply.code(500).send({ error: "Fallo en el servicio externo" });
        }
    });

    // ==========================================
    // 4. AUTENTICACIÓN Y JWT (Actividad 3.2)
    // ==========================================
    fastify.post('/api/auth/register', {
        schema: {
            body: {
                type: 'object',
                required: ['username', 'email', 'password'],
                properties: {
                    username: { type: 'string', minLength: 3 },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 }
                }
            }
        }
    }, register);
    fastify.post('/api/auth/login', {
        schema: {
            body: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                    username: { type: 'string', minLength: 3 },
                    password: { type: 'string', minLength: 6 }
                }
            }
        }
    }, login);
    fastify.get('/api/auth/verify', {
        preHandler: authenticateToken
    }, async function (request, reply) {
        return {
            valid: true,
            user: request.user
        };
    });

    fastify.post('/api/auth/logout', {
        preHandler: authenticateToken
    }, logout);

    // ==========================================
    // 5. ARRANQUE DEL SERVIDOR
    // ==========================================
    try {
        const port = config.get('server.port');
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`Servidor Fastify corriendo en el puerto ${port}`);
    } catch (e) {
        console.error('Error Fastify:', e);
        process.exit(1);
    }
}