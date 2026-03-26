import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

let socket: Socket | null = null;
let _workspaceId: string | null = null;
let _conversationId: string | null = null;

function rejoinRooms() {
  if (!socket) return;
  if (_workspaceId)    socket.emit('join:workspace',    _workspaceId);
  if (_conversationId) socket.emit('join:conversation', _conversationId);
}

function ensureSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect:          false,
      reconnection:         true,
      reconnectionAttempts: Infinity,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 10000,
    });
    socket.on('connect', rejoinRooms);
  }
  return socket;
}

export function getSocket(): Socket {
  return ensureSocket();
}

/**
 * Conecta ao Socket.io enviando o JWT no handshake para autenticação.
 * Re-entra automaticamente nas rooms após reconexão.
 */
export function connectSocket(workspaceId: string, accessToken?: string) {
  // Garante que o socket existe (com rejoinRooms registrado)
  ensureSocket();

  // Se o token mudou num socket JÁ conectado → reconecta com novo token
  if (accessToken && socket!.connected) {
    const currentToken = (socket!.auth as Record<string, string>)?.token;
    if (currentToken && currentToken !== accessToken) {
      socket!.disconnect();
      socket = null;
      ensureSocket();
    }
  }

  // Injeta o token (seguro fazer antes do primeiro connect, pois autoConnect=false)
  if (accessToken) {
    (socket as any).auth = { token: accessToken };
  }

  _workspaceId = workspaceId;

  if (!socket!.connected) socket!.connect();
  socket!.emit('join:workspace', workspaceId);
  return socket!;
}

export function joinConversation(conversationId: string) {
  _conversationId = conversationId;
  getSocket().emit('join:conversation', conversationId);
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  _workspaceId = null;
  _conversationId = null;
}
