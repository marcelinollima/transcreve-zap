# Servidor de resumo

Recebe o texto já transcrito no PC do usuário e devolve o resumo. Não recebe
áudio, não grava o texto nem o resumo (o log tem só tamanho, tempo, IP e os 8
primeiros caracteres do id da instalação).

Precisa de Node 20+ e de um `llama-server` (llama.cpp) com o Qwen2.5 3B,
o mesmo modelo do resumo local. Roda em CPU; 4 núcleos e 4 GB de RAM livres bastam
para poucos usuários.

## API

`POST /resumir` com `Authorization: Bearer <id da instalação>` (UUID gerado
pelo PC em `dados\id-instalacao.txt`) e corpo `{"texto": "...", "remetente": "Ana"}`.
Resposta `{"resumo": "..."}`. Erros: 400 (texto vazio ou com mais de 12 mil
caracteres), 401 (id inválido), 403 (bloqueado), 429 (limite por hora),
503 (fila cheia), 502 (llama falhou). `GET /saude` responde `{"ok": true}`.

## Instalar numa VPS com Docker Swarm e Traefik

É como está no ar hoje (Contabo, `144.91.68.29`, stack `transcreve`):
`transcreve_llama` (llama.cpp oficial, 3 CPUs, até 2,8 GB) e `transcreve_resumo`
(`node:20-alpine` rodando `servidor.js`, exposto pelo Traefik com Let's Encrypt).

```bash
mkdir -p /opt/transcreve-zap/{modelos,servidor,src}
cd /opt/transcreve-zap/modelos
curl -L -o qwen2.5-3b-instruct-q4_k_m.gguf   https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf
sha256sum qwen2.5-3b-instruct-q4_k_m.gguf   # 626b4a66...9615c62d

# copie servidor/servidor.js, servidor/stack.yml e src/prompt-resumo.js para as mesmas pastas
cd /opt/transcreve-zap
DOMINIO=resumo.nanx.com.br docker stack deploy -c servidor/stack.yml transcreve
```

O `DOMINIO` precisa já ter DNS apontando para a VPS, senão o Traefik não emite
o certificado. Sem DNS, dá para testar com `resumo.<ip-com-traços>.sslip.io`.
A rede `nanx` em `stack.yml` é a rede do Traefik naquela VPS; troque se for outra.

Atualizar o código: copie o `servidor.js` novo e rode
`docker service update --force transcreve_resumo`.

Para bloquear uma instalação que abusar, acrescente `BLOQUEADOS: "<id>,<id>"`
no `environment` do `resumo` e faça o deploy de novo. Logs:
`docker service logs -f transcreve_resumo`.
