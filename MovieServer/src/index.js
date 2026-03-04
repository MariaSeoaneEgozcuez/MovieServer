import { startServer } from "./views/api/index.js"
import dotenv from 'dotenv'

dotenv.config()
await startServer()