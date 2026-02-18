import { getQuiz } from "../models/ollama/index.js";

export async function llmCall(message) {
    return getMovieRecomendation(message)   
}