const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const https = require("https");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("ERRO: Variável GEMINI_API_KEY não definida!");
    process.exit(1);
}

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

setInterval(() => {
    console.log("Servidor ativo...");
}, 30000);

const historico = {};

app.get("/", (req, res) => {
    res.send("Servidor WebSocket da IA ativo!");
});

wss.on("connection", (ws) => {
    console.log("Minecraft conectado!");

    ws.on("message", async (data) => {
        try {
            const texto = data.toString();
            console.log("📩 PACOTE RECEBIDO:", texto);

            const packet = JSON.parse(texto);

            if (packet.header?.eventName !== "PlayerMessage") return;

            const mensagem =
                packet.body?.message ||
                packet.body?.properties?.Message ||
                "";

            const jogador =
                packet.body?.sender ||
                packet.body?.properties?.Sender ||
                "Jogador";

            if (!mensagem.toLowerCase().startsWith("!ia")) return;

            const pergunta = mensagem.slice(3).trim();
            if (!pergunta) return;

            console.log(`🧠 [${jogador}] perguntou: ${pergunta}`);

            if (!historico[jogador]) historico[jogador] = [];

            historico[jogador].push({
                role: "user",
                parts: [{ text: pergunta }]
            });

            if (historico[jogador].length > 10) {
                historico[jogador] = historico[jogador].slice(-10);
            }

            const resposta = await chamarGemini(historico[jogador]);

            historico[jogador].push({
                role: "model",
                parts: [{ text: resposta }]
            });

            enviarComando(ws, `say §e[IA] §f${resposta}`);

        } catch (e) {
            console.error("💥 Erro:", e);
            enviarComando(ws, `say §c[IA] erro interno`);
        }
    });

    ws.on("close", () => {
        console.log("Minecraft desconectado!");
    });

    ws.send(JSON.stringify({
        header: {
            version: 1,
            requestId: "1",
            messageType: "commandRequest",
            messagePurpose: "subscribe"
        },
        body: {
            eventName: "PlayerMessage"
        }
    }));
});

function enviarComando(ws, comando) {
    ws.send(JSON.stringify({
        header: {
            version: 1,
            requestId: Math.random().toString(),
            messageType: "commandRequest",
            messagePurpose: "commandRequest"
        },
        body: {
            version: 1,
            commandLine: comando,
            origin: { type: "player" }
        }
    }));
}

function chamarGemini(historico) {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            system_instruction: {
                parts: [{
                    text: "Você é uma IA assistente dentro do Minecraft Bedrock. Responda curto e divertido, máximo 2 frases. Não use markdown, asteriscos ou formatação especial!"
                }]
            },
            contents: historico
        });

        const req = https.request({
            hostname: "generativelanguage.googleapis.com",
            path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
            }
        }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    console.log("Resposta Gemini:", data);
                    const texto = json.candidates[0].content.parts[0].text;
                    resolve(texto);
                } catch (e) {
                    console.error("Erro ao parsear:", data);
                    resolve("Erro ao processar resposta!");
                }
            });
        });

        req.on("error", (e) => {
            console.error("Erro de conexão:", e);
            resolve("Erro de conexão com IA!");
        });

        req.write(body);
        req.end();
    });
}
