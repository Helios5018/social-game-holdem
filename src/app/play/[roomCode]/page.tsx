import { PlayerRoomClient } from "@/components/table/player-room-client";

export default function PlayerRoomPage({ params }: { params: { roomCode: string } }) {
  return <PlayerRoomClient roomCode={params.roomCode.toUpperCase()} />;
}
