import config from '../config.js';

/**
 * Determina se o idioma do usuário deve ser Português (PT-BR) ou Inglês (EN-US)
 * Verificando primeiro se o usuário possui cargo de idioma e depois o idioma de exibição do cliente do Discord.
 * 
 * @param {import('discord.js').Interaction} interaction A interação do Discord
 * @returns {boolean} True para PT-BR, False para EN-US
 */
export function getLocaleIsPt(interaction) {
  // 1. Verificar por cargo (se a interação ocorreu dentro do servidor)
  const member = interaction.member;
  if (member && member.roles) {
    if (config.ROLE_ENGLISH_ID && member.roles.cache.has(config.ROLE_ENGLISH_ID)) {
      return false; // É inglês (cargo prioritário)
    }
    if (config.ROLE_PORTUGUESE_ID && member.roles.cache.has(config.ROLE_PORTUGUESE_ID)) {
      return true; // É português (cargo prioritário)
    }
  }

  // 2. Fallback: Verificação pelo locale do aplicativo do Discord do usuário
  return interaction.locale === 'pt-BR';
}
