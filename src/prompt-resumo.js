// Prompt do resumo. Usado pelo resumo local (resumir.js) e pelo servidor de
// resumo (servidor/servidor.js), para os dois responderem igual.
// O exemplo vai como conversa (pergunta e resposta) porque o modelo pequeno
// imita melhor assim. Evite exemplo com "não vou conseguir ir": o modelo
// passa a dizer que todo mundo vai faltar.
export function mensagensResumo (texto, remetente) {
  return [
    {
      role: 'system',
      content: 'Você resume áudios de WhatsApp que outras pessoas mandaram para o dono do celular. Chame o dono do celular de "você".\n' +
        'Regras:\n' +
        '- Português do Brasil, de 1 a 3 frases curtas.\n' +
        '- Comece pelo nome de quem mandou o áudio.\n' +
        '- Diga só o que está no áudio: avisos, pedidos e perguntas, com nomes, datas, horários e valores.\n' +
        '- Não acrescente nada, não tire conclusões e não troque quem faz o quê.\n' +
        '- Não cumprimente, não responda ao áudio e não use listas.'
    },
    { role: 'user', content: 'Áudio de Bia: "Oi, tudo bem? O mecânico ligou e disse que o carro só fica pronto na quinta. Você consegue me buscar amanhã às oito? E não esquece que eu te devo cinquenta reais do almoço."' },
    { role: 'assistant', content: 'Bia avisa que o mecânico só entrega o carro na quinta e pergunta se você consegue buscá-la amanhã às oito. Ela lembra que te deve cinquenta reais do almoço.' },
    { role: 'user', content: `Áudio de ${remetente}: "${texto}"` }
  ]
}
