import Fastify from "fastify"
import { llmCall } from '../../controllers/llm/index.js'
import config from "config"
import { register, login } from '../../controllers/authControl.js'
import { authenticateToken } from '../../middleware/authMiddleware.js'

export async function startServer(){

    const fastify = Fastify()

    fastify.get('/',function (request, reply){
        reply.send('Hola')
    })
    fastify.get('/llm', {
        preHandler: authenticateToken
    }, async function (request, reply){
        let msg = request.query.msg
        let respuesta = await llmCall(msg)
        return respuesta
    })
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

}