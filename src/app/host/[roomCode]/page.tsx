import { HostRoomClient } from "@/components/table/host-room-client";

export default function HostRoomPage({ params }: { params: { roomCode: string } }) {
  return <HostRoomClient roomCode={params.roomCode.toUpperCase()} />;
}
