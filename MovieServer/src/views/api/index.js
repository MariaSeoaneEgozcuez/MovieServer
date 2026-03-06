import Fastify from "fastify";
import { llmCall } from '../../controllers/llm/index.js';
import config from "config";
import { connectDB, getDB } from '../../models/db.js';

import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import bcrypt from 'bcrypt';
import fastifyJwt from '@fastify/jwt';

export async function startServer() {
    const fastify = Fastify();

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
    fastify.post('/api/auth/register', async function (request, reply) {
        const { username, email, password } = request.body || {};

        if (!username || !email || !password) {
            return reply.status(400).send({ error: "Faltan datos (username, email, password)." });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const db = getDB();
            
            await db.run(
                `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
                [username, email, hashedPassword]
            );

            return { success: true, message: "Usuario registrado correctamente." };
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                return reply.status(409).send({ error: "El usuario o email ya existe." });
            }
            console.error(error);
            return reply.status(500).send({ error: "Error interno al crear el usuario." });
        }
    });

    fastify.post('/api/auth/login', async function (request, reply) {
        const { email, password } = request.body || {};

        if (!email || !password) {
            return reply.status(400).send({ error: "Faltan datos (email, password)." });
        }

        try {
            const db = getDB();
            const user = await db.get(`SELECT * FROM users WHERE email = ?`, [email]);
            
            if (!user) {
                return reply.status(401).send({ error: "Credenciales inválidas." });
            }

            const contrasenaValida = await bcrypt.compare(password, user.password);
            if (!contrasenaValida) {
                return reply.status(401).send({ error: "Credenciales inválidas." });
            }

            const token = fastify.jwt.sign({ id: user.id, username: user.username });

            return { success: true, message: "Login exitoso", token: token };
        } catch (error) {
            console.error(error);
            return reply.status(500).send({ error: "Error interno durante el login." });
        }
    });

    // ==========================================
    // 5. ARRANQUE DEL SERVIDOR
    // ==========================================
    try {
        await connectDB(); // Conectamos a la base de datos primero
        
        const port = config.get('server.port');
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`🚀 Servidor Fastify corriendo en el puerto ${port}`);
    } catch (e) {
        console.error('Error Fastify:', e);
        process.exit(1);
    }
}