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

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false });
  }
  return socket;
}

/**
 * Conecta ao Socket.io enviando o JWT no handshake para autenticação.
 * Re-entra automaticamente nas rooms após reconexão.
 */
export function connectSocket(workspaceId: string, accessToken?: string) {
  // Se já tem socket mas o token mudou, reconecta
  if (socket && accessToken) {
    const currentToken = socket.auth && (socket.auth as Record<string, string>).token;
    if (currentToken !== accessToken) {
      socket.disconnect();
      socket = null;
    }
  }

  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect:   false,
      reconnection:  true,
      reconnectionAttempts: Infinity,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 10000,
      auth: accessToken ? { token: accessToken } : undefined,
    });
    // Re-join rooms every time the socket connects (initial + after reconnect)
    socket.on('connect', rejoinRooms);
  }

  _workspaceId = workspaceId;

  if (!socket.connected) socket.connect();
  socket.emit('join:workspace', workspaceId);
  return socket;
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
