import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false });
  }
  return socket;
}

export function connectSocket(workspaceId: string) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit('join:workspace', workspaceId);
  return s;
}

export function joinConversation(conversationId: string) {
  getSocket().emit('join:conversation', conversationId);
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
