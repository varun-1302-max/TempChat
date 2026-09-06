import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { HomeView } from './components/HomeView';
import { ChatRoomView } from './components/ChatRoomView';
import { RoomExpiredView } from './components/RoomExpiredView';
import { JoinPromptModal } from './components/JoinPromptModal';
import { SupabaseConfigModal } from './components/SupabaseConfigModal';
import { ChatService } from './services/chatService';
import type { Room, Participant } from './types';

type AppState = 'home' | 'chat' | 'expired';

export default function App() {
  const [appState, setAppState] = useState<AppState>('home');
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [currentParticipant, setCurrentParticipant] = useState<Participant | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invite link join prompt state
  const [promptToken, setPromptToken] = useState<string | null>(null);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [, setConfigVersion] = useState(0);

  // Extract room token from URL (?room=tc-xxxx-xxxx or #tc-xxxx-xxxx)
  const getUrlRoomToken = (): string | null => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryRoom = urlParams.get('room');
      if (queryRoom) return ChatService.normalizeToken(queryRoom);

      const hash = window.location.hash.trim();
      if (hash) {
        return ChatService.normalizeToken(hash);
      }
    } catch {
      // Fallback
    }
    return null;
  };

  // Inspect URL on initial load and on popstate (browser back/forward)
  const handleUrlRoute = useCallback(async () => {
    const token = getUrlRoomToken();
    if (!token) {
      if (appState !== 'home') {
        setAppState('home');
        setCurrentRoom(null);
        setCurrentParticipant(null);
      }
      return;
    }

    // Verify room validity
    setIsLoading(true);
    setError(null);

    try {
      const room = await ChatService.getRoomByToken(token);
      if (!room) {
        setAppState('expired');
        setIsLoading(false);
        return;
      }

      // Check if session already exists for this room
      const savedSession = sessionStorage.getItem(`tempchat_session_${room.id}`);
      if (savedSession) {
        try {
          const participant = JSON.parse(savedSession) as Participant;
          if (participant && participant.room_id === room.id) {
            setCurrentRoom(room);
            setCurrentParticipant(participant);
            setAppState('chat');
            setIsLoading(false);
            return;
          }
        } catch {
          // Session parse error, proceed to join prompt
        }
      }

      // No session yet: open nickname prompt
      setPromptToken(token);
      setIsLoading(false);
    } catch {
      setAppState('expired');
      setIsLoading(false);
    }
  }, [appState]);

  useEffect(() => {
    void Promise.resolve().then(handleUrlRoute);

    const onPopState = () => {
      void Promise.resolve().then(handleUrlRoute);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleUrlRoute]);

  // Create room action
  const handleCreateRoom = async (nickname: string, durationMinutes: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const { room, participant } = await ChatService.createRoom(nickname, durationMinutes);
      setCurrentRoom(room);
      setCurrentParticipant(participant);
      setAppState('chat');

      // Update URL without page reload
      const newUrl = `${window.location.pathname}?room=${room.room_token}`;
      window.history.pushState(null, '', newUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to create temporary room');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Join room with code or from invite modal
  const handleJoinRoom = async (token: string, nickname?: string) => {
    if (!nickname) {
      // Open modal if nickname wasn't provided directly
      setPromptToken(token);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { room, participant } = await ChatService.joinRoom(token, nickname);
      setCurrentRoom(room);
      setCurrentParticipant(participant);
      setPromptToken(null);
      setAppState('chat');

      // Update URL
      const newUrl = `${window.location.pathname}?room=${room.room_token}`;
      window.history.pushState(null, '', newUrl);
    } catch (err: any) {
      setError(err.message || 'Room not found or expired');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  // Leave room action
  const handleLeaveRoom = async () => {
    if (currentRoom && currentParticipant) {
      await ChatService.leaveRoom(currentRoom, currentParticipant);
    }
    setCurrentRoom(null);
    setCurrentParticipant(null);
    setAppState('home');
    window.history.pushState(null, '', window.location.pathname);
  };

  // Room expired action
  const handleRoomExpired = async () => {
    if (currentRoom) {
      await ChatService.destroyRoom(currentRoom);
    }
    setCurrentRoom(null);
    setCurrentParticipant(null);
    setAppState('expired');
  };

  const handleBackHome = async () => {
    if (currentRoom && currentParticipant) {
      await ChatService.leaveRoom(currentRoom, currentParticipant);
    }
    setAppState('home');
    setCurrentRoom(null);
    setCurrentParticipant(null);
    setPromptToken(null);
    setError(null);
    window.history.pushState(null, '', window.location.pathname);
  };

  return (
    <div className="min-h-screen flex flex-col bg-m3-surface text-m3-on-surface transition-colors duration-200">
      {/* Top Navigation */}
      <Navbar
        onOpenSupabaseModal={() => setShowSupabaseModal(true)}
        onHomeClick={handleBackHome}
      />

      {/* Main Content Areas */}
      <main className="flex-1 flex flex-col">
        {appState === 'home' && (
          <HomeView
            onCreateRoom={handleCreateRoom}
            onJoinRoom={handleJoinRoom}
            isLoading={isLoading}
            error={error}
          />
        )}

        {appState === 'chat' && currentRoom && currentParticipant && (
          <ChatRoomView
            room={currentRoom}
            participant={currentParticipant}
            onLeaveRoom={handleLeaveRoom}
            onRoomExpired={handleRoomExpired}
          />
        )}

        {appState === 'expired' && (
          <RoomExpiredView onBackHome={handleBackHome} />
        )}
      </main>

      {/* Join Prompt Modal (when arriving with direct ?room= link) */}
      {promptToken && (
        <JoinPromptModal
          roomToken={promptToken}
          isLoading={isLoading}
          error={error}
          onJoin={(nick) => handleJoinRoom(promptToken, nick)}
          onCancel={() => {
            setPromptToken(null);
            handleBackHome();
          }}
        />
      )}

      {/* Supabase Configuration Modal */}
      {showSupabaseModal && (
        <SupabaseConfigModal
          onClose={() => setShowSupabaseModal(false)}
          onConfigSaved={() => setConfigVersion(v => v + 1)}
        />
      )}
    </div>
  );
}
