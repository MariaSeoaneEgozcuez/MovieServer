import Fastify from "fastify"
import { llmCall } from '../../controllers/llm/index.js'
import config from "config"

export async function startServer(){

    const fastify = Fastify()

    // --- RUTAS DE PRUEBA (Hechas por tus compañeros) ---
    fastify.get('/', function (request, reply){
        reply.send('Hola')
    })

    fastify.get('/llm', async function (request, reply){
        let msg = request.query.msg
        let respuesta = await llmCall(msg)
        reply.send(respuesta)
    })
    
    // --- RUTAS PÚBLICAS DE LA API ---

    // Endpoint: Estado del sistema (Público)
    fastify.get('/api/status', async function (request, reply) {
        // Devolvemos un JSON indicando que todo funciona bien
        return {
            status: 'ok',
            message: 'El servidor y la API están funcionando correctamente.',
            timestamp: new Date().toISOString()
        }
    })

    // (Aquí añadiremos más adelante POST /api/auth/register y POST /api/auth/login)

    // --- ARRANQUE DEL SERVIDOR ---
    try{
        // Usa el puerto definido en los archivos de configuración
        const port = config.get('server.port');
        await fastify.listen({ port: port, host: '0.0.0.0' })
        console.log(`Servidor Fastify corriendo en el puerto ${port}`)
    }catch(e){
        console.error('Error Fastify:', e)
        process.exit(1)
    }

}