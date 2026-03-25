import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false });
  }
  return socket;
}

/**
 * Conecta ao Socket.io enviando o JWT no handshake para autenticação.
 * O servidor valida o token e só permite join em workspaces autorizados.
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
      autoConnect: false,
      auth: accessToken ? { token: accessToken } : undefined,
    });
  }

  if (!socket.connected) socket.connect();
  socket.emit('join:workspace', workspaceId);
  return socket;
}

export function joinConversation(conversationId: string) {
  getSocket().emit('join:conversation', conversationId);
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
