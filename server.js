const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const https = require("https");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error("ERRO: Variável OPENAI_API_KEY não definida!");
    process.exit(1);
}

const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
    console.log(`Servidor rodando com WSS na porta ${PORT}`);
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
                packet.body?.sender?.name ||
                packet.body?.properties?.Sender ||
                "Jogador";

            if (!mensagem.toLowerCase().startsWith("!ia")) return;

            const pergunta = mensagem.slice(3).trim();
            if (!pergunta) return;

            console.log(`🧠 [${jogador}] perguntou: ${pergunta}`);

            if (!historico[jogador]) {
                historico[jogador] = [
                    {
                        role: "system",
                        content:
                            "Você é uma IA assistente dentro do Minecraft Bedrock. Responda curto e divertido, máximo 2 frases."
                    }
                ];
            }

            historico[jogador].push({
                role: "user",
                content: pergunta
            });

            const resposta = await chamarChatGPT(historico[jogador]);

            if (!resposta) {
                enviarComando(ws, `say §c[IA] erro ao responder`);
                return;
            }

            historico[jogador].push({
                role: "assistant",
                content: resposta
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

function chamarChatGPT(mensagens) {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            model: "gpt-4o-mini",
            messages: mensagens,
            max_tokens: 100
        });

        const req = https.request({
            hostname: "api.openai.com",
            path: "/v1/chat/completions",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`,
                "Content-Length": Buffer.byteLength(body)
            }
        }, (res) => {
            let data = "";

            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.choices?.[0]?.message?.content || "Sem resposta");
                } catch {
                    resolve("Erro ao processar resposta!");
                }
            });
        });

        req.on("error", () => {
            resolve("Erro de conexão com IA!");
        });

        req.write(body);
        req.end();
    });
}
