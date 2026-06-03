const WebSocket = require("ws");
const https = require("https");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error("ERRO: Variável OPENAI_API_KEY não definida!");
    process.exit(1);
}

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

console.log(`Servidor WebSocket rodando na porta ${PORT}`);

const historico = {};

wss.on("connection", (ws) => {
    console.log("Minecraft conectado!");

    ws.on("message", async (data) => {
        try {
            const packet = JSON.parse(data);
            if (packet.header?.eventName !== "PlayerMessage") return;

            const mensagem = packet.body?.message || "";
            const jogador = packet.body?.sender || "Jogador";

            if (!mensagem.toLowerCase().startsWith("!ia")) return;

            const pergunta = mensagem.slice(3).trim();
            if (!pergunta) return;

            console.log(`[${jogador}] perguntou: ${pergunta}`);

            if (!historico[jogador]) {
                historico[jogador] = [
                    {
                        role: "system",
                        content: "Você é uma IA assistente dentro do Minecraft Bedrock. Responda de forma curta e divertida, no máximo 2 frases. Não use markdown, asteriscos ou formatação especial!"
                    }
                ];
            }

            historico[jogador].push({
                role: "user",
                content: pergunta
            });

            if (historico[jogador].length > 12) {
                historico[jogador] = [
                    historico[jogador][0],
                    ...historico[jogador].slice(-10)
                ];
            }

            const resposta = await chamarChatGPT(historico[jogador]);

            historico[jogador].push({
                role: "assistant",
                content: resposta
            });

            enviarComando(ws, `say §e[IA] §f${resposta}`);

        } catch (e) {
            console.error("Erro:", e);
        }
    });

    ws.on("close", () => {
        console.log("Minecraft desconectado!");
    });

    const subscribe = {
        header: {
            version: 1,
            requestId: "1",
            messageType: "commandRequest",
            messagePurpose: "subscribe"
        },
        body: {
            eventName: "PlayerMessage"
        }
    };
    ws.send(JSON.stringify(subscribe));
});

function enviarComando(ws, comando) {
    const packet = {
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
    };
    ws.send(JSON.stringify(packet));
}

function chamarChatGPT(mensagens) {
    return new Promise((resolve) => {
        const body = JSON.stringify({
            model: "gpt-4o-mini",
            messages: mensagens,
            max_tokens: 100
        });

        const options = {
            hostname: "api.openai.com",
            path: "/v1/chat/completions",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`,
                "Content-Length": Buffer.byteLength(body)
            }
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => {
                try {
                    const json = JSON.parse(data);
                    const texto = json.choices[0].message.content;
                    resolve(texto);
                } catch (e) {
                    console.error("Erro ao parsear resposta:", data);
                    resolve("Erro ao processar resposta!");
                }
            });
        });

        req.on("error", (e) => {
            console.error("Erro de conexão:", e);
            resolve("Erro de conexão com ChatGPT!");
        });
        req.write(body);
        req.end();
    });
}
