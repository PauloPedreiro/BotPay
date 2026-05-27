import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import config from '../config.js';

function getNgrokPath() {
  // 1. Testar se 'ngrok' está disponível globalmente no PATH do sistema
  try {
    execSync('ngrok --version', { stdio: 'ignore' });
    return 'ngrok';
  } catch (err) {
    // Ignora e tenta os caminhos locais
  }

  // 2. Verificar se o ngrok.exe está na pasta raiz do projeto (process.cwd())
  const localPath = path.join(process.cwd(), 'ngrok.exe');
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // 3. Obter dinamicamente a pasta de usuário do Windows para verificar o WinGet
  if (process.env.USERPROFILE) {
    const wingetPath = path.join(
      process.env.USERPROFILE,
      'AppData',
      'Local',
      'Microsoft',
      'WinGet',
      'Packages',
      'Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'ngrok.exe'
    );
    if (fs.existsSync(wingetPath)) {
      return wingetPath;
    }
  }

  // 4. Se não encontrado, tentar instalar automaticamente usando o WinGet do Windows
  console.log('[Ngrok] Executável não encontrado no sistema. Tentando instalar automaticamente via WinGet...');
  try {
    execSync('winget install --accept-source-agreements --accept-package-agreements ngrok.ngrok', { stdio: 'inherit' });
    console.log('[Ngrok] Instalação concluída via WinGet com sucesso!');
    
    // Tenta obter o caminho após a instalação concluída
    if (process.env.USERPROFILE) {
      const wingetPath = path.join(
        process.env.USERPROFILE,
        'AppData',
        'Local',
        'Microsoft',
        'WinGet',
        'Packages',
        'Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe',
        'ngrok.exe'
      );
      if (fs.existsSync(wingetPath)) {
        return wingetPath;
      }
    }
  } catch (err) {
    console.error('[Ngrok] Não foi possível instalar automaticamente via WinGet:', err.message);
    console.log('[Ngrok] Caso ocorra erro, baixe o ngrok.exe manualmente e coloque na mesma pasta deste executável.');
  }

  // Fallback padrão
  return 'ngrok';
}

/**
 * Inicializa automaticamente o túnel do Ngrok se a chave NGROK_AUTHTOKEN estiver configurada.
 * Atualiza dinamicamente o config.BASE_URL para a URL pública gerada.
 * 
 * @returns {Promise<string|null>} A URL pública do túnel ou null
 */
export async function initNgrok() {
  const token = config.NGROK_AUTHTOKEN;
  if (!token || token.trim() === '' || token.includes('INSIRA_')) {
    console.log('[Ngrok] Token não configurado ou vazio no config.json. Pulando inicialização automática do túnel.');
    return null;
  }

  const ngrokBin = getNgrokPath();
  const port = config.PORT || 3000;

  console.log(`[Ngrok] Usando executável: ${ngrokBin}`);

  // Tentar atualizar o Ngrok automaticamente antes de iniciar para evitar problemas de versão obsoleta
  try {
    console.log('[Ngrok] Verificando e aplicando atualizações do executável...');
    execSync(`"${ngrokBin}" update`, { stdio: 'ignore' });
  } catch (err) {
    // Ignora se houver algum erro ou se já estiver na última versão
  }

  console.log(`[Ngrok] Configurando authtoken...`);
  try {
    // Configura o token de autenticação no arquivo do ngrok
    execSync(`"${ngrokBin}" config add-authtoken ${token}`, { stdio: 'ignore' });
  } catch (err) {
    console.error('[Ngrok] Erro ao configurar o authtoken:', err.message);
    return null;
  }

  console.log(`[Ngrok] Iniciando túnel na porta ${port}...`);
  // Inicia o ngrok em segundo plano (background)
  const ngrokProcess = spawn(ngrokBin, ['http', port.toString()]);

  // Capturar logs e erros do processo do ngrok para debug
  ngrokProcess.stdout.on('data', (data) => {
    console.log(`[Ngrok Process Out] ${data.toString().trim()}`);
  });

  ngrokProcess.stderr.on('data', (data) => {
    console.error(`[Ngrok Process Err] ${data.toString().trim()}`);
  });

  ngrokProcess.on('error', (err) => {
    console.error('[Ngrok] Falha crítica ao iniciar o executável do Ngrok:', err.message);
  });

  ngrokProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[Ngrok] O processo do Ngrok encerrou inesperadamente com código ${code}`);
    }
  });

  // Garante que o processo do ngrok morre junto com o bot
  process.on('exit', () => ngrokProcess.kill());
  process.on('SIGINT', () => {
    ngrokProcess.kill();
    process.exit();
  });

  // Aguardar o túnel inicializar e consultar a API HTTP local do Ngrok (porta 4040)
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    try {
      const res = await fetch('http://127.0.0.1:4040/api/tunnels');
      if (res.ok) {
        const data = await res.json();
        const publicUrl = data.tunnels?.[0]?.public_url;
        if (publicUrl) {
          console.log('\x1b[32m%s\x1b[0m', `==================================================`);
          console.log('\x1b[32m%s\x1b[0m', `[Ngrok] Túnel criado com sucesso!`);
          console.log('\x1b[32m%s\x1b[0m', `[Ngrok] URL Pública: ${publicUrl}`);
          console.log('\x1b[32m%s\x1b[0m', `==================================================`);
          config.BASE_URL = publicUrl;
          return publicUrl;
        }
      }
    } catch (err) {
      // Ignorar erros de conexão recusada enquanto o ngrok está inicializando
    }
  }

  console.error('[Ngrok] Não foi possível obter a URL pública do túnel após 10 segundos.');
  return null;
}
