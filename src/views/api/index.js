import Fastify from "fastify";
import { llmCall } from '../../controllers/llm/index.js';
import config from "config";
import { connectDB, getDB } from '../../models/db.js';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import bcrypt from 'bcrypt';
import fastifyJwt from '@fastify/jwt';
import { register, login } from '../../controllers/authControl.js'
import { authenticateToken } from '../../Middleware/authMiddleware.js';

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
                title: 'MovieServer API - Grupo David',
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

    // ==========================================
    // 3. TU PARTE: API REST PROPIA (Actividad 3.4)
    // ==========================================
    fastify.get('/api/status', async function (request, reply) {
        return { status: 'ok', message: 'El servidor funciona correctamente.' };
    });

    fastify.post('/api/query', async function (request, reply) {
        const mensajeUsuario = request.body?.query;
        if (!mensajeUsuario) return reply.status(400).send({ error: "Falta el campo 'query'" });

        try {
            const respuestaIA = await llmCall(mensajeUsuario);
            return { success: true, data: respuestaIA };
        } catch (error) {
            return reply.status(500).send({ error: "Error en la IA" });
        }
    });

    fastify.get('/api/stats', async function (request, reply) {
        return {
            status: "success",
            stats: { total_queries: 150, usuarios_activos: 25 }
        };
    });

    fastify.post('/api/external', async function (request, reply) {
        const peticionExterna = request.body?.solicitud;
        if (!peticionExterna) return reply.status(400).send({ error: "Falta el campo 'solicitud'" });

        try {
            const respuestaIA = await llmCall(peticionExterna);
            return { origen: "MovieServer", respuesta: respuestaIA };
        } catch (error) {
            return reply.status(500).send({ error: "Fallo en el servicio externo" });
        }
    });

    // ==========================================
    // 4. AUTENTICACIÓN Y JWT (Actividad 3.2)
    // ==========================================
    fastify.post('/api/auth/register',register)
    fastify.post('/api/auth/login',login)
    fastify.get('/api/auth/verify', {
        preHandler: authenticateToken
    }, async function (request, reply){
        return {
            valid: true,
            user: request.user
        }
    })

    try{
        await fastify.listen({port: config.get('server.port')})
    }catch(e){
        console.error('Error Fastify:',e)
        process.exit(1)
    }

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